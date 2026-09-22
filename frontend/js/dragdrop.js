// 檔名沿用舊名，但內容已經從「拖曳」改成「點選式」互動（見 board.js 的選取邏輯）——
// 拖曳在觸控裝置上（尤其戴手套時）容易失敗，改成「點傷患→點救護車」兩次點擊更可靠。
APP.DragDrop = APP.DragDrop || {};

APP.DragDrop.init = function () {
  document.getElementById('ambulanceDetailCloseBtn').addEventListener('click', APP.DragDrop.closeAmbulanceDetail);
  document.getElementById('sendToHospitalBtn').addEventListener('click', function () {
    APP.DragDrop.openHospitalPicker(APP.DragDrop.currentAmbulance);
  });
  document.getElementById('returnStandbyBtn').addEventListener('click', function () {
    APP.DragDrop.returnToStandby(APP.DragDrop.currentAmbulance.vehicleCode, APP.DragDrop.currentAmbulance.displayName);
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

// 跳出車牌後4碼輸入視窗，輸入正確才會呼叫 runFn(plateLast4)。
// displayLabel（選填）是彈窗上要顯示給使用者看的名稱，跟實際送給後端比對用的
// ambulanceId 分開，避免使用者看到系統內部自動組合過的代碼而困惑。
//
// 如果本案件已經在試算表「案件清單」分頁把車牌驗證設成「停用」，
// 就不跳輸入視窗，直接執行動作——後端也會依同一個設定跳過驗證，
// 這裡只是配合前端不要多此一舉跳出用不到的輸入框。
APP.DragDrop.askPlateAndRun = function (ambulanceId, runFn, displayLabel) {
  if (!APP.Board.state.plateCheckEnabled) {
    runFn('').then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
      APP.Board.refresh();
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
    return;
  }
  APP.UI.promptPlate(ambulanceId, function (plateLast4) {
    runFn(plateLast4).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
      APP.Board.refresh();
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
  }, displayLabel);
};

APP.DragDrop.returnToStandby = function (ambulanceId, displayLabel) {
  APP.DragDrop.askPlateAndRun(ambulanceId, function (plateLast4) {
    return APP.Api.post('moveAmbulanceToStandby', APP.DragDrop.withSession({
      ambulanceId: ambulanceId, plateLast4: plateLast4,
    }));
  }, displayLabel);
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
        }, ambulance.displayName);
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
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:8px 0;gap:8px;flex-wrap:wrap;';
      var label = document.createElement('span');
      label.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle;background:' +
        (COLOR_DOT[p.color] || '#94a3b8') + ';"></span>' +
        p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色）' +
        (APP.Board.state.masked ? '' : ' ' + (p.name || '無名氏'));
      row.appendChild(label);

      var btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:6px;';

      if (ambulance.status === 'AT_HOSPITAL') {
        // 已到院：正常完成交接用「卸下病患」（保留送達紀錄，只是把人從車上清單移掉）；
        // 「移除」則是指派錯誤時的更正，會把傷患整個退回現場
        var dischargeBtn = document.createElement('button');
        dischargeBtn.textContent = '卸下病患（完成交接）';
        dischargeBtn.style.cssText = 'padding:6px 10px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12px;';
        dischargeBtn.addEventListener('click', function () {
          // 傷情在送醫過程中可能改變，卸下前先讓使用者確認/更新一次檢傷顏色
          // （預設帶入目前的顏色，沒變化的話點一下確認就好，不用重新想一次）。
          APP.DragDrop.closeAmbulanceDetail();
          APP.PatientForm.openRetriage(p, function () {
            APP.Api.post('dischargePatientFromAmbulance', APP.DragDrop.withSession({ patientId: p.triageId })).then(function (res) {
              if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
              APP.Board.refresh();
            }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
          }, '確認傷情後卸下：' + p.triageId);
        });
        btnGroup.appendChild(dischargeBtn);
      }

      var removeBtn = document.createElement('button');
      removeBtn.textContent = ambulance.status === 'AT_HOSPITAL' ? '移除（指派錯誤更正）' : '移除（故障/換車）';
      removeBtn.style.cssText = 'padding:6px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:12px;';
      removeBtn.addEventListener('click', function () {
        APP.Api.post('removePatientFromAmbulance', APP.DragDrop.withSession({ patientId: p.triageId })).then(function (res) {
          if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
          APP.Board.refresh();
          APP.DragDrop.closeAmbulanceDetail();
        });
      });
      btnGroup.appendChild(removeBtn);

      row.appendChild(btnGroup);
      body.appendChild(row);
    });
  }

  var hint = document.getElementById('ambulanceDetailHint');
  var sendBtn = document.getElementById('sendToHospitalBtn');
  var standbyBtn = document.getElementById('returnStandbyBtn');
  var handoverBtn = document.getElementById('openHandoverBtn');
  var batchDischargeBtn = document.getElementById('batchDischargeBtn');

  sendBtn.classList.toggle('hidden', ambulance.status === 'AT_HOSPITAL');
  standbyBtn.classList.toggle('hidden', ambulance.status === 'STANDBY');

  if (ambulance.status === 'AT_HOSPITAL') {
    hint.textContent = '已抵達 ' + ambulance.hospitalId + '，傷患已自動標記送達。' +
      '按「產生交接單」會在存檔的同時自動幫全車傷患完成卸下，不用再一個一個點；' +
      '如果不需要交接單，也可以按「全部卸下病患」直接批次卸下。車上清空後即可「返回待命」。';
    handoverBtn.classList.remove('hidden');
    handoverBtn.onclick = function () {
      APP.DragDrop.closeAmbulanceDetail();
      APP.DragDrop.confirmColorsThenHandover(ambulance, patients);
    };
    batchDischargeBtn.classList.toggle('hidden', patients.length === 0);
    batchDischargeBtn.onclick = function () {
      APP.DragDrop.closeAmbulanceDetail();
      APP.DragDrop.confirmColorsThenBatchDischarge(patients);
    };
  } else {
    hint.textContent = '要送醫院請按下方「送達醫院」；要回待命請按「返回待命」（車上需先清空傷患）。';
    handoverBtn.classList.add('hidden');
    batchDischargeBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
};

