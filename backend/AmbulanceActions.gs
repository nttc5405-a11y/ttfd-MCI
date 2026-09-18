// ═══════════════════════════════════════════════════════════════
//  救護車相關指令：抵達醫院、回待命、車牌驗證、加入案件
// ═══════════════════════════════════════════════════════════════

// 比對救護車主檔的車牌後4碼，正確回傳 {ok:true}，不正確回傳 {error:{...}}
function verifyAmbulancePlate(vehicleCode, plateLast4) {
  const doc = getDoc();
  const sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE);
  if (!sheet) return { error: { status: 'error', code: 'NO_MASTER', message: '找不到救護車主檔。' } };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === vehicleCode) {
      if (String(data[i][3]) === String(plateLast4 || '')) return { ok: true };
      return { error: { status: 'error', code: 'INVALID_PLATE', message: '車牌後4碼不正確，操作已取消。' } };
    }
  }
  return { error: { status: 'error', code: 'VEHICLE_NOT_FOUND', message: '救護車主檔查無此車輛代碼。' } };
}

// 救護車抵達醫院：車上所有傷患自動標記送達＋醫院累加已送達人數
function moveAmbulanceToHospital(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const plateCheck = verifyAmbulancePlate(payload.ambulanceId, payload.plateLast4);
  if (plateCheck.error) return plateCheck.error;

  const ambFound = findBlockRowByKey(sheet, BLOCK.AMBULANCE, 0, payload.ambulanceId);
  if (!ambFound) return { status: 'error', code: 'AMBULANCE_NOT_FOUND', message: '找不到此救護車（請先將車輛加入本案件）。' };
  const ambulance = ambulanceRowToObject(ambFound.rowValues);

  let hospFound = findBlockRowByKey(sheet, BLOCK.HOSPITAL, 0, payload.hospitalId);
  if (!hospFound) {
    const addRes = addHospitalToIncident({
      incidentId: incidentId, hospitalId: payload.hospitalId, operatorName: payload.operatorName,
    });
    if (addRes.status !== 'success') return addRes;
    hospFound = findBlockRowByKey(sheet, BLOCK.HOSPITAL, 0, payload.hospitalId);
  }
  const hospital = hospitalRowToObject(hospFound.rowValues);

  const now = new Date();
  const deliveredPatients = [];
  ambulance.patientIds.forEach(function (pid) {
    const pFound = findBlockRowByKey(sheet, BLOCK.PATIENT, 0, pid);
    if (pFound) {
      const p = patientRowToObject(pFound.rowValues);
      p.status = 'AT_HOSPITAL';
      p.hospitalId = payload.hospitalId;
      updateBlockRow(sheet, BLOCK.PATIENT, pFound.rowIndex, patientObjectToRow(p));
      deliveredPatients.push(p);
    }
  });

  ambulance.status = 'AT_HOSPITAL';
  ambulance.hospitalId = payload.hospitalId;
  ambulance.arrivedAt = now;
  ambulance.updatedAt = now;
  updateBlockRow(sheet, BLOCK.AMBULANCE, ambFound.rowIndex, ambulanceObjectToRow(ambulance));

  hospital.deliveredCount = (Number(hospital.deliveredCount) || 0) + deliveredPatients.length;
  hospital.updatedAt = now;
  updateBlockRow(sheet, BLOCK.HOSPITAL, hospFound.rowIndex, hospitalObjectToRow(hospital));

  appendAuditLog(sheet, payload.operatorName || '', 'ARRIVE_HOSPITAL', payload.ambulanceId,
    payload.ambulanceId + ' 抵達 ' + payload.hospitalId + '，送達 ' + deliveredPatients.length + ' 位傷患', {});

  return { status: 'success', data: { ambulance: ambulance, hospital: hospital, deliveredPatients: deliveredPatients } };
}

