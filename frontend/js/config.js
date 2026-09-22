// ⚠️ 部署前必填：把 Apps Script 部署後拿到的網址貼在下面，
// 並確認 API_TOKEN 跟 backend/Code.gs 裡 CONFIG.API_TOKEN 完全一致（兩邊要手動保持同步）。
var APP = window.APP || {};

APP.Config = {
  API_TOKEN: 'DAMS_2026_nttccc5405',
  BASE_URL: 'https://script.google.com/macros/s/AKfycbz9PCBCEodm7XiLFU6_sNA-EA0oaKBZLrRyulDvctBgYAFoD7dnB7X8P4FPvT5r2PA2tw/exec',
  POLL_INTERVAL_MS: 3000,
};

APP.Api = {
  get: function (action, params) {
    params = params || {};
    var url = APP.Config.BASE_URL + '?action=' + encodeURIComponent(action) +
      '&token=' + encodeURIComponent(APP.Config.API_TOKEN);
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }
    });
    return fetch(url).then(function (r) { return r.json(); });
  },
  post: function (action, payload) {
    payload = payload || {};
    payload.action = action;
    payload.token = APP.Config.API_TOKEN;
    // 每個寫入動作都跳「資料建置中」提示並蓋住畫面，一方面讓操作者知道系統
    // 正在處理、不是沒按到，一方面也順便擋掉手快連點造成同一動作重複送出。
    // 查詢/輪詢（get）不會頻繁跳提示打斷畫面，所以只包這裡（post）。
    if (APP.UI && APP.UI.showLoading) APP.UI.showLoading('資料建置中...');
    // 刻意不設定 Content-Type（讓瀏覽器預設送 text/plain），
    // 這樣呼叫 Apps Script 才不會觸發 CORS 預檢請求而失敗。
    return fetch(APP.Config.BASE_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); }).finally(function () {
      if (APP.UI && APP.UI.hideLoading) APP.UI.hideLoading();
    });
  },
};
