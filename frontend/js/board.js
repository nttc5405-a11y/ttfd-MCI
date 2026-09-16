APP.Board = APP.Board || {};
APP.Board.state = { patients: [], ambulances: [], hospitals: [], masked: true };
APP.Board.pollTimer = null;

var COLOR_LABEL = { RED: '紅', YELLOW: '黃', GREEN: '綠', BLACK: '黑' };
var COLOR_CLASS = { RED: 'triage-red', YELLOW: 'triage-yellow', GREEN: 'triage-green', BLACK: 'triage-black' };
var AMB_STATUS_LABEL = { STANDBY: '待命中', DISPATCHED: '已出勤', AT_HOSPITAL: '已到院' };
var HOSP_STATUS_LABEL = { AVAILABLE: '可收治', LIMITED: '收治有限', FULL: '已滿', UNKNOWN: '未回報' };

APP.Board.start = function () {
  APP.Board.refresh();
  if (APP.Board.pollTimer) clearInterval(APP.Board.pollTimer);
  APP.Board.pollTimer = setInterval(APP.Board.refresh, APP.Config.POLL_INTERVAL_MS);
};

APP.Board.stop = function () {
  if (APP.Board.pollTimer) clearInterval(APP.Board.pollTimer);
  APP.Board.pollTimer = null;
};

APP.Board.refresh = function () {
  var session = APP.Auth.getSession();
  if (!session) return;
  APP.Api.get('getBoardState', {
    incidentId: session.incidentId,
    passcode: APP.Auth.isMasked() ? '' : session.passcode,
  }).then(function (res) {
    if (res.status !== 'success') {
      console.error('讀取看板失敗：', res.message);
      return;
    }
    APP.Board.state = res.data;
    APP.Board.state.masked = res.masked;
    APP.Board.render();
  }).catch(function (err) {
    console.error('讀取看板時發生網路錯誤', err);
  });
};

APP.Board.render = function () {
  APP.Board.renderPatients();
  APP.Board.renderAmbulances();
  APP.Board.renderHospitals();
};

APP.Board.renderPatients = function () {
  var col = document.getElementById('patientColumn');
  col.innerHTML = '';
  var unassigned = APP.Board.state.patients.filter(function (p) { return p.status === 'ON_SCENE'; });
  if (unassigned.length === 0) {
    col.innerHTML = '<div class="empty-hint">目前沒有待指派的傷患</div>';
    return;
  }
  unassigned.forEach(function (p) { col.appendChild(APP.Board.buildPatientCard(p)); });
};

APP.Board.buildPatientCard = function (p) {
  var div = document.createElement('div');
  div.className = 'patient-card ' + (COLOR_CLASS[p.color] || '');
  div.setAttribute('draggable', 'true');
  div.dataset.patientId = p.triageId;
  var nameLine = APP.Board.state.masked ? '' : ('<div style="font-size:12px">' + (p.name || '（無名氏）') + '</div>');
  div.innerHTML =
    '<div style="font-weight:700">' + p.triageId + (p.tagNumber ? ' / 貼紙' + p.tagNumber : '') + '</div>' +
    '<div style="font-size:14px">' + (COLOR_LABEL[p.color] || p.color) + '色</div>' +
    nameLine;
  div.addEventListener('click', function () { APP.PatientForm.openRetriage(p); });
  div.addEventListener('dragstart', function (ev) {
    ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'patient', patientId: p.triageId }));
  });
  return div;
};

APP.Board.renderAmbulances = function () {
  var col = document.getElementById('ambulanceColumn');
  col.innerHTML = '';
  if (APP.Board.state.ambulances.length === 0) {
    col.innerHTML = '<div class="empty-hint">尚未加入救護車，請按上方「＋加入救護車」</div>';
    return;
  }
  APP.Board.state.ambulances.forEach(function (a) { col.appendChild(APP.Board.buildAmbulanceCard(a)); });
};

APP.Board.buildAmbulanceCard = function (a) {
  var div = document.createElement('div');
  div.className = 'ambulance-card amb-status-' + a.status;
  div.setAttribute('draggable', 'true');
  div.dataset.ambulanceId = a.vehicleCode;
  div.innerHTML =
    '<div style="font-weight:700">' + a.displayName + '</div>' +
    '<div style="font-size:14px">' + (AMB_STATUS_LABEL[a.status] || a.status) + '</div>' +
    '<div style="font-size:12px">車上傷患：' + (a.patientIds.length ? a.patientIds.join('、') : '無') + '</div>';
  div.addEventListener('click', function () { APP.DragDrop.openAmbulanceDetail(a); });
  div.addEventListener('dragstart', function (ev) {
    ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'ambulance', ambulanceId: a.vehicleCode }));
  });
  return div;
};

APP.Board.renderHospitals = function () {
  var col = document.getElementById('hospitalColumn');
  col.innerHTML = '';
  if (APP.Board.state.hospitals.length === 0) {
    col.innerHTML = '<div class="empty-hint">尚未加入醫院，請按上方「＋加入醫院」</div>';
    return;
  }
  APP.Board.state.hospitals.forEach(function (h) { col.appendChild(APP.Board.buildHospitalCard(h)); });
};

APP.Board.buildHospitalCard = function (h) {
  var div = document.createElement('div');
  div.className = 'hospital-card hosp-status-' + h.status;
  div.dataset.hospitalId = h.hospitalId;
  div.innerHTML =
    '<div style="font-weight:700">' + h.name + '</div>' +
    '<div style="font-size:14px">' + (HOSP_STATUS_LABEL[h.status] || h.status) + '</div>' +
    '<div style="font-size:12px">已送達：' + (h.deliveredCount || 0) + ' 人</div>';
  div.addEventListener('click', function () { APP.Hospital.openStatusPicker(h); });
  return div;
};
