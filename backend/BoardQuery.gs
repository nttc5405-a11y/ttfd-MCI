// ═══════════════════════════════════════════════════════════════
//  讀取型查詢：主檔清單、看板狀態（含機敏資料遮蔽邏輯）
// ═══════════════════════════════════════════════════════════════

function getAmbulanceMaster() {
  const doc = getDoc();
  const sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.AMBULANCE);
  if (!sheet) return { status: 'success', data: [] };

  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    if (String(data[i][5]) !== '啟用') continue;
    list.push({
      vehicleCode: data[i][0],
      unitType: data[i][1],
      unitName: data[i][2],
      plateLast4: String(data[i][3]),
      defaultCrew: data[i][4],
    });
  }
  return { status: 'success', data: list };
}

function getHospitalMaster() {
  const doc = getDoc();
  const sheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.HOSPITAL);
  if (!sheet) return { status: 'success', data: [] };

  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    if (String(data[i][5]) !== '啟用') continue;
    list.push({
      hospitalId: data[i][0],
      name: data[i][1],
      address: data[i][2],
      phone: data[i][3],
    });
  }
  return { status: 'success', data: list };
}

function isPasscodeValidForIncident(incidentId, passcode) {
  if (!passcode) return false;
  const doc = getDoc();
  const indexSheet = doc.getSheetByName(CONFIG.MASTER_SHEETS.INCIDENT_INDEX);
  if (!indexSheet) return false;
  const data = indexSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(incidentId)) {
      return String(data[i][4] || '') === String(passcode);
    }
  }
  return false;
}

// 讀取案件三區塊（傷患/救護車/醫院）目前狀態。
// 驗證碼不對或缺少時，傷患姓名/性別/年齡/照片等機敏欄位不會回傳。
function getBoardState(rawIncidentId, passcode) {
  const incidentId = sanitizeSheetName(rawIncidentId);
  if (!incidentId) return { status: 'error', code: 'INVALID_INCIDENT_ID', message: '案件編號無效。' };

  const res = getIncidentSheetOrError(incidentId);
  if (res.error) return res.error;
  const sheet = res.sheet;

  const masked = !isPasscodeValidForIncident(incidentId, passcode);

  const patients = readBlockRows(sheet, BLOCK.PATIENT)
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      const p = patientRowToObject(r);
      if (masked) {
        return {
          triageId: p.triageId,
          tagNumber: p.tagNumber,
          color: p.color,
          status: p.status,
          ambulanceCode: p.ambulanceCode,
          hospitalId: p.hospitalId,
        };
      }
      return p;
    });

  const ambulances = readBlockRows(sheet, BLOCK.AMBULANCE)
    .filter(function (r) { return r[0]; })
    .map(ambulanceRowToObject);

  const hospitals = readBlockRows(sheet, BLOCK.HOSPITAL)
    .filter(function (r) { return r[0]; })
    .map(hospitalRowToObject);

  return { status: 'success', data: { patients: patients, ambulances: ambulances, hospitals: hospitals }, masked: masked };
}
