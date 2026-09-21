// ═══════════════════════════════════════════════════════════════
//  大量傷病患管理系統 - Google Apps Script 後端主入口
//  這支後端現在只負責資料 API（Google Sheets 讀寫），不再服務前端頁面——
//  前端是放在 GitHub + Render 上的靜態網站，見 ../frontend 資料夾。
//  部署前請務必修改 CONFIG.API_TOKEN 為自訂密碼，並同步改到
//  frontend/js/config.js 的 APP.Config.API_TOKEN（兩邊要完全一致）。
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // 前端呼叫用的 API Token，只是識別「這是自己人的網頁在呼叫」，
  // 不是傷患資料的存取權限（那個是案件共用驗證碼，見 IncidentActions.gs）
  API_TOKEN: 'DAMS_2026_nttccc5405',

  MASTER_SHEETS: {
    AMBULANCE: '救護車主檔',
    HOSPITAL: '醫院主檔',
    INCIDENT_INDEX: '案件清單',
  },

  INCIDENT_ID_MAX_LEN: 80,
};

function getDoc() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚑 大傷管理')
    .addItem('① 初始化系統（建立/確認主檔分頁）', 'initializeSpreadsheet')
    .addToUi();
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function isTokenValid(token) {
  return typeof token === 'string' && token === CONFIG.API_TOKEN;
}

// ────────────────────────────────────────────────────────────────
// doGet：純 JSON API（前端頁面改由 Render 上的靜態網站提供）
// ────────────────────────────────────────────────────────────────
function doGet(e) {
  resetBlockCache();
  const params = (e && e.parameter) ? e.parameter : {};

  // 無 action 參數：純粹的連線測試文字，方便部署後快速確認網址正確
  if (!params.action) {
    return ContentService
      .createTextOutput('✅ 大傷管理雲端後端：連線成功！這是 API 專用網址，前端請開啟 Render 上的網站。')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  if (!isTokenValid(params.token)) {
    return respond({ status: 'error', code: 'UNAUTHORIZED', message: '存取被拒：Token 不符或缺少。' });
  }

  try {
    switch (params.action) {
      case 'getAmbulanceMaster':
        return respond(getAmbulanceMaster());
      case 'getHospitalMaster':
        return respond(getHospitalMaster());
      case 'getIncidentList':
        return respond(getIncidentList());
      case 'getBoardState':
        return respond(getBoardState(params.incidentId, params.passcode));
      case 'getPatientPhoto':
        return respond(getPatientPhoto(params.incidentId, params.patientId, params.passcode));
      default:
        return respond({ status: 'error', code: 'UNKNOWN_ACTION', message: '不支援的 action: ' + params.action });
    }
  } catch (err) {
    return respond({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  }
}

// ────────────────────────────────────────────────────────────────
// doPost：所有寫入型 API，統一走 LockService 排隊、指令式狀態轉換
// ────────────────────────────────────────────────────────────────
function doPost(e) {
  resetBlockCache();
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ status: 'error', code: 'PARSE_ERROR', message: '無法解析 JSON payload。' });
  }

  if (!isTokenValid(payload.token)) {
    return respond({ status: 'error', code: 'UNAUTHORIZED', message: '存取被拒：Token 不符或缺少。' });
  }

  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(10000);
  if (!gotLock) {
    return respond({ status: 'error', code: 'LOCK_TIMEOUT', message: '伺服器忙碌，請稍後再試一次。' });
  }

  try {
    switch (payload.action) {
      case 'verifyIncidentLogin':
        return respond(verifyIncidentLogin(payload));
      case 'createIncident':
        return respond(createIncident(payload));
      case 'closeIncident':
        return respond(closeIncident(payload));
      case 'createPatient':
        return respond(createPatient(payload));
      case 'retriagePatient':
        return respond(retriagePatient(payload));
      case 'movePatientToAmbulance':
        return respond(movePatientToAmbulance(payload));
      case 'removePatientFromAmbulance':
        return respond(removePatientFromAmbulance(payload));
      case 'dischargePatientFromAmbulance':
        return respond(dischargePatientFromAmbulance(payload));
      case 'moveAmbulanceToHospital':
        return respond(moveAmbulanceToHospital(payload));
      case 'moveAmbulanceToStandby':
        return respond(moveAmbulanceToStandby(payload));
      case 'toggleHospitalStatus':
        return respond(toggleHospitalStatus(payload));
      case 'addAmbulanceToIncident':
        return respond(addAmbulanceToIncident(payload));
      case 'addAmbulancesToIncident':
        return respond(addAmbulancesToIncident(payload));
      case 'addHospitalToIncident':
        return respond(addHospitalToIncident(payload));
      case 'addHospitalsToIncident':
        return respond(addHospitalsToIncident(payload));
      case 'createHospitalMasterAndAdd':
        return respond(createHospitalMasterAndAdd(payload));
      case 'updateHospitalMaster':
        return respond(updateHospitalMaster(payload));
      case 'createAmbulanceMasterAndAdd':
        return respond(createAmbulanceMasterAndAdd(payload));
      case 'updateAmbulanceMaster':
        return respond(updateAmbulanceMaster(payload));
      case 'saveHandover':
        return respond(saveHandover(payload));
      default:
        return respond({ status: 'error', code: 'UNKNOWN_ACTION', message: '不支援的 action: ' + payload.action });
    }
  } catch (err) {
    return respond({ status: 'error', code: 'INTERNAL_ERROR', message: err.message });
  } finally {
    lock.releaseLock();
  }
}
