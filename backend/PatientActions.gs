// ═══════════════════════════════════════════════════════════════
//  傷患相關指令：建立、重新檢傷、指派/換車、移除
//  這些函式假設呼叫端（doPost）已經取得 LockService 鎖定，不再重複鎖定。
// ═══════════════════════════════════════════════════════════════

const TRIAGE_COLORS = ['RED', 'YELLOW', 'GREEN', 'BLACK'];

function createPatient(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const color = String(payload.triageColor || '').toUpperCase();
  if (TRIAGE_COLORS.indexOf(color) === -1) {
    return { status: 'error', code: 'INVALID_COLOR', message: '檢傷分類顏色無效（須為 RED/YELLOW/GREEN/BLACK）。' };
  }

  const triageId = generateNextTriageId(sheet);
  const now = new Date();

  let photoFileId = '';
  if (payload.photoBase64) {
    const saved = savePhotoToDrive(incidentId, triageId, payload.photoBase64);
    if (saved.error) return saved.error;
    photoFileId = saved.fileId;
  }

  const colorHistory = [{ time: now.toISOString(), color: color, by: payload.operatorName || '' }];

  const patient = {
    triageId: triageId,
    tagNumber: payload.tagNumber || '',
    color: color,
    colorHistory: colorHistory,
    name: payload.name || '',
    gender: payload.gender || '',
    age: payload.age || '',
    createdAt: now,
    triageOfficer: payload.operatorName || '',
    photoFileId: photoFileId,
    status: 'ON_SCENE',
    ambulanceCode: '',
    hospitalId: '',
    note: payload.note || '',
  };

  appendBlockRow(sheet, BLOCK.PATIENT, patientObjectToRow(patient));
  appendAuditLog(sheet, payload.operatorName || '', 'CREATE_PATIENT', triageId,
    '建立傷患：' + color + (payload.tagNumber ? '（貼紙編號 ' + payload.tagNumber + '）' : ''), {});

  return { status: 'success', data: patient };
}

