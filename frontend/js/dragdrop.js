// 檔名沿用舊名，但內容已經從「拖曳」改成「點選式」互動（見 board.js 的選取邏輯）——
// 拖曳在觸控裝置上（尤其戴手套時）容易失敗，改成「點傷患→點救護車」兩次點擊更可靠。
APP.DragDrop = APP.DragDrop || {};

APP.DragDrop.init = function () {
  document.getElementById('ambulanceDetailCloseBtn').addEventListener('click', APP.DragDrop.closeAmbulanceDetail);
  document.getElementById('sendToHospitalBtn').addEventListener('click', function () {
    APP.DragDrop.openHospitalPicker(APP.DragDrop.currentAmbulance);
  });
  document.getElementById('returnStandbyBtn').addEventListener('click', function () {
    APP.DragDrop.returnToStandby(APP.DragDrop.currentAmbulance.vehicleCode);
  });
  document.getElementById('hospitalPickerCancelBtn').addEventListener('click', APP.DragDrop.closeHospitalPicker);
};

APP.DragDrop.withSession = function (extra) {
  extra = extra || {};
  var session = APP.Auth.getSession();
  extra.incidentId = session.incidentId;
  extra.operatorName = session.operatorName;
  return extra;
};

// 指派選取中的傷患給某輛救護車（由 board.js 點擊救護車卡片時呼叫）
APP.DragDrop.movePatient = function (patientId, ambulanceId, confirmSecondRed) {
  APP.Api.post('movePatientToAmbulance', APP.DragDrop.withSession({
    patientId: patientId, ambulanceId: ambulanceId, confirmSecondRed: confirmSecondRed,
  })).then(function (res) {
    if (res.status === 'confirm_required') {
      APP.UI.confirm(res.message, function () { APP.DragDrop.movePatient(patientId, ambulanceId, true); });
      return; // 選取狀態保留，等使用者決定確認或改選別輛車
    }
    if (res.status !== 'success') {
      APP.UI.alert(res.message || '操作失敗');
      return; // 失敗也保留選取，方便直接改點別輛車重試
    }
    APP.Board.selectedPatientId = null;
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

APP.DragDrop.returnToStandby = function (ambulanceId) {
  APP.DragDrop.askPlateAndRun(ambulanceId, function (plateLast4) {
    return APP.Api.post('moveAmbulanceToStandby', APP.DragDrop.withSession({
      ambulanceId: ambulanceId, plateLast4: plateLast4,
    }));
  });
  APP.DragDrop.closeAmbulanceDetail();
};

// 「送達醫院」：先選要送去哪一間（本案件已加入的醫院清單），再走車牌驗證
APP.DragDrop.openHospitalPicker = function (ambulance) {
  var list = document.getElementById('hospitalPickerList');
  list.innerHTML = '';
  if (APP.Board.state.hospitals.length === 0) {
    list.innerHTML = '<div class="empty-hint">案件裡還沒有加入任何醫院，請先在上方「＋加入醫院」。</div>';
  } else {
    APP.Board.state.hospitals.forEach(function (h) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:8px 0;gap:8px;';
      var label = document.createElement('span');
      label.textContent = h.name + (h.status === 'FULL' ? '（已滿，僅供提示）' : '');
      row.appendChild(label);
      var btn = document.createElement('button');
      btn.textContent = '送達此院';
      btn.style.cssText = 'padding:6px 10px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:12px;';
      btn.addEventListener('click', function () {
        APP.DragDrop.closeHospitalPicker();
        APP.DragDrop.closeAmbulanceDetail();
        APP.DragDrop.askPlateAndRun(ambulance.vehicleCode, function (plateLast4) {
          return APP.Api.post('moveAmbulanceToHospital', APP.DragDrop.withSession({
            ambulanceId: ambulance.vehicleCode, plateLast4: plateLast4, hospitalId: h.hospitalId,
          }));
        });
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  document.getElementById('hospitalPickerModal').classList.remove('hidden');
};

APP.DragDrop.closeHospitalPicker = function () {
  document.getElementById('hospitalPickerModal').classList.add('hidden');
};

// 點入救護車卡片：看車上傷患名單，可個別「移除」（不論車輛狀態都能移除，
// 用於故障/換車，或到院後才發現指派錯誤的更正）；並提供送醫院/返回待命/交接單按鈕
APP.DragDrop.currentAmbulance = null;

APP.DragDrop.openAmbulanceDetail = function (ambulance) {
  APP.DragDrop.currentAmbulance = ambulance;
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
      var btn = document.createElement('button');
      btn.textContent = ambulance.status === 'AT_HOSPITAL' ? '移除（更正指派錯誤）' : '移除（故障/換車）';
      btn.style.cssText = 'padding:6px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:12px;';
      btn.addEventListener('click', function () {
        APP.Api.post('removePatientFromAmbulance', APP.DragDrop.withSession({ patientId: p.triageId })).then(function (res) {
          if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
          APP.Board.refresh();
          APP.DragDrop.closeAmbulanceDetail();
        });
      });
      row.appendChild(btn);
      body.appendChild(row);
    });
  }

  var hint = document.getElementById('ambulanceDetailHint');
  var sendBtn = document.getElementById('sendToHospitalBtn');
  var standbyBtn = document.getElementById('returnStandbyBtn');
  var handoverBtn = document.getElementById('openHandoverBtn');

  sendBtn.classList.toggle('hidden', ambulance.status === 'AT_HOSPITAL');
  standbyBtn.classList.toggle('hidden', ambulance.status === 'STANDBY');

  if (ambulance.status === 'AT_HOSPITAL') {
    hint.textContent = '已抵達 ' + ambulance.hospitalId + '，車上傷患已自動標記送達。';
    handoverBtn.classList.remove('hidden');
    handoverBtn.onclick = function () {
      APP.DragDrop.closeAmbulanceDetail();
      APP.Handover.open(ambulance, patients);
    };
  } else {
    hint.textContent = '要送醫院請按下方「送達醫院」；要回待命請按「返回待命」（車上需先清空傷患）。';
    handoverBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
};

APP.DragDrop.closeAmbulanceDetail = function () {
  document.getElementById('ambulanceDetailModal').classList.add('hidden');
};
