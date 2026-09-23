APP.Hospital = APP.Hospital || {};
APP.Hospital.currentHospital = null;

APP.Hospital.init = function () {
  document.getElementById('addHospitalBtn').addEventListener('click', APP.Hospital.openAddModal);
  document.getElementById('hospitalAddCancelBtn').addEventListener('click', APP.Hospital.closeAddModal);
  document.getElementById('hospitalAddSubmitBtn').addEventListener('click', APP.Hospital.submitAddSelectedHospitals);
  document.getElementById('hospitalSelectAll').addEventListener('change', function (ev) {
    document.querySelectorAll('.hospital-add-checkbox').forEach(function (cb) { cb.checked = ev.target.checked; });
  });

  document.getElementById('showCreateHospitalBtn').addEventListener('click', function () {
    document.getElementById('createHospitalForm').classList.toggle('hidden');
  });
  document.getElementById('cancelCreateHospitalBtn').addEventListener('click', function () {
    document.getElementById('createHospitalForm').classList.add('hidden');
  });
  document.getElementById('submitCreateHospitalBtn').addEventListener('click', APP.Hospital.submitCreateHospital);

  document.getElementById('editHospitalCancelBtn').addEventListener('click', function () {
    document.getElementById('editHospitalModal').classList.add('hidden');
  });
  document.getElementById('editHospitalSaveBtn').addEventListener('click', APP.Hospital.saveEditHospital);

  document.getElementById('hospitalStatusCancelBtn').addEventListener('click', APP.Hospital.closeStatusPicker);
  ['AVAILABLE', 'LIMITED', 'FULL', 'UNKNOWN'].forEach(function (s) {
    var btn = document.getElementById('hospStatusBtn_' + s);
    if (btn) btn.addEventListener('click', function () { APP.Hospital.applyStatus(s); });
  });

  document.getElementById('hospitalOverviewBtn').addEventListener('click', APP.Hospital.openOverview);
  document.getElementById('hospitalOverviewCloseBtn').addEventListener('click', function () {
    document.getElementById('hospitalOverviewModal').classList.add('hidden');
  });
  document.getElementById('hospitalOverviewBody').addEventListener('click', function (ev) {
    var row = ev.target.closest('[data-triage-id]');
    if (!row) return;
    var p = APP.Board.state.patients.find(function (x) { return x.triageId === row.dataset.triageId; });
    if (p) APP.Hospital.openPatientDetail(p);
  });

  document.getElementById('addAmbulanceBtn').addEventListener('click', APP.Hospital.openAddAmbulanceModal);
  document.getElementById('ambulanceAddCancelBtn').addEventListener('click', APP.Hospital.closeAddAmbulanceModal);
  document.getElementById('ambulanceAddSubmitBtn').addEventListener('click', APP.Hospital.submitAddSelectedAmbulances);
  document.getElementById('ambulanceSelectAll').addEventListener('change', function (ev) {
    document.querySelectorAll('.ambulance-add-checkbox').forEach(function (cb) { cb.checked = ev.target.checked; });
  });

  document.getElementById('showCreateAmbulanceBtn').addEventListener('click', function () {
    document.getElementById('createAmbulanceForm').classList.toggle('hidden');
  });
  document.getElementById('cancelCreateAmbulanceBtn').addEventListener('click', function () {
    document.getElementById('createAmbulanceForm').classList.add('hidden');
  });
  document.getElementById('submitCreateAmbulanceBtn').addEventListener('click', APP.Hospital.submitCreateAmbulance);

  document.getElementById('editAmbulanceCancelBtn').addEventListener('click', function () {
    document.getElementById('editAmbulanceModal').classList.add('hidden');
  });
  document.getElementById('editAmbulanceSaveBtn').addEventListener('click', APP.Hospital.saveEditAmbulance);
};

