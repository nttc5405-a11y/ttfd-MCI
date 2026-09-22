// ═══════════════════════════════════════════════════════════════
//  案件層級：初始化、建立/結案、登入驗證、案件清單
// ═══════════════════════════════════════════════════════════════

// 手動執行一次（或用選單「① 初始化系統」）：建立共用主檔分頁
function initializeSpreadsheet() {
  const doc = getDoc();
  ensureAmbulanceMasterSheet(doc);
  ensureHospitalMasterSheet(doc);
  ensureIncidentIndexSheet(doc);
  ensureSystemSettingsSheet(doc);

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    '✅ 初始化完成',
    '已建立/確認「救護車主檔」「醫院主檔」「案件清單」「系統設定」四個分頁。\n\n' +
    '請到「救護車主檔」「醫院主檔」填入實際的救護車與醫院資料（範例列可以刪除）。\n' +
    '要啟用管理員密碼保護，請到「系統設定」分頁「管理員密碼」那一列填入密碼即可，不用改程式碼、不用重新部署。',
    ui.ButtonSet.OK
  );
}

// 系統設定分頁：目前只有「管理員密碼」一項，未來要加其他系統層級設定也可以放這裡，
// 格式是「設定項目｜值」兩欄，用項目名稱查值，不依賴固定列號。
function ensureSystemSettingsSheet(doc) {
  let sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.SYSTEM_SETTINGS);
  if (sheet) return sheet;
  sheet = doc.insertSheet(CONFIG.MASTER_SHEETS.SYSTEM_SETTINGS);
  const headers = ['設定項目', '值', '說明'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#d9ead3');
  sheet.setFrozenRows(1);
  sheet.appendRow(['管理員密碼', '', '留空＝不需要密碼；填值後，建立案件、開關車牌驗證、編輯救護車/醫院主檔都需要輸入這組密碼']);
  return sheet;
}

// 讀「系統設定」分頁裡某個設定項目的值；分頁或項目不存在時回傳空字串。
function getSystemSetting(key) {
  const doc = getDoc();
  const sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.SYSTEM_SETTINGS);
  if (!sheet) return '';
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) return String(data[i][1] || '');
  }
  return '';
}

function ensureAmbulanceMasterSheet(doc) {
  let sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE);
  if (sheet) return sheet;
  sheet = doc.insertSheet(CONFIG.MASTER_SHEETS.AMBULANCE);
  const headers = ['車輛代碼', '所屬單位類別', '單位/隊名', '車牌後4碼', '預設隨車人員', '啟用狀態', '備註'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#d9ead3');
  sheet.setFrozenRows(1);
  sheet.appendRow(['範例-101', '消防', '南區分隊', '1234', '王小明/李小華', '啟用', '範例資料，請自行修改或刪除']);
  return sheet;
}

function ensureHospitalMasterSheet(doc) {
  let sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.HOSPITAL);
  if (sheet) return sheet;
  sheet = doc.insertSheet(CONFIG.MASTER_SHEETS.HOSPITAL);
  const headers = ['醫院ID', '醫院名稱', '地址', '電話', '備註', '啟用狀態'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#d9ead3');
  sheet.setFrozenRows(1);
  sheet.appendRow(['H001', '範例醫院', '台東市範例路1號', '089-000000', '範例資料，請自行修改或刪除', '啟用']);
  return sheet;
}

function ensureIncidentIndexSheet(doc) {
  let sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  if (sheet) return sheet;
  sheet = doc.insertSheet(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  const headers = ['案件ID', '顯示名稱', '建立時間', '建立人', '共用驗證碼', '狀態', '結案時間', '車牌驗證'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#d9ead3');
  sheet.setFrozenRows(1);
  return sheet;
}

// 這個案件送醫/回待命時，是否要求輸入車牌後4碼才能操作（現場自行決定要不要開啟）。
// 讀第8欄（H欄，索引7）；已存在的舊案件分頁沒有這一欄時，值會是空白，
// 一律視為「啟用」（沿用原本一定要驗車牌的行為，不會因為升級而突然變寬鬆）。
function isPlateCheckEnabledForIncident(incidentId) {
  const doc = getDoc();
  const indexSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  if (!indexSheet) return true;
  const data = indexSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(incidentId)) {
      return String(data[i][7] || '') !== '停用';
    }
  }
  return true;
}

// 開啟/關閉本案件的車牌驗證，需要正確的案件共用驗證碼才能改（跟結案一樣，
// 這是會影響所有裝置操作方式的設定，不應該被誤觸就改掉）。
function updatePlateCheckSetting(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  if (!incidentId) return { status: 'error', code: 'INVALID_INCIDENT_ID', message: '案件編號無效。' };

  const doc = getDoc();
  const indexSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  if (!indexSheet) return { status: 'error', code: 'NO_INDEX', message: '找不到案件清單分頁。' };

  const data = indexSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === incidentId) {
      const storedCode = String(data[i][4] || '');
      if (storedCode !== String(payload.passcode || '')) {
        return { status: 'error', code: 'INVALID_PASSCODE', message: '驗證碼錯誤，無法修改設定。' };
      }
      if (!isAdminPasswordValid(payload.adminPassword)) {
        return { status: 'error', code: 'ADMIN_PASSWORD_REQUIRED', message: '管理員密碼錯誤，無法修改設定。' };
      }
      const enabled = !!payload.enabled;
      indexSheet.getRange(i + 1, 8).setValue(enabled ? '啟用' : '停用');
      const sheet = doc.getSheetByName(incidentId);
      if (sheet) {
        appendAuditLog(sheet, payload.operatorName || '', 'UPDATE_PLATE_CHECK', incidentId,
          '車牌驗證設定改為：' + (enabled ? '啟用' : '停用'), {});
      }
      return { status: 'success', plateCheckEnabled: enabled };
    }
  }
  return { status: 'error', code: 'INCIDENT_NOT_FOUND', message: '找不到此案件。' };
}

