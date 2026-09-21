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

  document.getElementById('addAmbulanceBtn').addEventListener('click', APP.Hospital.openAddAmbulanceModal);
  document.getElementById('ambulanceAddCancelBtn').addEventListener('click', APP.Hospital.closeAddAmbulanceModal);
  document.getElementById('ambulanceAddSubmitBtn').addEventListener('click', APP.Hospital.submitAddSelectedAmbulances);
  document.getElementById('ambulanceSelectAll').addEventListener('change', function (ev) {
    document.querySelectorAll('.ambulance-add-checkbox').forEach(function (cb) { cb.checked = ev.target.checked; });
  });
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

  APP.Api.post('createHospitalMasterAndAdd', APP.DragDrop.withSession({
    name: name, address: address, phone: phone,
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

  APP.Api.post('updateHospitalMaster', APP.DragDrop.withSession({
    hospitalId: APP.Hospital.currentEditingHospitalId,
    name: name,
    address: document.getElementById('editHospitalAddress').value.trim(),
    phone: document.getElementById('editHospitalPhone').value.trim(),
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

// ─── 加入救護車（可勾選多輛，一次送出） ──────────────────────────
APP.Hospital.openAddAmbulanceModal = function () {
  var list = document.getElementById('ambulanceMasterList');
  list.innerHTML = '載入中...';
  document.getElementById('ambulanceSelectAll').checked = false;
  document.getElementById('ambulanceAddModal').classList.remove('hidden');
  APP.Api.get('getAmbulanceMaster', {}).then(function (res) {
    list.innerHTML = '';
    if (res.status !== 'success' || res.data.length === 0) {
      list.innerHTML = '<div class="empty-hint">救護車主檔沒有資料，請先在 Google 試算表「救護車主檔」分頁新增。</div>';
      return;
    }
    res.data.forEach(function (v) {
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;border-bottom:1px solid #e2e8f0;padding:8px 4px;';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ambulance-add-checkbox';
      cb.value = v.vehicleCode;
      var label = document.createElement('span');
      label.textContent = v.unitName + ' ' + v.vehicleCode + '（' + v.unitType + '）';
      row.appendChild(cb);
      row.appendChild(label);
      list.appendChild(row);
    });
  });
};

APP.Hospital.closeAddAmbulanceModal = function () {
  document.getElementById('ambulanceAddModal').classList.add('hidden');
};

APP.Hospital.submitAddSelectedAmbulances = function () {
  var codes = Array.prototype.slice.call(document.querySelectorAll('.ambulance-add-checkbox:checked'))
    .map(function (cb) { return cb.value; });
  if (codes.length === 0) { APP.UI.alert('請至少勾選一輛救護車。'); return; }

  APP.Api.post('addAmbulancesToIncident', APP.DragDrop.withSession({ vehicleCodes: codes })).then(function (r) {
    if (r.status !== 'success') { APP.UI.alert(r.message || '加入失敗'); return; }
    APP.Hospital.closeAddAmbulanceModal();
    APP.Board.refresh();
    if (r.skipped && r.skipped.length > 0) {
      APP.UI.alert('已加入 ' + r.added.length + ' 輛；略過 ' + r.skipped.length + ' 輛（已在本案件中或主檔查無資料）。');
    }
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};
