// 「只看醫院總覽」獨立頁面：從登入畫面用案件共用驗證碼進入，唯讀，
// 完全不掛任何拖曳/派遣/建立傷患等操作，避免非操作人員誤觸現場作業。
// 刻意不重用 board.js 的 APP.Board.state／輪詢（那一套跟操作看板的畫面深度綁定），
// 而是自己獨立呼叫 getBoardState、自己輪詢、自己管理最小的一份資料快照。
APP.HospitalView = APP.HospitalView || {};
APP.HospitalView.session = null;
APP.HospitalView.state = { patients: [], hospitals: [] };
APP.HospitalView.pollTimer = null;

APP.HospitalView.start = function (session) {
  APP.HospitalView.session = session;
  document.getElementById('hospitalViewIncidentLabel').textContent = session.incidentId;
  APP.HospitalView.refresh();
  if (APP.HospitalView.pollTimer) clearInterval(APP.HospitalView.pollTimer);
  APP.HospitalView.pollTimer = setInterval(APP.HospitalView.refresh, APP.Config.POLL_INTERVAL_MS);
};

APP.HospitalView.stop = function () {
  if (APP.HospitalView.pollTimer) clearInterval(APP.HospitalView.pollTimer);
  APP.HospitalView.pollTimer = null;
};

APP.HospitalView.refresh = function () {
  var session = APP.HospitalView.session;
  if (!session) return;
  APP.Api.get('getBoardState', {
    incidentId: session.incidentId,
    passcode: session.passcode,
  }).then(function (res) {
    if (res.status !== 'success') {
      console.error('讀取醫院總覽失敗：', res.message);
      return;
    }
    APP.HospitalView.state = res.data;
    APP.HospitalView.render();
    APP.UI.setMarquee(res.marqueeMessage, res.marqueeSpeedSeconds);
  }).catch(function (err) {
    console.error('讀取醫院總覽時發生網路錯誤', err);
  });
};

APP.HospitalView.render = function () {
  var patients = APP.HospitalView.state.patients || [];
  document.getElementById('hospitalViewSummaryBar').innerHTML = APP.HospitalView.buildSummaryHTML(patients);
  document.getElementById('hospitalViewBody').innerHTML =
    APP.Hospital.buildOverviewHTML(APP.HospitalView.state.hospitals, patients, false);
};

// 不分區塊（這個頁面沒有患者區/救護車欄位可分），單純統計全案紅黃綠黑各幾人。
APP.HospitalView.buildSummaryHTML = function (patients) {
  var counts = { RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0 };
  patients.forEach(function (p) { if (counts[p.color] !== undefined) counts[p.color]++; });
  var badges = ['RED', 'YELLOW', 'GREEN', 'BLACK'].map(function (c) {
    return '<span class="summary-badge" style="background:' + COLOR_DOT[c] + ';">' +
      (COLOR_LABEL[c] || c) + ' ' + counts[c] + '</span>';
  }).join('');
  return '<div class="summary-group summary-total"><span class="summary-group-label">📋 全案傷患總數（共' +
    patients.length + '）</span>' + badges + '</div>';
};

document.addEventListener('DOMContentLoaded', function () {
  var body = document.getElementById('hospitalViewBody');
  if (body) {
    body.addEventListener('click', function (ev) {
      var row = ev.target.closest('[data-triage-id]');
      if (!row) return;
      var p = APP.HospitalView.state.patients.find(function (x) { return x.triageId === row.dataset.triageId; });
      if (p) APP.Hospital.openPatientDetail(p, { masked: false, session: APP.HospitalView.session });
    });
  }
  var backBtn = document.getElementById('hospitalViewBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      APP.HospitalView.stop();
      APP.Auth.clearSession();
      window.location.reload();
    });
  }
});