function isProtectedSheetName(name) {
  return name === CONFIG.MASTER_SHEETS.AMBULANCE ||
    name === CONFIG.MASTER_SHEETS.HOSPITAL ||
    name === CONFIG.MASTER_SHEETS.INCIDENT_INDEX ||
    name === CONFIG.MASTER_SHEETS.SYSTEM_SETTINGS;
}

// 登入：比對案件共用驗證碼
function verifyIncidentLogin(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  if (!incidentId) return { status: 'error', code: 'INVALID_INCIDENT_ID', message: '案件編號無效。' };

  const doc = getDoc();
  const indexSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  if (!indexSheet) return { status: 'error', code: 'NO_INDEX', message: '找不到案件清單分頁，請先執行系統初始化。' };

  const data = indexSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === incidentId) {
      const storedCode = String(data[i][4] || '');
      if (storedCode !== '' && storedCode === String(payload.passcode || '')) {
        return { status: 'success', incidentId: incidentId, operatorName: payload.operatorName || '' };
      }
      return { status: 'error', code: 'INVALID_PASSCODE', message: '驗證碼錯誤。' };
    }
  }
  return { status: 'error', code: 'INCIDENT_NOT_FOUND', message: '找不到此案件。' };
}

// 建立新案件：新增一個分頁並寫入四個區塊的表頭
function createIncident(payload) {
  if (!isAdminPasswordValid(payload.adminPassword)) {
    return { status: 'error', code: 'ADMIN_PASSWORD_REQUIRED', message: '管理員密碼錯誤，無法建立案件。' };
  }
  const rawName = (payload.incidentName || '').toString().trim();
  if (!rawName) return { status: 'error', code: 'INVALID_NAME', message: '請輸入案件名稱。' };
  if (!payload.passcode) return { status: 'error', code: 'PASSCODE_REQUIRED', message: '請設定本案件的共用驗證碼。' };

  const incidentId = sanitizeSheetName(
    Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss') + '_' + rawName
  );
  if (!incidentId) return { status: 'error', code: 'INVALID_NAME', message: '案件名稱無效。' };

  const doc = getDoc();
  if (isProtectedSheetName(incidentId) || doc.getSheetByName(incidentId)) {
    return { status: 'error', code: 'DUPLICATE', message: '此案件分頁已存在或名稱衝突，請換一個名稱再試一次。' };
  }

  const sheet = doc.insertSheet(incidentId);
  ensureSheetHasColumns(sheet, BLOCK.AUDIT.anchorCol + BLOCK.AUDIT.width - 1);
  writeBlockHeader(sheet, BLOCK.PATIENT, PATIENT_HEADERS);
  writeBlockHeader(sheet, BLOCK.AMBULANCE, AMBULANCE_HEADERS);
  writeBlockHeader(sheet, BLOCK.HOSPITAL, HOSPITAL_HEADERS);
  writeBlockHeader(sheet, BLOCK.AUDIT, AUDIT_HEADERS);
  sheet.setFrozenRows(1);

  const indexSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX) || ensureIncidentIndexSheet(doc);
  indexSheet.appendRow([incidentId, rawName, new Date(), payload.creatorName || '', payload.passcode, '進行中', '']);

  appendAuditLog(sheet, payload.creatorName || '', 'CREATE_INCIDENT', incidentId, '建立案件：' + rawName, {});

  // 強制把這個分頁的新增/寫入確實送出，降低前端緊接著操作（例如馬上加入醫院）
  // 時查不到這個分頁的機率（另有 getIncidentSheetOrError 的重試機制做第二層保障）
  SpreadsheetApp.flush();

  return { status: 'success', incidentId: incidentId, displayName: rawName };
}

// 結案：需要驗證碼；MVP 版本不做審核流程，單純標記狀態
function closeIncident(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  if (!incidentId) return { status: 'error', code: 'INVALID_INCIDENT_ID', message: '案件編號無效。' };

  const doc = getDoc();
  const indexSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  if (!indexSheet) return { status: 'error', code: 'NO_INDEX', message: '找不到案件清單分頁。' };

  const data = indexSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === incidentId) {
      const storedCode = String(data[i][4] || '');
      if (storedCode !== String(payload.passcode || '')) {
        return { status: 'error', code: 'INVALID_PASSCODE', message: '驗證碼錯誤，無法結案。' };
      }
      indexSheet.getRange(i + 1, 6).setValue('已結案');
      indexSheet.getRange(i + 1, 7).setValue(new Date());
      const sheet = doc.getSheetByName(incidentId);
      if (sheet) appendAuditLog(sheet, payload.operatorName || '', 'CLOSE_INCIDENT', incidentId, '案件結案', {});
      return { status: 'success', incidentId: incidentId };
    }
  }
  return { status: 'error', code: 'INCIDENT_NOT_FOUND', message: '找不到此案件。' };
}

// 讀取「進行中」的案件清單（不含驗證碼欄位）
function getIncidentList() {
  const doc = getDoc();
  const indexSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  if (!indexSheet) return { status: 'success', data: [] };

  const data = indexSheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    if (!id) continue;
    if (String(data[i][5]) === '進行中') {
      list.push({ incidentId: id, displayName: data[i][1], createdAt: data[i][2] });
    }
  }
  return { status: 'success', data: list };
}