APP.DragDrop.closeAmbulanceDetail = function () {
  document.getElementById('ambulanceDetailModal').classList.add('hidden');
};

// 逐一確認/更新每位傷患的檢傷顏色（傷情在送醫過程中可能改變），
// 全部確認完才呼叫 onAllConfirmed(confirmedPatients)——confirmedPatients 是
// 每位傷患「剛剛確認送出」的最新物件（不是舊的看板快照），交接單、批次卸下
// 都靠這個確保用的是最新顏色。用回呼一次處理一位，避免同時開好幾個選色視窗搞混。
// titlePrefix 用來組成每個視窗的標題，例如「交接前確認傷情」「卸下前確認傷情」。
APP.DragDrop.confirmColorsSequentially = function (patients, titlePrefix, onAllConfirmed) {
  if (patients.length === 0) {
    onAllConfirmed([]);
    return;
  }
  var confirmed = [];
  function next(index) {
    if (index >= patients.length) {
      onAllConfirmed(confirmed);
      return;
    }
    var p = patients[index];
    APP.PatientForm.openRetriage(p, function (updatedPatient) {
      confirmed.push(updatedPatient || p);
      next(index + 1);
    }, titlePrefix + '（' + (index + 1) + '/' + patients.length + '）：' + p.triageId);
  }
  next(0);
};

APP.DragDrop.confirmColorsThenHandover = function (ambulance, patients) {
  APP.DragDrop.confirmColorsSequentially(patients, '交接前確認傷情', function (confirmed) {
    APP.Handover.open(ambulance, confirmed);
  });
};

// 沒有另外產生交接單、但想一次卸下車上所有傷患時用（不用一個一個點）。
APP.DragDrop.confirmColorsThenBatchDischarge = function (patients) {
  APP.DragDrop.confirmColorsSequentially(patients, '卸下前確認傷情', function (confirmed) {
    APP.Api.post('dischargePatientsFromAmbulance', APP.DragDrop.withSession({
      patientIds: confirmed.map(function (p) { return p.triageId; }),
    })).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
      APP.Board.refresh();
      if (res.skipped && res.skipped.length > 0) {
        APP.UI.alert('已卸下 ' + res.discharged.length + ' 位；' + res.skipped.length + ' 位失敗，請個別確認。');
      }
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
  });
};