// 救護車返回待命：車上仍有傷患時擋下（請先送醫，或用「移除傷患」功能手動清空，例如車輛故障）
function moveAmbulanceToStandby(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const plateCheck = verifyAmbulancePlate(payload.ambulanceId, payload.plateLast4);
  if (plateCheck.error) return plateCheck.error;

  const ambFound = findBlockRowByKey(sheet, BLOCK.AMBULANCE, 0, payload.ambulanceId);
  if (!ambFound) return { status: 'error', code: 'AMBULANCE_NOT_FOUND', message: '找不到此救護車。' };
  const ambulance = ambulanceRowToObject(ambFound.rowValues);

  if (ambulance.patientIds.length > 0) {
    return {
      status: 'error', code: 'PATIENTS_ABOARD',
      message: '車上仍有 ' + ambulance.patientIds.length + ' 位未送達的傷患，請先送醫院，或用「移除傷患」功能清空後再回待命。',
    };
  }

  ambulance.status = 'STANDBY';
  ambulance.hospitalId = '';
  ambulance.arrivedAt = '';
  ambulance.updatedAt = new Date();
  updateBlockRow(sheet, BLOCK.AMBULANCE, ambFound.rowIndex, ambulanceObjectToRow(ambulance));

  appendAuditLog(sheet, payload.operatorName || '', 'RETURN_STANDBY', payload.ambulanceId, payload.ambulanceId + ' 返回待命', {});

  return { status: 'success', data: ambulance };
}

// 把主檔中的救護車加入本案件（案件救護車區新增一列，狀態預設STANDBY）
function addAmbulanceToIncident(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  if (findBlockRowByKey(sheet, BLOCK.AMBULANCE, 0, payload.vehicleCode)) {
    return { status: 'error', code: 'ALREADY_ADDED', message: '此救護車已在本案件中。' };
  }

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE);
  if (!masterSheet) return { status: 'error', code: 'NO_MASTER', message: '找不到救護車主檔。' };

  const data = masterSheet.getDataRange().getValues();
  let found = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === payload.vehicleCode) { found = data[i]; break; }
  }
  if (!found) return { status: 'error', code: 'VEHICLE_NOT_FOUND', message: '救護車主檔查無此車輛代碼。' };

  const displayName = found[2] + ' ' + found[0];
  const ambulance = {
    vehicleCode: payload.vehicleCode,
    displayName: displayName,
    status: 'STANDBY',
    patientIds: [],
    hospitalId: '',
    arrivedAt: '',
    crew: found[4] || '',
    updatedAt: new Date(),
  };
  appendBlockRow(sheet, BLOCK.AMBULANCE, ambulanceObjectToRow(ambulance));
  appendAuditLog(sheet, payload.operatorName || '', 'ADD_AMBULANCE', payload.vehicleCode, '加入救護車：' + displayName, {});

  return { status: 'success', data: ambulance };
}

// 批次加入多輛救護車（勾選清單一次送出，不用一個一個點）
function addAmbulancesToIncident(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const vehicleCodes = payload.vehicleCodes;
  if (!Array.isArray(vehicleCodes) || vehicleCodes.length === 0) {
    return { status: 'error', code: 'NO_ITEMS', message: '請至少勾選一輛救護車。' };
  }

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE);
  if (!masterSheet) return { status: 'error', code: 'NO_MASTER', message: '找不到救護車主檔。' };
  const masterData = masterSheet.getDataRange().getValues();

  const added = [];
  const skipped = [];

  vehicleCodes.forEach(function (vehicleCode) {
    if (findBlockRowByKey(sheet, BLOCK.AMBULANCE, 0, vehicleCode)) {
      skipped.push({ vehicleCode: vehicleCode, reason: '已在本案件中' });
      return;
    }
    let found = null;
    for (let i = 1; i < masterData.length; i++) {
      if (String(masterData[i][0]) === vehicleCode) { found = masterData[i]; break; }
    }
    if (!found) {
      skipped.push({ vehicleCode: vehicleCode, reason: '主檔查無此代碼' });
      return;
    }
    const displayName = found[2] + ' ' + found[0];
    const ambulance = {
      vehicleCode: vehicleCode, displayName: displayName, status: 'STANDBY',
      patientIds: [], hospitalId: '', arrivedAt: '', crew: found[4] || '', updatedAt: new Date(),
    };
    appendBlockRow(sheet, BLOCK.AMBULANCE, ambulanceObjectToRow(ambulance));
    added.push(ambulance);
  });

  if (added.length > 0) {
    appendAuditLog(sheet, payload.operatorName || '', 'ADD_AMBULANCE_BATCH', '',
      '批次加入救護車 ' + added.length + ' 輛：' + added.map(function (a) { return a.vehicleCode; }).join('、'), {});
  }

  return { status: 'success', added: added, skipped: skipped };
}
