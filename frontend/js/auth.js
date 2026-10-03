APP.Auth = APP.Auth || {};

var SESSION_KEY = 'dams_session_v1';
var MASK_KEY = 'dams_masked_v1';

APP.Auth.init = function () {
  APP.Auth.bindLoginForm();
  APP.Auth.bindCreateForm();
  APP.Auth.bindHospitalViewForm();
  APP.Auth.bindTopButtons();

  // 登入畫面沒有輪詢機制，跑馬燈訊息／簡報連結只在頁面載入時讀一次；
  // 進入看板後跑馬燈改由 board.js 每次刷新一併帶回最新內容（簡報連結只有登入畫面用得到）。
  APP.Api.get('getMarqueeMessage', {}).then(function (res) {
    if (res.status !== 'success') return;
    APP.UI.setMarquee(res.message, res.marqueeSpeedSeconds);
    var link = document.getElementById('presentationLinkAnchor');
    var block = document.getElementById('presentationLinkBlock');
    if (link && block) {
      if (res.presentationLink) {
        link.href = res.presentationLink;
        block.classList.remove('hidden');
      } else {
        block.classList.add('hidden');
      }
    }
  }).catch(function () {});

  var saved = APP.Auth.getSession();
  if (saved && saved.mode === 'hospitalView') {
    APP.Auth.enterHospitalView(saved);
  } else if (saved) {
    APP.Auth.enterBoard(saved);
  } else {
    APP.Auth.loadIncidentList();
    APP.Auth.loadHospitalViewIncidentList();
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

APP.Auth.loadHospitalViewIncidentList = function () {
  var select = document.getElementById('hospitalViewIncidentSelect');
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
      select.innerHTML = '<option value="">目前沒有進行中的案件</option>';
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
      var session = { incidentId: incidentId, passcode: passcode, operatorName: operatorName, mode: 'board' };
      APP.Auth.saveSession(session);
      APP.Auth.enterBoard(session);
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
  });
};

// 「只看醫院總覽」：輸入「醫院總覽專用驗證碼」（建立案件時系統會自動產生一組，
// 跟操作用的主驗證碼不同）即可進入，驗證走獨立的 verifyHospitalViewLogin——
// 這組專用碼無法拿去一般登入表單使用，所以只把這組碼交給非操作人員，
// 他們就真的進不了會誤觸檢傷/派遣的操作畫面（操作人員知道主驗證碼的話，兩邊都能登入）。
APP.Auth.bindHospitalViewForm = function () {
  var btn = document.getElementById('hospitalViewLoginBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var incidentId = document.getElementById('hospitalViewIncidentSelect').value;
    var passcode = document.getElementById('hospitalViewPasscode').value.trim();
    var operatorName = document.getElementById('loginOperatorName').value.trim();
    if (!incidentId) { APP.UI.alert('請選擇案件。'); return; }
    if (!passcode) { APP.UI.alert('請輸入驗證碼。'); return; }

    APP.Api.post('verifyHospitalViewLogin', {
      incidentId: incidentId, passcode: passcode, operatorName: operatorName || '（醫院總覽-唯讀）',
    }).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '驗證碼錯誤'); return; }
      var session = { incidentId: incidentId, passcode: passcode, operatorName: operatorName, mode: 'hospitalView' };
      APP.Auth.saveSession(session);
      APP.Auth.enterHospitalView(session);
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
      if (res.hospitalViewPasscode) {
        APP.UI.alert(
          '案件建立成功！\n\n' +
          '系統另外自動產生了一組「醫院總覽專用驗證碼」：' + res.hospitalViewPasscode + '\n' +
          '這組碼可以另外提供給非操作人員（例如支援單位、關心傷患的人員）查看醫院收治狀況，' +
          '他們不會因此能進入操作畫面。之後也可以到「案件清單」分頁「醫院總覽驗證碼」欄查詢或更換。'
        );
      }
      var session = { incidentId: res.incidentId, passcode: passcode, operatorName: operatorName, mode: 'board' };
      APP.Auth.saveSession(session);
      APP.Auth.enterBoard(session);
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
  });
};

APP.Auth.enterBoard = function (session) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('hospitalViewScreen').classList.add('hidden');
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

// 獨立的「醫院總覽（唯讀）」頁面：不呼叫 APP.DragDrop/PatientForm/Hospital.init()，
// 完全不掛操作看板那一整套的拖曳、建立、派遣按鈕與事件，只跑 APP.HospitalView。
APP.Auth.enterHospitalView = function (session) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('boardScreen').classList.add('hidden');
  document.getElementById('hospitalViewScreen').classList.remove('hidden');
  APP.HospitalView.start(session);
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