function generateNextTriageId(sheet) {
  const rows = readBlockRows(sheet, BLOCK.PATIENT);
  let maxNum = 0;
  rows.forEach(function (r) {
    const m = String(r[0] || '').match(/^P-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  const next = maxNum + 1;
  return 'P-' + ('000' + next).slice(-3);
}

function retriagePatient(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const newColor = String(payload.newColor || '').toUpperCase();
  if (TRIAGE_COLORS.indexOf(newColor) === -1) {
    return { status: 'error', code: 'INVALID_COLOR', message: '檢傷分類顏色無效。' };
  }

  const found = findBlockRowByKey(sheet, BLOCK.PATIENT, 0, payload.patientId);
  if (!found) return { status: 'error', code: 'PATIENT_NOT_FOUND', message: '找不到此傷患。' };

  const p = patientRowToObject(found.rowValues);
  const oldColor = p.color;
  p.colorHistory.push({ time: new Date().toISOString(), color: newColor, by: payload.operatorName || '' });
  p.color = newColor;

  updateBlockRow(sheet, BLOCK.PATIENT, found.rowIndex, patientObjectToRow(p));
  appendAuditLog(sheet, payload.operatorName || '', 'RETRIAGE', p.triageId,
    p.triageId + ' 從 ' + oldColor + ' 改為 ' + newColor, {});

  return { status: 'success', data: p };
}

// 指派傷患到救護車；若原本已在別輛車上，自動視為換車（從舊車移除）
function movePatientToAmbulance(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const patientFound = findBlockRowByKey(sheet, BLOCK.PATIENT, 0, payload.patientId);
  if (!patientFound) return { status: 'error', code: 'PATIENT_NOT_FOUND', message: '找不到此傷患。' };
  const patient = patientRowToObject(patientFound.rowValues);

  if (patient.status === 'AT_HOSPITAL') {
    return { status: 'error', code: 'ALREADY_DELIVERED', message: '此傷患已送達醫院，無法再指派救護車。' };
  }

  const targetFound = findBlockRowByKey(sheet, BLOCK.AMBULANCE, 0, payload.ambulanceId);
  if (!targetFound) return { status: 'error', code: 'AMBULANCE_NOT_FOUND', message: '找不到此救護車（請先將車輛加入本案件）。' };
  const targetAmbulance = ambulanceRowToObject(targetFound.rowValues);

  if (targetAmbulance.status === 'AT_HOSPITAL') {
    return { status: 'error', code: 'AMBULANCE_AT_HOSPITAL', message: '這輛車已經抵達醫院，無法再指派新傷患，請等它返回現場。' };
  }

  // 決議2：同車已有1位紅色傷患、又要加第2位紅色傷患時，需前端確認
  if (patient.color === 'RED' && !payload.confirmSecondRed) {
    const hasOtherRed = targetAmbulance.patientIds.some(function (pid) {
      if (pid === patient.triageId) return false;
      const f = findBlockRowByKey(sheet, BLOCK.PATIENT, 0, pid);
      return f && patientRowToObject(f.rowValues).color === 'RED';
    });
    if (hasOtherRed) {
      return { status: 'confirm_required', code: 'SECOND_RED_PATIENT', message: '這輛車已經有一位紅色（立即）傷患，確定要同車嗎？' };
    }
  }

  // 換車：若原本指派給別輛車，先從舊車清單移除
  if (patient.ambulanceCode && patient.ambulanceCode !== payload.ambulanceId) {
    const oldFound = findBlockRowByKey(sheet, BLOCK.AMBULANCE, 0, patient.ambulanceCode);
    if (oldFound) {
      const oldAmbulance = ambulanceRowToObject(oldFound.rowValues);
      oldAmbulance.patientIds = oldAmbulance.patientIds.filter(function (pid) { return pid !== patient.triageId; });
      oldAmbulance.updatedAt = new Date();
      updateBlockRow(sheet, BLOCK.AMBULANCE, oldFound.rowIndex, ambulanceObjectToRow(oldAmbulance));
    }
  }

  if (targetAmbulance.patientIds.indexOf(patient.triageId) === -1) {
    targetAmbulance.patientIds.push(patient.triageId);
  }
  if (targetAmbulance.status === 'STANDBY') targetAmbulance.status = 'DISPATCHED';
  targetAmbulance.updatedAt = new Date();
  updateBlockRow(sheet, BLOCK.AMBULANCE, targetFound.rowIndex, ambulanceObjectToRow(targetAmbulance));

  patient.ambulanceCode = payload.ambulanceId;
  patient.status = 'ON_AMBULANCE';
  updateBlockRow(sheet, BLOCK.PATIENT, patientFound.rowIndex, patientObjectToRow(patient));

  appendAuditLog(sheet, payload.operatorName || '', 'MOVE_TO_AMBULANCE', patient.triageId,
    patient.triageId + ' 指派給 ' + payload.ambulanceId, {});

  return { status: 'success', data: { patient: patient, ambulance: targetAmbulance } };
}

// 故障/手動移除：傷患從救護車退回「現場未指派」狀態，可再拖給其他車
function removePatientFromAmbulance(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const patientFound = findBlockRowByKey(sheet, BLOCK.PATIENT, 0, payload.patientId);
  if (!patientFound) return { status: 'error', code: 'PATIENT_NOT_FOUND', message: '找不到此傷患。' };
  const patient = patientRowToObject(patientFound.rowValues);

  if (!patient.ambulanceCode) {
    return { status: 'error', code: 'NOT_ON_AMBULANCE', message: '此傷患目前不在任何救護車上。' };
  }

  const ambFound = findBlockRowByKey(sheet, BLOCK.AMBULANCE, 0, patient.ambulanceCode);
  if (ambFound) {
    const ambulance = ambulanceRowToObject(ambFound.rowValues);
    ambulance.patientIds = ambulance.patientIds.filter(function (pid) { return pid !== patient.triageId; });
    ambulance.updatedAt = new Date();
    updateBlockRow(sheet, BLOCK.AMBULANCE, ambFound.rowIndex, ambulanceObjectToRow(ambulance));
  }

  const wasDelivered = patient.status === 'AT_HOSPITAL';
  patient.ambulanceCode = '';
  patient.hospitalId = ''; // 一併清空，避免變成「狀態是現場、卻還留著醫院ID」的不一致資料
  patient.status = 'ON_SCENE';
  updateBlockRow(sheet, BLOCK.PATIENT, patientFound.rowIndex, patientObjectToRow(patient));

  appendAuditLog(sheet, payload.operatorName || '', 'REMOVE_FROM_AMBULANCE', patient.triageId,
    patient.triageId + (wasDelivered ? ' 移除到院紀錄（更正指派錯誤）' : ' 從救護車移除（故障/手動）'), {});

  return { status: 'success', data: patient };
}
