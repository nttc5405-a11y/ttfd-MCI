APP.UI = APP.UI || {};

APP.UI.alert = function (message) {
  window.alert(message);
};

APP.UI.confirm = function (message, onYes) {
  if (window.confirm(message)) onYes();
};

// 車牌後4碼確認彈窗（拖曳救護車的動作都必須先過這關，避免誤觸）
APP.UI.promptPlate = function (ambulanceId, onConfirmed) {
  var modal = document.getElementById('plateModal');
  var input = document.getElementById('plateInput');
  var label = document.getElementById('plateModalVehicle');
  label.textContent = ambulanceId;
  input.value = '';
  modal.classList.remove('hidden');
  setTimeout(function () { input.focus(); }, 50);

  var confirmBtn = document.getElementById('plateConfirmBtn');
  var cancelBtn = document.getElementById('plateCancelBtn');

  function cleanup() {
    modal.classList.add('hidden');
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
  }
  function onConfirm() {
    var v = input.value.trim();
    if (!/^\d{4}$/.test(v)) {
      APP.UI.alert('請輸入車牌後4碼（4個數字）。');
      return;
    }
    cleanup();
    onConfirmed(v);
  }
  function onCancel() {
    cleanup();
  }
  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
};
