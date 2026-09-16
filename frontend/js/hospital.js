APP.Hospital = APP.Hospital || {};
APP.Hospital.currentHospital = null;

APP.Hospital.init = function () {
  document.getElementById('addHospitalBtn').addEventListener('click', APP.Hospital.openAddModal);
  document.getElementById('hospitalAddCancelBtn').addEventListener('click', APP.Hospital.closeAddModal);
  document.getElementById('hospitalStatusCancelBtn').addEventListener('click', APP.Hospital.closeStatusPicker);
  ['AVAILABLE', 'LIMITED', 'FULL', 'UNKNOWN'].forEach(function (s) {
    var btn = document.getElementById('hospStatusBtn_' + s);
    if (btn) btn.addEventListener('click', function () { APP.Hospital.applyStatus(s); });
  });

  document.getElementById('addAmbulanceBtn').addEventListener('click', APP.Hospital.openAddAmbulanceModal);
  document.getElementById('ambulanceAddCancelBtn').addEventListener('click', APP.Hospital.closeAddAmbulanceModal);
};

APP.Hospital.openAddModal = function () {
  var list = document.getElementById('hospitalMasterList');
  list.innerHTML = '載入中...';
  document.getElementById('hospitalAddModal').classList.remove('hidden');
  APP.Api.get('getHospitalMaster', {}).then(function (res) {
    list.innerHTML = '';
    if (res.status !== 'success' || res.data.length === 0) {
      list.innerHTML = '<div class="empty-hint">醫院主檔沒有資料，請先在 Google 試算表「醫院主檔」分頁新增。</div>';
      return;
    }
    res.data.forEach(function (h) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:8px 0;gap:8px;';
      var label = document.createElement('span');
      label.textContent = h.name + '（' + h.hospitalId + '）';
      row.appendChild(label);
      var btn = document.createElement('button');
      btn.textContent = '加入本案件';
      btn.style.cssText = 'padding:6px 10px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:12px;';
      btn.addEventListener('click', function () {
        APP.Api.post('addHospitalToIncident', APP.DragDrop.withSession({ hospitalId: h.hospitalId })).then(function (r) {
          if (r.status !== 'success') { APP.UI.alert(r.message || '加入失敗'); return; }
          APP.Hospital.closeAddModal();
          APP.Board.refresh();
        });
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  });
};

APP.Hospital.closeAddModal = function () {
  document.getElementById('hospitalAddModal').classList.add('hidden');
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

APP.Hospital.openAddAmbulanceModal = function () {
  var list = document.getElementById('ambulanceMasterList');
  list.innerHTML = '載入中...';
  document.getElementById('ambulanceAddModal').classList.remove('hidden');
  APP.Api.get('getAmbulanceMaster', {}).then(function (res) {
    list.innerHTML = '';
    if (res.status !== 'success' || res.data.length === 0) {
      list.innerHTML = '<div class="empty-hint">救護車主檔沒有資料，請先在 Google 試算表「救護車主檔」分頁新增。</div>';
      return;
    }
    res.data.forEach(function (v) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:8px 0;gap:8px;';
      var label = document.createElement('span');
      label.textContent = v.unitName + ' ' + v.vehicleCode + '（' + v.unitType + '）';
      row.appendChild(label);
      var btn = document.createElement('button');
      btn.textContent = '加入本案件';
      btn.style.cssText = 'padding:6px 10px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12px;';
      btn.addEventListener('click', function () {
        APP.Api.post('addAmbulanceToIncident', APP.DragDrop.withSession({ vehicleCode: v.vehicleCode })).then(function (r) {
          if (r.status !== 'success') { APP.UI.alert(r.message || '加入失敗'); return; }
          APP.Hospital.closeAddAmbulanceModal();
          APP.Board.refresh();
        });
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  });
};

APP.Hospital.closeAddAmbulanceModal = function () {
  document.getElementById('ambulanceAddModal').classList.add('hidden');
};
