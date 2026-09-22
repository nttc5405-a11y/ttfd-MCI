// ═══════════════════════════════════════════════════════════════
//  交接單存檔（PDF+簽名）與傷患照片存檔：Google Drive 工具函式
//  Drive 目錄結構：大傷管理／{案件ID}／傷患照片、交接單
// ═══════════════════════════════════════════════════════════════

// 效能說明：每次存照片/交接單都要「找資料夾、找不到才建立」，這種
// Drive 資料夾搜尋比 Sheets 讀寫慢很多，而且原本每次都要往下找兩層
// （大傷管理／案件ID／傷患照片 或 交接單），等於每次存檔都做 2~3 次搜尋。
// 這裡把找到的資料夾ID快取起來（同一案件6小時內重複使用同一個ID，
// 剛好涵蓋一場事件的處理時間），之後同一案件的存檔可以直接用ID開資料夾，
// 不用再重新搜尋整個資料夾樹。
function getOrCreateDriveFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getOrCreateCachedFolder(cacheKey, parentFn, name) {
  const cache = CacheService.getScriptCache();
  const cachedId = cache.get(cacheKey);
  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (err) {
      // 快取的ID失效（例如資料夾被手動刪除），退回正常搜尋/建立流程
    }
  }
  const folder = getOrCreateDriveFolder(parentFn(), name);
  cache.put(cacheKey, folder.getId(), 21600); // 6小時
  return folder;
}

function getDamsRootFolder() {
  // 「大傷管理」總資料夾是所有案件共用的同一個，不分案件快取一次就好
  return getOrCreateCachedFolder('folder_dams_root',
    function () { return DriveApp.getRootFolder(); }, '大傷管理');
}

function getOrCreateIncidentRootFolder(incidentId) {
  return getOrCreateCachedFolder('folder_incident_' + incidentId,
    function () { return getDamsRootFolder(); }, incidentId);
}

function getOrCreatePhotoFolder(incidentId) {
  return getOrCreateCachedFolder('folder_photo_' + incidentId,
    function () { return getOrCreateIncidentRootFolder(incidentId); }, '傷患照片');
}

function getOrCreateHandoverFolder(incidentId) {
  return getOrCreateCachedFolder('folder_handover_' + incidentId,
    function () { return getOrCreateIncidentRootFolder(incidentId); }, '交接單');
}

// 存傷患照片。馬賽克是前端的選用步驟（操作人員自行判斷要不要套用，
// 例如臉部已包紮看不到就不需要），這裡單純存前端送來的畫面，不強制要求套過馬賽克。
function savePhotoToDrive(incidentId, triageId, photoBase64) {
  try {
    const folder = getOrCreatePhotoFolder(incidentId);
    const fileName = triageId + '_' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss') + '.jpg';
    const bytes = Utilities.base64Decode(extractBase64Payload(photoBase64));
    const blob = Utilities.newBlob(bytes, 'image/jpeg', fileName);
    const file = folder.createFile(blob);
    return { fileId: file.getId(), fileUrl: file.getUrl() };
  } catch (err) {
    return { error: { status: 'error', code: 'PHOTO_SAVE_FAILED', message: '照片存檔失敗：' + err.message } };
  }
}

// 讀取單一傷患的照片，轉成 data URL 讓前端直接顯示。
// 不開放照片檔案的公開分享連結，一律透過這支API讀取，
// 驗證碼規則跟看板資料的機敏遮蔽規則一致（驗證碼不對就不給看）。
function getPatientPhoto(rawIncidentId, patientId, passcode) {
  const incidentId = sanitizeSheetName(rawIncidentId);
  if (!incidentId) return { status: 'error', code: 'INVALID_INCIDENT_ID', message: '案件編號無效。' };

  if (!isPasscodeValidForIncident(incidentId, passcode)) {
    return { status: 'error', code: 'UNAUTHORIZED', message: '驗證碼不正確，無法讀取照片。' };
  }

  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const found = findBlockRowByKey(sheet, BLOCK.PATIENT, 0, patientId);
  if (!found) return { status: 'error', code: 'PATIENT_NOT_FOUND', message: '找不到此傷患。' };
  const patient = patientRowToObject(found.rowValues);
  if (!patient.photoFileId) return { status: 'error', code: 'NO_PHOTO', message: '此傷患沒有照片。' };

  try {
    const blob = DriveApp.getFileById(patient.photoFileId).getBlob();
    const dataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    return { status: 'success', dataUrl: dataUrl };
  } catch (err) {
    return { status: 'error', code: 'PHOTO_READ_FAILED', message: '讀取照片失敗：' + err.message };
  }
}

// 存交接單 PDF（前端已組好傷患摘要+簽名圖並轉成 PDF base64）
function saveHandover(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  if (!payload.pdfBase64) return { status: 'error', code: 'NO_PDF', message: '缺少交接單PDF資料。' };

  let file;
  try {
    const folder = getOrCreateHandoverFolder(incidentId);
    const fileName = '交接單_' + (payload.ambulanceId || '未知車輛') + '_' +
      Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss') + '.pdf';
    const bytes = Utilities.base64Decode(extractBase64Payload(payload.pdfBase64));
    const blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
    file = folder.createFile(blob);
  } catch (err) {
    return { status: 'error', code: 'PDF_SAVE_FAILED', message: '交接單存檔失敗：' + err.message };
  }

  const patientIds = payload.patientIds || [];
  patientIds.forEach(function (pid) {
    const found = findBlockRowByKey(sheet, BLOCK.PATIENT, 0, pid);
    if (found) {
      const p = patientRowToObject(found.rowValues);
      p.note = (p.note ? p.note + ' / ' : '') + '交接單：' + file.getUrl();
      updateBlockRow(sheet, BLOCK.PATIENT, found.rowIndex, patientObjectToRow(p));
    }
  });

  appendAuditLog(sheet, payload.operatorName || '', 'SAVE_HANDOVER', payload.ambulanceId || '',
    '交接單已存檔（' + patientIds.length + ' 位傷患，護理人員：' + (payload.nurseName || '未填') + '）',
    { fileUrl: file.getUrl() });

  return { status: 'success', fileId: file.getId(), fileUrl: file.getUrl() };
}
