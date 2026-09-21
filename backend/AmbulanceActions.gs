// ═══════════════════════════════════════════════════════════════
//  救護車相關指令：抵達醫院、回待命、車牌驗證、加入案件
// ═══════════════════════════════════════════════════════════════

// 比對救護車主檔的車牌後4碼，正確回傳 {ok:true}，不正確回傳 {error:{...}}
//
// 注意：車輛代碼比對兩邊都要用 String() 轉型再比較。純數字的代碼（例如「91」）
// 經過 Google試算表存格會被自動存成數字型別，前端再把它送回來時（JSON）也會是
// 數字而不是文字，如果只轉型其中一邊，"91"（文字）跟 91（數字）用 === 比較會是
// false，就會誤判成「查無此車輛代碼」。這個坑不只這裡，下面幾個函式也都要注意。
function verifyAmbulancePlate(vehicleCode, plateLast4) {
  const doc = getDoc();
  const sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE);
  if (!sheet) return { error: { status: 'error', code: 'NO_MASTER', message: '找不到救護車主檔。' } };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(vehicleCode)) {
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
    if (String(data[i][0]) === String(payload.vehicleCode)) { found = data[i]; break; }
  }
  if (!found) return { status: 'error', code: 'VEHICLE_NOT_FOUND', message: '救護車主檔查無此車輛代碼。' };

  const displayName = found[2] + ' ' + found[0];
  const ambulance = {
    vehicleCode: String(payload.vehicleCode),
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
      if (String(masterData[i][0]) === String(vehicleCode)) { found = masterData[i]; break; }
    }
    if (!found) {
      skipped.push({ vehicleCode: vehicleCode, reason: '主檔查無此代碼' });
      return;
    }
    const displayName = found[2] + ' ' + found[0];
    const ambulance = {
      vehicleCode: String(vehicleCode), displayName: displayName, status: 'STANDBY',
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

// 前端直接新增一輛救護車到主檔，並立刻加進目前這個案件（現場常常需要臨時登記支援車輛）。
// 車輛代碼是單位原本就有的車籍代碼，需使用者自己輸入（不像醫院ID可以自動編號H001…）。
//
// 車輛代碼只在「同一個單位」內才需要不重複——不同單位各自把自己的車叫「91」是常態
// （消防、衛生、軍方、不同分隊各自編號，本來就會撞號），不應該因此擋下使用者。
// 只有「同一個單位、同一個代碼」才是真的重複，才會拒絕。不同單位代碼相同時，
// 系統會自動在代碼後面加上單位名稱來區分（存到系統裡的識別碼會變成例如「91-乙分隊」，
// 車牌驗證、指派傷患等操作都是用這個識別碼比對，使用者不用自己想辦法避開撞號）。
function createAmbulanceMasterAndAdd(payload) {
  const rawCode = (payload.vehicleCode || '').toString().trim();
  if (!rawCode) return { status: 'error', code: 'INVALID_VEHICLE_CODE', message: '請輸入車輛代碼。' };
  const unitName = (payload.unitName || '').toString().trim();

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE) || ensureAmbulanceMasterSheet(doc);
  const data = masterSheet.getDataRange().getValues();
  const existingCodes = {};
  let sameUnitDuplicate = false;
  for (let i = 1; i < data.length; i++) {
    existingCodes[String(data[i][0])] = true;
    if (String(data[i][0]) === rawCode && String(data[i][2]) === unitName) {
      sameUnitDuplicate = true;
    }
  }
  if (sameUnitDuplicate) {
    return { status: 'error', code: 'DUPLICATE_VEHICLE_CODE', message: '這個單位已經有相同代碼的車輛了，請改用「編輯」修改，或換一個代碼。' };
  }

  let vehicleCode = rawCode;
  if (existingCodes[vehicleCode]) {
    vehicleCode = rawCode + '-' + (unitName || '未命名單位');
    let n = 2;
    while (existingCodes[vehicleCode]) {
      vehicleCode = rawCode + '-' + (unitName || '未命名單位') + n;
      n++;
    }
  }

  masterSheet.appendRow([
    vehicleCode, payload.unitType || '', unitName,
    payload.plateLast4 || '', payload.crew || '', '啟用', '前端新增',
  ]);

  const addRes = addAmbulanceToIncident({
    incidentId: payload.incidentId, vehicleCode: vehicleCode, operatorName: payload.operatorName,
  });
  if (addRes.status === 'success') {
    addRes.assignedVehicleCode = vehicleCode; // 讓前端知道實際存入的代碼是否被自動改過
  }
  return addRes;
}

// 修正救護車主檔資料（單位類別/隊名/車牌後4碼/隨車人員）。注意：已經加入某案件的
// 救護車卡片顯示名稱是加入當下複製的一份快照，修改主檔不會回頭更新已存在的案件紀錄。
function updateAmbulanceMaster(payload) {
  const vehicleCode = payload.vehicleCode;
  if (!vehicleCode) return { status: 'error', code: 'INVALID_VEHICLE_CODE', message: '缺少車輛代碼。' };

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE);
  if (!masterSheet) return { status: 'error', code: 'NO_MASTER', message: '找不到救護車主檔。' };

  const data = masterSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(vehicleCode)) {
      const row = i + 1;
      if (payload.unitType !== undefined) masterSheet.getRange(row, 2).setValue(payload.unitType);
      if (payload.unitName !== undefined) masterSheet.getRange(row, 3).setValue(payload.unitName);
      if (payload.plateLast4 !== undefined) masterSheet.getRange(row, 4).setValue(payload.plateLast4);
      if (payload.crew !== undefined) masterSheet.getRange(row, 5).setValue(payload.crew);
      return { status: 'success' };
    }
  }
  return { status: 'error', code: 'NOT_FOUND', message: '救護車主檔查無此車輛代碼。' };
}
