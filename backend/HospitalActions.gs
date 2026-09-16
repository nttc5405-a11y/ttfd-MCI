// ═══════════════════════════════════════════════════════════════
//  醫院相關指令：加入案件、收治狀態切換（軟提示，不阻擋派遣）
// ═══════════════════════════════════════════════════════════════

const HOSPITAL_STATUSES = ['AVAILABLE', 'LIMITED', 'FULL', 'UNKNOWN'];

function toggleHospitalStatus(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const newStatus = String(payload.newStatus || '').toUpperCase();
  if (HOSPITAL_STATUSES.indexOf(newStatus) === -1) {
    return { status: 'error', code: 'INVALID_STATUS', message: '收治狀態無效。' };
  }

  let found = findBlockRowByKey(sheet, BLOCK.HOSPITAL, 0, payload.hospitalId);
  if (!found) {
    const addRes = addHospitalToIncident(payload);
    if (addRes.status !== 'success') return addRes;
    found = findBlockRowByKey(sheet, BLOCK.HOSPITAL, 0, payload.hospitalId);
  }

  const hospital = hospitalRowToObject(found.rowValues);
  hospital.status = newStatus;
  hospital.updatedAt = new Date();
  updateBlockRow(sheet, BLOCK.HOSPITAL, found.rowIndex, hospitalObjectToRow(hospital));

  appendAuditLog(sheet, payload.operatorName || '', 'TOGGLE_HOSPITAL', payload.hospitalId,
    payload.hospitalId + ' 收治狀態改為 ' + newStatus, {});

  return { status: 'success', data: hospital };
}

// 把主檔中的醫院加入本案件（案件醫院區新增一列，狀態預設UNKNOWN）
function addHospitalToIncident(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  if (findBlockRowByKey(sheet, BLOCK.HOSPITAL, 0, payload.hospitalId)) {
    return { status: 'error', code: 'ALREADY_ADDED', message: '此醫院已在本案件中。' };
  }

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.HOSPITAL);
  if (!masterSheet) return { status: 'error', code: 'NO_MASTER', message: '找不到醫院主檔。' };

  const data = masterSheet.getDataRange().getValues();
  let found = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === payload.hospitalId) { found = data[i]; break; }
  }
  if (!found) return { status: 'error', code: 'HOSPITAL_NOT_FOUND', message: '醫院主檔查無此醫院ID。' };

  const hospital = {
    hospitalId: payload.hospitalId,
    name: found[1],
    status: 'UNKNOWN',
    deliveredCount: 0,
    updatedAt: new Date(),
  };
  appendBlockRow(sheet, BLOCK.HOSPITAL, hospitalObjectToRow(hospital));
  appendAuditLog(sheet, payload.operatorName || '', 'ADD_HOSPITAL', payload.hospitalId, '加入醫院：' + found[1], {});

  return { status: 'success', data: hospital };
}