// ─── 加入醫院（可勾選多間，一次送出；也能新增／編輯主檔） ──────────────────────────
APP.Hospital.openAddModal = function () {
  var list = document.getElementById('hospitalMasterList');
  list.innerHTML = '載入中...';
  document.getElementById('hospitalSelectAll').checked = false;
  document.getElementById('hospitalAddModal').classList.remove('hidden');
  APP.Api.get('getHospitalMaster', {}).then(function (res) {
    list.innerHTML = '';
    if (res.status !== 'success' || res.data.length === 0) {
      list.innerHTML = '<div class="empty-hint">醫院主檔沒有資料，請按上方「＋新增醫院」建立第一筆。</div>';
      return;
    }
    res.data.forEach(function (h) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e2e8f0;padding:8px 4px;';

      var label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'hospital-add-checkbox';
      cb.value = h.hospitalId;
      var span = document.createElement('span');
      span.textContent = h.name + '（' + h.hospitalId + '）';
      label.appendChild(cb);
      label.appendChild(span);
      row.appendChild(label);

      var editBtn = document.createElement('button');
      editBtn.textContent = '編輯';
      editBtn.style.cssText = 'padding:4px 8px;background:#e2e8f0;border:none;border-radius:6px;font-size:12px;flex-shrink:0;';
      editBtn.addEventListener('click', function () { APP.Hospital.openEditHospital(h); });
      row.appendChild(editBtn);

      list.appendChild(row);
    });
  });
};

APP.Hospital.closeAddModal = function () {
  document.getElementById('hospitalAddModal').classList.add('hidden');
  document.getElementById('createHospitalForm').classList.add('hidden');
};

