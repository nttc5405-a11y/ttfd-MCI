// ═══════════════════════════════════════════════════════════════
//  案件層級：初始化、建立/結案、登入驗證、案件清單
// ═══════════════════════════════════════════════════════════════

// 手動執行一次（或用選單「① 初始化系統」）：建立三個共用主檔分頁
function initializeSpreadsheet() {
  const doc = getDoc();
  ensureAmbulanceMasterSheet(doc);
  ensureHospitalMasterSheet(doc);
  ensureIncidentIndexSheet(doc);

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    '✅ 初始化完成',
    '已建立/確認「救護車主檔」「醫院主檔」「案件清單」三個分頁。\n\n請到「救護車主檔」「醫院主檔」填入實際的救護車與醫院資料（範例列可以刪除）。',
    ui.ButtonSet.OK
  );
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
  const headers = ['案件ID', '顯示名稱', '建立時間', '建立人', '共用驗證碼', '狀態', '結案時間'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#d9ead3');
  sheet.setFrozenRows(1);
  return sheet;
}

function isProtectedSheetName(name) {
  return name === CONFIG.MASTER_SHEETS.AMBULANCE ||
    name === CONFIG.MASTER_SHEETS.HOSPITAL ||
    name === CONFIG.MASTER_SHEETS.INCIDENT_INDEX;
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
