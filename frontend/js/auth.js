APP.Auth = APP.Auth || {};

var SESSION_KEY = 'dams_session_v1';
var MASK_KEY = 'dams_masked_v1';

APP.Auth.init = function () {
  APP.Auth.bindLoginForm();
  APP.Auth.bindCreateForm();
  APP.Auth.bindTopButtons();

  // 登入畫面沒有輪詢機制，跑馬燈訊息只在頁面載入時讀一次；
  // 進入看板後改由 board.js 每次刷新一併帶回最新內容。
  APP.Api.get('getMarqueeMessage', {}).then(function (res) {
    if (res.status === 'success') APP.UI.setMarquee(res.message);
  }).catch(function () {});

  var saved = APP.Auth.getSession();
  if (saved) {
    APP.Auth.enterBoard(saved);
  } else {
    APP.Auth.loadIncidentList();
  }
};

APP.Auth.getSession = function () {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

APP.Auth.saveSession = function (session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

APP.Auth.clearSession = function () {
  localStorage.removeItem(SESSION_KEY);
};

APP.Auth.isMasked = function () {
  return localStorage.getItem(MASK_KEY) === '1';
};

APP.Auth.setMasked = function (masked) {
  localStorage.setItem(MASK_KEY, masked ? '1' : '0');
};

APP.Auth.loadIncidentList = function () {
  var select = document.getElementById('incidentSelect');
  if (!select) return;
  select.innerHTML = '<option>載入中...</option>';
  APP.Api.get('getIncidentList', {}).then(function (res) {
    select.innerHTML = '';
    if (res.status === 'success' && res.data.length > 0) {
      res.data.forEach(function (inc) {
        var opt = document.createElement('option');
        opt.value = inc.incidentId;
        opt.textContent = inc.displayName;
        select.appendChild(opt);
      });
    } else {
      select.innerHTML = '<option value="">目前沒有進行中的案件，請在下方建立新案件</option>';
    }
  }).catch(function () {
    select.innerHTML = '<option value="">讀取案件清單失敗，請檢查網路或 BASE_URL 設定</option>';
  });
};

APP.Auth.bindLoginForm = function () {
  var btn = document.getElementById('loginBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var incidentId = document.getElementById('incidentSelect').value;
    var passcode = document.getElementById('loginPasscode').value.trim();
    var operatorName = document.getElementById('loginOperatorName').value.trim();
    if (!incidentId) { APP.UI.alert('請選擇案件。'); return; }
    if (!passcode) { APP.UI.alert('請輸入案件共用驗證碼。'); return; }
    if (!operatorName) { APP.UI.alert('請輸入您的姓名。'); return; }

    APP.Api.post('verifyIncidentLogin', {
      incidentId: incidentId, passcode: passcode, operatorName: operatorName,
    }).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '登入失敗'); return; }
      var session = { incidentId: incidentId, passcode: passcode, operatorName: operatorName };
      APP.Auth.saveSession(session);
      APP.Auth.enterBoard(session);
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
  });
};

APP.Auth.bindCreateForm = function () {
  var btn = document.getElementById('createIncidentBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var name = document.getElementById('newIncidentName').value.trim();
    var passcode = document.getElementById('newIncidentPasscode').value.trim();
    var operatorName = document.getElementById('loginOperatorName').value.trim();
    var adminPassword = document.getElementById('newIncidentAdminPassword').value;
    if (!name) { APP.UI.alert('請輸入案件名稱。'); return; }
    if (!passcode) { APP.UI.alert('請設定本案件的共用驗證碼。'); return; }
    if (!operatorName) { APP.UI.alert('請先在上方輸入您的姓名。'); return; }

    APP.Api.post('createIncident', {
      incidentName: name, passcode: passcode, creatorName: operatorName, adminPassword: adminPassword,
    }).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '建立案件失敗'); return; }
      var session = { incidentId: res.incidentId, passcode: passcode, operatorName: operatorName };
      APP.Auth.saveSession(session);
      APP.Auth.enterBoard(session);
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
  });
};

APP.Auth.enterBoard = function (session) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('boardScreen').classList.remove('hidden');
  document.getElementById('incidentNameLabel').textContent = session.incidentId;
  document.getElementById('operatorLabel').textContent = '操作人員：' + session.operatorName;
  APP.Auth.updateMaskButton();
  APP.DragDrop.init();
  APP.PatientForm.init();
  APP.Hospital.init();
  APP.Handover.init();
  APP.Board.start();
};

APP.Auth.updateMaskButton = function () {
  var btn = document.getElementById('toggleMaskBtn');
  if (!btn) return;
  btn.textContent = APP.Auth.isMasked() ? '🙈 已遮蔽姓名（點此顯示）' : '👁 顯示姓名中（點此遮蔽）';
};

APP.Auth.bindTopButtons = function () {
  var maskBtn = document.getElementById('toggleMaskBtn');
  if (maskBtn) {
    maskBtn.addEventListener('click', function () {
      APP.Auth.setMasked(!APP.Auth.isMasked());
      APP.Auth.updateMaskButton();
      APP.Board.refresh();
    });
  }
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      APP.Board.stop();
      APP.Auth.clearSession();
      window.location.reload();
    });
  }
};

document.addEventListener('DOMContentLoaded', function () {
  APP.Auth.init();
});
