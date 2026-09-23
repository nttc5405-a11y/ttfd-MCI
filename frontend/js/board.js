APP.Board = APP.Board || {};
APP.Board.state = { patients: [], ambulances: [], hospitals: [], masked: true, plateCheckEnabled: true };
APP.Board.pollTimer = null;
APP.Board.selectedPatientId = null; // 點選式指派：目前選取中、等待指派給救護車的傷患

var COLOR_LABEL = { RED: '紅', YELLOW: '黃', GREEN: '綠', BLACK: '黑' };
var COLOR_CLASS = { RED: 'triage-red', YELLOW: 'triage-yellow', GREEN: 'triage-green', BLACK: 'triage-black' };
var COLOR_DOT = { RED: '#dc2626', YELLOW: '#eab308', GREEN: '#16a34a', BLACK: '#1e293b' };
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
    APP.Board.state.plateCheckEnabled = res.plateCheckEnabled !== false;
    APP.Board.render();
    APP.UI.setMarquee(res.marqueeMessage);
  }).catch(function (err) {
    console.error('讀取看板時發生網路錯誤', err);
  });
};

APP.Board.render = function () {
  APP.Board.renderPatients();
  APP.Board.renderAmbulances();
  APP.Board.renderHospitals();
  APP.Board.renderSelectionHint();
};

// 點選式指派：點一下傷患卡片＝選取／再點一下＝取消選取；選取後點救護車卡片＝完成指派
APP.Board.togglePatientSelection = function (patientId) {
  APP.Board.selectedPatientId = (APP.Board.selectedPatientId === patientId) ? null : patientId;
  APP.Board.render();
};

document.addEventListener('DOMContentLoaded', function () {
  var cancelBtn = document.getElementById('cancelSelectionBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      APP.Board.selectedPatientId = null;
      APP.Board.render();
    });
  }
});

APP.Board.renderSelectionHint = function () {
  var bar = document.getElementById('selectionHint');
  var text = document.getElementById('selectionHintText');
  if (!APP.Board.selectedPatientId) {
    bar.classList.add('hidden');
    return;
  }
  var p = APP.Board.state.patients.find(function (x) { return x.triageId === APP.Board.selectedPatientId; });
  if (!p) {
    APP.Board.selectedPatientId = null;
    bar.classList.add('hidden');
    return;
  }
  text.textContent = '已選取 ' + p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色），請點選要指派的救護車';
  bar.classList.remove('hidden');
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
  var selected = p.triageId === APP.Board.selectedPatientId;
  div.className = 'patient-card ' + (COLOR_CLASS[p.color] || '') + (selected ? ' selected' : '');
  div.dataset.patientId = p.triageId;
  var nameLine = APP.Board.state.masked ? '' : ('<div style="font-size:12px">' + (p.name || '（無名氏）') + '</div>');
  div.innerHTML =
    '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
    '<div style="font-weight:700">' + p.triageId + (p.tagNumber ? ' / 貼紙' + p.tagNumber : '') + '</div>' +
    '<div>' +
    '<button class="detail-btn" title="查看照片/傷情">🔍</button>' +
    '<button class="retriage-btn" title="重新檢傷分類">🔄</button>' +
    '</div>' +
    '</div>' +
    '<div style="font-size:14px">' + (COLOR_LABEL[p.color] || p.color) + '色</div>' +
    nameLine;
  div.addEventListener('click', function () { APP.Board.togglePatientSelection(p.triageId); });
  div.querySelector('.detail-btn').addEventListener('click', function (ev) {
    ev.stopPropagation();
    APP.Hospital.openPatientDetail(p);
  });
  div.querySelector('.retriage-btn').addEventListener('click', function (ev) {
    ev.stopPropagation();
    APP.PatientForm.openRetriage(p);
  });
  return div;
};

// 中間欄只顯示「還沒到院」的救護車（待命中/已出勤）；已到院的車改顯示在
// 右側對應醫院卡片底下（代表這輛車人還在醫院，尚未返回現場），見 buildHospitalCard。
APP.Board.renderAmbulances = function () {
  var col = document.getElementById('ambulanceColumn');
  col.innerHTML = '';
  var onSceneOrDispatched = APP.Board.state.ambulances.filter(function (a) { return a.status !== 'AT_HOSPITAL'; });
  if (APP.Board.state.ambulances.length === 0) {
    col.innerHTML = '<div class="empty-hint">尚未加入救護車，請按上方「＋加入救護車」</div>';
    return;
  }
  if (onSceneOrDispatched.length === 0) {
    col.innerHTML = '<div class="empty-hint">所有救護車目前都在醫院，尚未返回現場</div>';
    return;
  }
  onSceneOrDispatched.forEach(function (a) { col.appendChild(APP.Board.buildAmbulanceCard(a)); });
};

// 點救護車卡片：如果目前有選取中的傷患＝完成指派；沒有的話＝打開救護車控制面板
APP.Board.buildAmbulanceCard = function (a) {
  var div = document.createElement('div');
  div.className = 'ambulance-card amb-status-' + a.status;
  div.dataset.ambulanceId = a.vehicleCode;

  var onboardPatients = a.patientIds.map(function (pid) {
    return APP.Board.state.patients.find(function (p) { return p.triageId === pid; });
  }).filter(Boolean);
  var patientsHtml = onboardPatients.length
    ? onboardPatients.map(function (p) {
      return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;">' +
        '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' +
        (COLOR_DOT[p.color] || '#94a3b8') + ';"></span>' + p.triageId + '</span>';
    }).join('')
    : '無';

  div.innerHTML =
    '<div style="font-weight:700">' + a.displayName + '</div>' +
    '<div style="font-size:14px">' + (AMB_STATUS_LABEL[a.status] || a.status) + '</div>' +
    '<div style="font-size:12px">車上傷患：' + patientsHtml + '</div>';
  div.addEventListener('click', function () {
    if (APP.Board.selectedPatientId) {
      APP.DragDrop.movePatient(APP.Board.selectedPatientId, a.vehicleCode, false);
    } else {
      APP.DragDrop.openAmbulanceDetail(a);
    }
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

  var head = document.createElement('div');
  head.innerHTML =
    '<div style="font-weight:700">' + h.name + '</div>' +
    '<div style="font-size:14px">' + (HOSP_STATUS_LABEL[h.status] || h.status) + '</div>' +
    '<div style="font-size:12px">已送達：' + (h.deliveredCount || 0) + ' 人</div>';
  head.addEventListener('click', function () { APP.Hospital.openStatusPicker(h); });
  div.appendChild(head);

  // 已抵達本院、尚未返回現場的救護車，巢狀列在這張醫院卡片底下
  var atHospital = APP.Board.state.ambulances.filter(function (a) {
    return a.status === 'AT_HOSPITAL' && a.hospitalId === h.hospitalId;
  });
  if (atHospital.length > 0) {
    var list = document.createElement('div');
    list.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px dashed #cbd5e1; display:flex; flex-direction:column; gap:6px;';
    atHospital.forEach(function (a) {
      var mini = APP.Board.buildAmbulanceCard(a);
      mini.style.cssText += 'padding:6px 8px; box-shadow:none; border:1px solid #e2e8f0;';
      mini.addEventListener('click', function (ev) { ev.stopPropagation(); });
      list.appendChild(mini);
    });
    div.appendChild(list);
  }

  return div;
};
