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

// 從「本案件」移除一間醫院（不影響醫院主檔，下次還能再加回來）。
// 已經送達過傷患，或目前還有救護車停在這間醫院（還沒返回現場），都拒絕移除——
// 這些是已經發生、有紀錄意義的資料，移除會讓「送達醫院ID」或「目前醫院ID」
// 變成查無對應醫院的孤兒資料，後續醫院總覽、交接單都會對不起來。
function removeHospitalFromIncident(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const found = findBlockRowByKey(sheet, BLOCK.HOSPITAL, 0, payload.hospitalId);
  if (!found) return { status: 'error', code: 'HOSPITAL_NOT_FOUND', message: '找不到此醫院。' };
  const hospital = hospitalRowToObject(found.rowValues);

  if (Number(hospital.deliveredCount) > 0) {
    return {
      status: 'error', code: 'HAS_DELIVERIES',
      message: '這間醫院已送達過 ' + hospital.deliveredCount + ' 位傷患，為保留紀錄無法從本案件移除。',
    };
  }

  const ambulanceRows = readBlockRows(sheet, BLOCK.AMBULANCE);
  const stillThere = ambulanceRows.some(function (row) {
    const a = ambulanceRowToObject(row);
    return a.status === 'AT_HOSPITAL' && String(a.hospitalId) === String(payload.hospitalId);
  });
  if (stillThere) {
    return { status: 'error', code: 'AMBULANCE_STILL_THERE', message: '目前還有救護車停在這間醫院，請先讓車輛返回現場，才能移除這間醫院。' };
  }

  deleteBlockRow(sheet, BLOCK.HOSPITAL, found.rowIndex);
  appendAuditLog(sheet, payload.operatorName || '', 'REMOVE_HOSPITAL', payload.hospitalId,
    hospital.name + ' 已從本案件移除', {});

  return { status: 'success' };
}

// 把主檔中的醫院加入本案件（案件醫院區新增一列，狀態預設「可收治」）
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
    if (String(data[i][0]) === String(payload.hospitalId)) { found = data[i]; break; }
  }
  if (!found) return { status: 'error', code: 'HOSPITAL_NOT_FOUND', message: '醫院主檔查無此醫院ID。' };

  const hospital = {
    hospitalId: payload.hospitalId,
    name: found[1],
    status: 'AVAILABLE',
    deliveredCount: 0,
    updatedAt: new Date(),
  };
  appendBlockRow(sheet, BLOCK.HOSPITAL, hospitalObjectToRow(hospital));
  appendAuditLog(sheet, payload.operatorName || '', 'ADD_HOSPITAL', payload.hospitalId, '加入醫院：' + found[1], {});

  return { status: 'success', data: hospital };
}

// 批次加入多間醫院（勾選清單一次送出，不用一個一個點）
function addHospitalsToIncident(payload) {
  const incidentId = sanitizeSheetName(payload.incidentId);
  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const hospitalIds = payload.hospitalIds;
  if (!Array.isArray(hospitalIds) || hospitalIds.length === 0) {
    return { status: 'error', code: 'NO_ITEMS', message: '請至少勾選一間醫院。' };
  }

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.HOSPITAL);
  if (!masterSheet) return { status: 'error', code: 'NO_MASTER', message: '找不到醫院主檔。' };
  const masterData = masterSheet.getDataRange().getValues();

  const added = [];
  const skipped = [];

  hospitalIds.forEach(function (hospitalId) {
    if (findBlockRowByKey(sheet, BLOCK.HOSPITAL, 0, hospitalId)) {
      skipped.push({ hospitalId: hospitalId, reason: '已在本案件中' });
      return;
    }
    let found = null;
    for (let i = 1; i < masterData.length; i++) {
      if (String(masterData[i][0]) === String(hospitalId)) { found = masterData[i]; break; }
    }
    if (!found) {
      skipped.push({ hospitalId: hospitalId, reason: '主檔查無此ID' });
      return;
    }
    const hospital = { hospitalId: hospitalId, name: found[1], status: 'AVAILABLE', deliveredCount: 0, updatedAt: new Date() };
    appendBlockRow(sheet, BLOCK.HOSPITAL, hospitalObjectToRow(hospital));
    added.push(hospital);
  });

  if (added.length > 0) {
    appendAuditLog(sheet, payload.operatorName || '', 'ADD_HOSPITAL_BATCH', '',
      '批次加入醫院 ' + added.length + ' 間：' + added.map(function (h) { return h.name; }).join('、'), {});
  }

  return { status: 'success', added: added, skipped: skipped };
}

// 前端直接新增一間醫院到主檔，並立刻加進目前這個案件（現場常常需要臨時登記新醫院/收治點）。
// 這份主檔全縣共用、影響所有案件，所以跟建立案件一樣需要管理員密碼（若系統有啟用）。
function createHospitalMasterAndAdd(payload) {
  if (!isAdminPasswordValid(payload.adminPassword, '編輯醫院主檔')) {
    return { status: 'error', code: 'ADMIN_PASSWORD_REQUIRED', message: '管理員密碼錯誤，無法新增醫院主檔。' };
  }
  const name = (payload.name || '').toString().trim();
  if (!name) return { status: 'error', code: 'INVALID_NAME', message: '請輸入醫院名稱。' };

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.HOSPITAL) || ensureHospitalMasterSheet(doc);
  const data = masterSheet.getDataRange().getValues();

  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][0] || '').match(/^H(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  const hospitalId = 'H' + ('000' + (maxNum + 1)).slice(-3);

  masterSheet.appendRow([hospitalId, name, payload.address || '', payload.phone || '', '前端新增', '啟用']);

  return addHospitalToIncident({
    incidentId: payload.incidentId, hospitalId: hospitalId, operatorName: payload.operatorName,
  });
}

// 修正醫院主檔資料（名稱/地址/電話）。注意：已經加入某案件的醫院卡片顯示名稱是
// 加入當下複製的一份快照，修改主檔不會回頭更新已存在的案件紀錄。
// 一樣是全縣共用主檔，需要管理員密碼（若系統有啟用）。
function updateHospitalMaster(payload) {
  if (!isAdminPasswordValid(payload.adminPassword, '編輯醫院主檔')) {
    return { status: 'error', code: 'ADMIN_PASSWORD_REQUIRED', message: '管理員密碼錯誤，無法修改醫院主檔。' };
  }
  const hospitalId = payload.hospitalId;
  if (!hospitalId) return { status: 'error', code: 'INVALID_ID', message: '缺少醫院ID。' };

  const doc = getDoc();
  const masterSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.HOSPITAL);
  if (!masterSheet) return { status: 'error', code: 'NO_MASTER', message: '找不到醫院主檔。' };

  const data = masterSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(hospitalId)) {
      const row = i + 1;
      if (payload.name !== undefined) masterSheet.getRange(row, 2).setValue(payload.name);
      if (payload.address !== undefined) masterSheet.getRange(row, 3).setValue(payload.address);
      if (payload.phone !== undefined) masterSheet.getRange(row, 4).setValue(payload.phone);
      return { status: 'success' };
    }
  }
  return { status: 'error', code: 'NOT_FOUND', message: '醫院主檔查無此ID。' };
}
