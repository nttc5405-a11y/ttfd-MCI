APP.UI = APP.UI || {};

APP.UI.alert = function (message) {
  window.alert(message);
};

APP.UI.confirm = function (message, onYes) {
  if (window.confirm(message)) onYes();
};

// 車牌後4碼確認彈窗（拖曳救護車的動作都必須先過這關，避免誤觸）
// displayLabel 是給使用者看的名稱（例如「南區分隊 91」），跟實際送給後端比對用的
// ambulanceId 分開——ambulanceId 有時候是系統為了區分不同單位相同車號而自動組合過的
// 內部代碼，不適合直接顯示給使用者看，會造成困惑。
APP.UI.promptPlate = function (ambulanceId, onConfirmed, displayLabel) {
  var modal = document.getElementById('plateModal');
  var input = document.getElementById('plateInput');
  var label = document.getElementById('plateModalVehicle');
  label.textContent = displayLabel || ambulanceId;
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