APP.Hospital.submitCreateHospital = function () {
  var name = document.getElementById('newHospitalName').value.trim();
  if (!name) { APP.UI.alert('請輸入醫院名稱。'); return; }
  var address = document.getElementById('newHospitalAddress').value.trim();
  var phone = document.getElementById('newHospitalPhone').value.trim();
  var adminPassword = APP.UI.promptAdminPassword();
  if (adminPassword === null) return;

  APP.Api.post('createHospitalMasterAndAdd', APP.DragDrop.withSession({
    name: name, address: address, phone: phone, adminPassword: adminPassword,
  })).then(function (r) {
    if (r.status !== 'success') { APP.UI.alert(r.message || '建立失敗'); return; }
    document.getElementById('newHospitalName').value = '';
    document.getElementById('newHospitalAddress').value = '';
    document.getElementById('newHospitalPhone').value = '';
    APP.Hospital.closeAddModal();
    APP.Board.refresh();
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

APP.Hospital.currentEditingHospitalId = null;

APP.Hospital.openEditHospital = function (h) {
  APP.Hospital.currentEditingHospitalId = h.hospitalId;
  document.getElementById('editHospitalName').value = h.name || '';
  document.getElementById('editHospitalAddress').value = h.address || '';
  document.getElementById('editHospitalPhone').value = h.phone || '';
  document.getElementById('editHospitalModal').classList.remove('hidden');
};

APP.Hospital.saveEditHospital = function () {
  var name = document.getElementById('editHospitalName').value.trim();
  if (!name) { APP.UI.alert('請輸入醫院名稱。'); return; }
  var adminPassword = APP.UI.promptAdminPassword();
  if (adminPassword === null) return;

  APP.Api.post('updateHospitalMaster', APP.DragDrop.withSession({
    hospitalId: APP.Hospital.currentEditingHospitalId,
    name: name,
    address: document.getElementById('editHospitalAddress').value.trim(),
    phone: document.getElementById('editHospitalPhone').value.trim(),
    adminPassword: adminPassword,
  })).then(function (r) {
    if (r.status !== 'success') { APP.UI.alert(r.message || '更新失敗'); return; }
    document.getElementById('editHospitalModal').classList.add('hidden');
    APP.Hospital.openAddModal(); // 重新載入清單，顯示更新後的資料
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

APP.Hospital.submitAddSelectedHospitals = function () {
  var ids = Array.prototype.slice.call(document.querySelectorAll('.hospital-add-checkbox:checked'))
    .map(function (cb) { return cb.value; });
  if (ids.length === 0) { APP.UI.alert('請至少勾選一間醫院。'); return; }

  APP.Api.post('addHospitalsToIncident', APP.DragDrop.withSession({ hospitalIds: ids })).then(function (r) {
    if (r.status !== 'success') { APP.UI.alert(r.message || '加入失敗'); return; }
    APP.Hospital.closeAddModal();
    APP.Board.refresh();
    if (r.skipped && r.skipped.length > 0) {
      APP.UI.alert('已加入 ' + r.added.length + ' 間；略過 ' + r.skipped.length + ' 間（已在本案件中或主檔查無資料）。');
    }
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

APP.Hospital.openStatusPicker = function (h) {
  APP.Hospital.currentHospital = h;
  document.getElementById('hospitalStatusTitle').textContent = h.name + ' — 收治狀態（僅供提示，不會阻擋派遣）';
  document.getElementById('hospitalStatusModal').classList.remove('hidden');
};

APP.Hospital.closeStatusPicker = function () {
  document.getElementById('hospitalStatusModal').classList.add('hidden');
};

APP.Hospital.applyStatus = function (status) {
  if (!APP.Hospital.currentHospital) return;
  APP.Api.post('toggleHospitalStatus', APP.DragDrop.withSession({
    hospitalId: APP.Hospital.currentHospital.hospitalId, newStatus: status,
  })).then(function (res) {
    if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
    APP.Hospital.closeStatusPicker();
    APP.Board.refresh();
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

// ─── 加入救護車（可勾選多輛，一次送出；也能新增／編輯主檔） ──────────────────────────
APP.Hospital.openAddAmbulanceModal = function () {
  var list = document.getElementById('ambulanceMasterList');
  list.innerHTML = '載入中...';
  document.getElementById('ambulanceSelectAll').checked = false;
  document.getElementById('ambulanceAddModal').classList.remove('hidden');
  APP.Api.get('getAmbulanceMaster', {}).then(function (res) {
    list.innerHTML = '';
    if (res.status !== 'success' || res.data.length === 0) {
      list.innerHTML = '<div class="empty-hint">救護車主檔沒有資料，請按上方「＋新增救護車」建立第一輛。</div>';
      return;
    }
    res.data.forEach(function (v) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e2e8f0;padding:8px 4px;';

      var label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ambulance-add-checkbox';
      cb.value = v.masterRow; // 用試算表列號而不是車輛代碼，代碼在不同單位間常常重複
      var span = document.createElement('span');
      span.textContent = v.unitName + ' ' + v.vehicleCode + '（' + v.unitType + '）';
      label.appendChild(cb);
      label.appendChild(span);
      row.appendChild(label);

      var editBtn = document.createElement('button');
      editBtn.textContent = '編輯';
      editBtn.style.cssText = 'padding:4px 8px;background:#e2e8f0;border:none;border-radius:6px;font-size:12px;flex-shrink:0;';
      editBtn.addEventListener('click', function () { APP.Hospital.openEditAmbulance(v); });
      row.appendChild(editBtn);

      list.appendChild(row);
    });
  });
};

APP.Hospital.closeAddAmbulanceModal = function () {
  document.getElementById('ambulanceAddModal').classList.add('hidden');
  document.getElementById('createAmbulanceForm').classList.add('hidden');
};

APP.Hospital.submitCreateAmbulance = function () {
  var vehicleCode = document.getElementById('newAmbulanceVehicleCode').value.trim();
  if (!vehicleCode) { APP.UI.alert('請輸入車輛代碼。'); return; }
  var adminPassword = APP.UI.promptAdminPassword();
  if (adminPassword === null) return;

  APP.Api.post('createAmbulanceMasterAndAdd', APP.DragDrop.withSession({
    vehicleCode: vehicleCode,
    unitType: document.getElementById('newAmbulanceUnitType').value.trim(),
    unitName: document.getElementById('newAmbulanceUnitName').value.trim(),
    plateLast4: document.getElementById('newAmbulancePlateLast4').value.trim(),
    crew: document.getElementById('newAmbulanceCrew').value.trim(),
    adminPassword: adminPassword,
  })).then(function (r) {
    if (r.status !== 'success') { APP.UI.alert(r.message || '建立失敗'); return; }
    document.getElementById('newAmbulanceVehicleCode').value = '';
    document.getElementById('newAmbulanceUnitType').value = '';
    document.getElementById('newAmbulanceUnitName').value = '';
    document.getElementById('newAmbulancePlateLast4').value = '';
    document.getElementById('newAmbulanceCrew').value = '';
    APP.Hospital.closeAddAmbulanceModal();
    APP.Board.refresh();
    if (r.assignedVehicleCode && r.assignedVehicleCode !== vehicleCode) {
      APP.UI.alert('提醒：這個代碼「' + vehicleCode + '」已經有別的單位在用，系統自動改成「' + r.assignedVehicleCode + '」來區分，救護車已成功加入。');
    }
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

APP.Hospital.currentEditingVehicleCode = null;

APP.Hospital.openEditAmbulance = function (v) {
  APP.Hospital.currentEditingVehicleCode = v.vehicleCode;
  document.getElementById('editAmbulanceVehicleCodeLabel').textContent = '車輛代碼：' + v.vehicleCode + '（代碼本身不可修改）';
  document.getElementById('editAmbulanceUnitType').value = v.unitType || '';
  document.getElementById('editAmbulanceUnitName').value = v.unitName || '';
  document.getElementById('editAmbulancePlateLast4').value = v.plateLast4 || '';
  document.getElementById('editAmbulanceCrew').value = v.defaultCrew || '';
  document.getElementById('editAmbulanceModal').classList.remove('hidden');
};

APP.Hospital.saveEditAmbulance = function () {
  var adminPassword = APP.UI.promptAdminPassword();
  if (adminPassword === null) return;

  APP.Api.post('updateAmbulanceMaster', APP.DragDrop.withSession({
    vehicleCode: APP.Hospital.currentEditingVehicleCode,
    unitType: document.getElementById('editAmbulanceUnitType').value.trim(),
    unitName: document.getElementById('editAmbulanceUnitName').value.trim(),
    plateLast4: document.getElementById('editAmbulancePlateLast4').value.trim(),
    crew: document.getElementById('editAmbulanceCrew').value.trim(),
    adminPassword: adminPassword,
  })).then(function (r) {
    if (r.status !== 'success') { APP.UI.alert(r.message || '更新失敗'); return; }
    document.getElementById('editAmbulanceModal').classList.add('hidden');
    APP.Hospital.openAddAmbulanceModal(); // 重新載入清單，顯示更新後的資料
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

APP.Hospital.submitAddSelectedAmbulances = function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll('.ambulance-add-checkbox:checked'))
    .map(function (cb) { return Number(cb.value); });
  if (rows.length === 0) { APP.UI.alert('請至少勾選一輛救護車。'); return; }

  APP.Api.post('addAmbulancesToIncident', APP.DragDrop.withSession({ masterRows: rows })).then(function (r) {
    if (r.status !== 'success') { APP.UI.alert(r.message || '加入失敗'); return; }
    APP.Hospital.closeAddAmbulanceModal();
    APP.Board.refresh();
    if (r.skipped && r.skipped.length > 0) {
      APP.UI.alert('已加入 ' + r.added.length + ' 輛；略過 ' + r.skipped.length + ' 輛（已在本案件中或主檔查無資料）。');
    }
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};

// ─── 各院收治情形總覽（純前端彙整既有看板資料，不用另外呼叫後端） ──────────
// 用 p.hospitalId 而不是 ambulance.patientIds 篩選，這樣即使傷患已經「卸下」
// （離開救護車的車上清單），只要送達醫院ID還在，一樣會列在該院名下。
// 抽成獨立函式是因為操作看板內的彈窗版、以及登入畫面「只看醫院總覽」的獨立頁面版，
// 需要用同一套渲染邏輯（差別只在資料來源與外層容器）。
APP.Hospital.buildOverviewHTML = function (hospitals, patients, masked) {
  if (hospitals.length === 0) {
    return '<div class="empty-hint">本案件尚未加入任何醫院。</div>';
  }
  return hospitals.map(function (h) {
    var hp = patients.filter(function (p) { return p.hospitalId === h.hospitalId; });
    var rows = hp.length === 0
      ? '<div class="empty-hint" style="padding:8px 0;">目前無傷患</div>'
      : hp.map(function (p) {
        var nameLine = masked ? '' : ('　' + (p.name || '無名氏'));
        return '<div data-triage-id="' + p.triageId + '" style="padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:14px;cursor:pointer;">' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle;background:' +
          (COLOR_DOT[p.color] || '#94a3b8') + ';"></span>' +
          p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色）' +
          (p.tagNumber ? '　貼紙:' + p.tagNumber : '') + nameLine +
          ' <span style="color:#94a3b8;">▸點看照片/傷情</span>' +
          '</div>';
      }).join('');
    return '<div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">' +
      '<div style="background:#f8fafc;padding:8px 12px;font-weight:700;display:flex;justify-content:space-between;gap:8px;">' +
      '<span>' + h.name + '</span>' +
      '<span style="font-weight:400;font-size:13px;color:#64748b;">' +
      (HOSP_STATUS_LABEL[h.status] || h.status) + '　共 ' + hp.length + ' 人</span>' +
      '</div>' +
      '<div style="padding:2px 12px;">' + rows + '</div>' +
      '</div>';
  }).join('');
};

APP.Hospital.openOverview = function () {
  document.getElementById('hospitalOverviewBody').innerHTML =
    APP.Hospital.buildOverviewHTML(APP.Board.state.hospitals, APP.Board.state.patients, APP.Board.state.masked);
  document.getElementById('hospitalOverviewModal').classList.remove('hidden');
};

// ─── 傷患詳情（照片＋傷情）：從總覽點傷患開啟 ──────────────────────────
// opts 可選填 { masked, session }：操作看板／患者卡片等既有呼叫點不帶 opts，
// 沿用 APP.Board.state.masked + APP.Auth.getSession()；獨立的「醫院總覽（唯讀）」
// 頁面沒有 APP.Board.state（不會跑 board.js 的輪詢），需要明確帶入自己的遮蔽狀態與登入資訊。
APP.Hospital.openPatientDetail = function (p, opts) {
  opts = opts || {};
  var masked = ('masked' in opts) ? opts.masked : APP.Board.state.masked;

  document.getElementById('patientDetailTitle').textContent =
    p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色）' + (p.tagNumber ? '　貼紙:' + p.tagNumber : '');

  var photoBlock = document.getElementById('patientDetailPhotoBlock');
  var body = document.getElementById('patientDetailBody');

  if (masked) {
    photoBlock.innerHTML = '';
    body.innerHTML = '<div class="empty-hint">姓名、照片、傷情等機敏資料目前處於遮蔽狀態，請先在登入畫面輸入本案件的共用驗證碼。</div>';
    document.getElementById('patientDetailModal').classList.remove('hidden');
    return;
  }

  var historyHtml = (p.colorHistory || []).map(function (h) {
    var t = h.time ? new Date(h.time).toLocaleString('zh-TW', { hour12: false }) : '';
    return '<div style="font-size:12px;color:#64748b;">' + t + '　' + (COLOR_LABEL[h.color] || h.color) + '色　' + (h.by || '') + '</div>';
  }).join('');

  body.innerHTML =
    '<div><b>姓名：</b>' + (p.name || '無名氏') + '　<b>性別：</b>' + (p.gender || '不明') + '　<b>年齡：</b>' + (p.age || '不明') + '</div>' +
    '<div><b>傷情/備註：</b>' + (p.note ? p.note.replace(/</g, '&lt;') : '（無）') + '</div>' +
    '<div><b>分類歷程：</b></div>' + (historyHtml || '<div class="empty-hint" style="padding:2px 0;">無紀錄</div>');

  photoBlock.innerHTML = '<div class="empty-hint">照片載入中...</div>';
  document.getElementById('patientDetailModal').classList.remove('hidden');

  if (!p.photoFileId) {
    photoBlock.innerHTML = '<div class="empty-hint">此傷患沒有照片。</div>';
    return;
  }

  var session = opts.session || APP.Auth.getSession();
  APP.Api.get('getPatientPhoto', {
    incidentId: session.incidentId, patientId: p.triageId, passcode: session.passcode,
  }).then(function (res) {
    if (res.status !== 'success') {
      photoBlock.innerHTML = '<div class="empty-hint">' + (res.message || '照片讀取失敗') + '</div>';
      return;
    }
    photoBlock.innerHTML = '<img src="' + res.dataUrl + '" style="width:100%;border-radius:8px;display:block;">';
  }).catch(function () {
    photoBlock.innerHTML = '<div class="empty-hint">網路錯誤，照片讀取失敗。</div>';
  });
};

// patientDetailModal 的關閉鈕在操作看板與獨立的「醫院總覽（唯讀）」頁面都會用到，
// 兩者只有一個會呼叫 APP.Hospital.init()（操作看板才會），所以這裡獨立、無條件地在
// 頁面載入時就綁好，不依賴使用者走哪一個登入路徑。
document.addEventListener('DOMContentLoaded', function () {
  var closeBtn = document.getElementById('patientDetailCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      document.getElementById('patientDetailModal').classList.add('hidden');
    });
  }
});
