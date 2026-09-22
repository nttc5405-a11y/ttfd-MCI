APP.UI = APP.UI || {};

APP.UI.alert = function (message) {
  window.alert(message);
};

APP.UI.confirm = function (message, onYes) {
  if (window.confirm(message)) onYes();
};

// 管理員密碼輸入（系統若未啟用管理員密碼保護，留空送出後端會直接放行）。
// 回傳 null 代表使用者按了取消，呼叫端應該直接中止、不要送出請求。
APP.UI.promptAdminPassword = function () {
  return window.prompt('請輸入管理員密碼（系統若未啟用，留空即可）：');
};

// 跑馬燈文字——內容在試算表「系統設定」分頁的「跑馬燈訊息」設定，留空就不顯示。
// 依文字長度調整捲動速度，避免太短的訊息捲得太快、太長的訊息捲得太慢。
APP.UI.setMarquee = function (text) {
  var bar = document.getElementById('marqueeBar');
  var span = document.getElementById('marqueeText');
  if (!bar || !span) return;
  if (!text) {
    bar.classList.add('hidden');
    return;
  }
  span.textContent = text;
  bar.classList.remove('hidden');
  var track = bar.querySelector('.marquee-track');
  if (track) track.style.animationDuration = Math.max(10, text.length * 0.35) + 's';
};

// 資料寫入中的全螢幕提示——蓋住畫面＋文字，讓操作者知道系統正在處理
// （不是沒按到），同時順便擋掉手快連點造成同一動作被重複送出兩次。
// 用計數器而不是布林值，是因為理論上可能同時有一個以上的寫入動作在跑
// （例如批次送出的過程中又觸發別的動作），要等全部處理完才能真正隱藏。
APP.UI.loadingCount = 0;
APP.UI.showLoading = function (message) {
  APP.UI.loadingCount++;
  var overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  document.getElementById('loadingOverlayText').textContent = message || '處理中...';
  overlay.classList.remove('hidden');
};
APP.UI.hideLoading = function () {
  APP.UI.loadingCount = Math.max(0, APP.UI.loadingCount - 1);
  if (APP.UI.loadingCount > 0) return;
  var overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
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
