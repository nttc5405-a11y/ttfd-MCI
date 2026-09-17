APP.DragDrop = APP.DragDrop || {};
APP.DragDrop.isDragging = false;

APP.DragDrop.init = function () {
  var ambulanceColumn = document.getElementById('ambulanceColumn');

  // 拖曳進行中時，看板輪詢會整批重畫 DOM（見 board.js），若剛好在拖曳當下重畫，
  // 手指底下的卡片會被整個換掉，體感上就是「拖曳卡頓/瞬間跳掉」。
  // 這裡標記拖曳中，輪詢時暫停重畫，放開手才補畫一次最新狀態。
  document.addEventListener('dragstart', function () { APP.DragDrop.isDragging = true; });
  document.addEventListener('dragend', function () {
    APP.DragDrop.isDragging = false;
    APP.Board.refresh();
  });

  // 救護車卡片拖曳到「中間欄空白處」＝回待命（不是拖到某輛車卡片上）
  ambulanceColumn.addEventListener('dragover', function (ev) { ev.preventDefault(); });
  ambulanceColumn.addEventListener('drop', function (ev) {
    ev.preventDefault();
    if (ev.target.closest('[data-ambulance-id]')) return;
    var data = APP.DragDrop.readDragData(ev);
    if (!data || data.type !== 'ambulance') return;
    APP.DragDrop.askPlateAndRun(data.ambulanceId, function (plateLast4) {
      return APP.Api.post('moveAmbulanceToStandby', APP.DragDrop.withSession({
        ambulanceId: data.ambulanceId, plateLast4: plateLast4,
      }));
    });
  });

  // 患者卡片拖到某輛救護車卡片＝指派；救護車卡片拖到某醫院卡片＝抵達
  document.body.addEventListener('dragover', function (ev) {
    if (ev.target.closest('[data-ambulance-id]') || ev.target.closest('[data-hospital-id]')) {
      ev.preventDefault();
    }
  });

  document.body.addEventListener('drop', function (ev) {
    var ambCard = ev.target.closest('[data-ambulance-id]');
    var hospCard = ev.target.closest('[data-hospital-id]');
    var data = APP.DragDrop.readDragData(ev);
    if (!data) return;

    if (ambCard && data.type === 'patient') {
      ev.preventDefault();
      APP.DragDrop.movePatient(data.patientId, ambCard.dataset.ambulanceId, false);
    } else if (hospCard && data.type === 'ambulance') {
      ev.preventDefault();
      var hospitalId = hospCard.dataset.hospitalId;
      APP.DragDrop.askPlateAndRun(data.ambulanceId, function (plateLast4) {
        return APP.Api.post('moveAmbulanceToHospital', APP.DragDrop.withSession({
          ambulanceId: data.ambulanceId, plateLast4: plateLast4, hospitalId: hospitalId,
        }));
      });
    }
  });

  document.getElementById('ambulanceDetailCloseBtn').addEventListener('click', APP.DragDrop.closeAmbulanceDetail);
};

APP.DragDrop.readDragData = function (ev) {
  try {
    var raw = ev.dataTransfer.getData('text/plain');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

APP.DragDrop.withSession = function (extra) {
  extra = extra || {};
  var session = APP.Auth.getSession();
  extra.incidentId = session.incidentId;
  extra.operatorName = session.operatorName;
  return extra;
};

APP.DragDrop.movePatient = function (patientId, ambulanceId, confirmSecondRed) {
  APP.Api.post('movePatientToAmbulance', APP.DragDrop.withSession({
    patientId: patientId, ambulanceId: ambulanceId, confirmSecondRed: confirmSecondRed,
  })).then(function (res) {
    if (res.status === 'confirm_required') {
      APP.UI.confirm(res.message, function () { APP.DragDrop.movePatient(patientId, ambulanceId, true); });
      return;
    }
    if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
    APP.Board.refresh();
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

// 跳出車牌後4碼輸入視窗，輸入正確才會呼叫 runFn(plateLast4)
APP.DragDrop.askPlateAndRun = function (ambulanceId, runFn) {
  APP.UI.promptPlate(ambulanceId, function (plateLast4) {
    runFn(plateLast4).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
      APP.Board.refresh();
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
  });
};

// 點入救護車卡片：看車上傷患名單，可個別「移除」（故障/換車用）；已到院時可產生交接單
APP.DragDrop.openAmbulanceDetail = function (ambulance) {
  var modal = document.getElementById('ambulanceDetailModal');
  var body = document.getElementById('ambulanceDetailBody');
  document.getElementById('ambulanceDetailTitle').textContent = ambulance.displayName;

  var patients = APP.Board.state.patients.filter(function (p) {
    return ambulance.patientIds.indexOf(p.triageId) !== -1;
  });

  body.innerHTML = '';
  if (patients.length === 0) {
    body.innerHTML = '<div class="empty-hint">車上目前沒有傷患</div>';
  } else {
    patients.forEach(function (p) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:8px 0;gap:8px;';
      var label = document.createElement('span');
      label.textContent = p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色）' +
        (APP.Board.state.masked ? '' : ' ' + (p.name || '無名氏'));
      row.appendChild(label);
      if (ambulance.status !== 'AT_HOSPITAL') {
        var btn = document.createElement('button');
        btn.textContent = '移除（故障/換車）';
        btn.style.cssText = 'padding:6px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:12px;';
        btn.addEventListener('click', function () {
          APP.Api.post('removePatientFromAmbulance', APP.DragDrop.withSession({ patientId: p.triageId })).then(function (res) {
            if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
            APP.Board.refresh();
            APP.DragDrop.closeAmbulanceDetail();
          });
        });
        row.appendChild(btn);
      }
      body.appendChild(row);
    });
  }

  var hint = document.getElementById('ambulanceDetailHint');
  var handoverBtn = document.getElementById('openHandoverBtn');
  if (ambulance.status === 'AT_HOSPITAL') {
    hint.textContent = '已抵達 ' + ambulance.hospitalId + '，車上傷患已自動標記送達。';
    handoverBtn.classList.remove('hidden');
    handoverBtn.onclick = function () {
      APP.DragDrop.closeAmbulanceDetail();
      APP.Handover.open(ambulance, patients);
    };
  } else {
    hint.textContent = '要送醫院請把這輛車拖到右側醫院卡片上；要回待命請拖到中間欄空白處（需先清空車上傷患）。';
    handoverBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
};

APP.DragDrop.closeAmbulanceDetail = function () {
  document.getElementById('ambulanceDetailModal').classList.add('hidden');
};
