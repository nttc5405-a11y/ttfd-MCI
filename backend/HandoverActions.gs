// ═══════════════════════════════════════════════════════════════
//  交接單存檔（PDF+簽名）與傷患照片存檔：Google Drive 工具函式
//  Drive 目錄結構：大傷管理／{案件ID}／傷患照片、交接單
// ═══════════════════════════════════════════════════════════════

function getOrCreateDriveFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getOrCreateIncidentRootFolder(incidentId) {
  const root = getOrCreateDriveFolder(DriveApp.getRootFolder(), '大傷管理');
  return getOrCreateDriveFolder(root, incidentId);
}

function getOrCreatePhotoFolder(incidentId) {
  return getOrCreateDriveFolder(getOrCreateIncidentRootFolder(incidentId), '傷患照片');
}

function getOrCreateHandoverFolder(incidentId) {
  return getOrCreateDriveFolder(getOrCreateIncidentRootFolder(incidentId), '交接單');
}

// 存馬賽克處理後的傷患照片（前端保證原始未馬賽克影像不會送到這裡）
function savePhotoToDrive(incidentId, triageId, photoBase64) {
  try {
    const folder = getOrCreatePhotoFolder(incidentId);
    const fileName = triageId + '_' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss') + '.jpg';
    const bytes = Utilities.base64Decode(photoBase64.replace(/^data:image\/\w+;base64,/, ''));
    const blob = Utilities.newBlob(bytes, 'image/jpeg', fileName);
    const file = folder.createFile(blob);
    return { fileId: file.getId(), fileUrl: file.getUrl() };
  } catch (err) {
    return { error: { status: 'error', code: 'PHOTO_SAVE_FAILED', message: '照片存檔失敗：' + err.message } };
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
    const bytes = Utilities.base64Decode(payload.pdfBase64.replace(/^data:application\/pdf;base64,/, ''));
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
