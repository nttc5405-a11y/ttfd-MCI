// 拍照 + 手動拖框馬賽克（刻意不用自動人臉辨識：現場光線/角度不穩定會不可靠，
// 且對非工程師使用者而言，辨識失敗時很難排除問題；手動拖框簡單、所見即所得）
//
// 四個狀態，對應四個子區塊的顯示/隱藏（見 index.html 的 #cameraBlock）：
//   idle     — 只顯示「新增照片」按鈕，不啟動相機（進表單不該自動要求相機權限/耗電）
//   choosing — 顯示「拍照」／「從相簿選取」兩個按鈕
//   camera   — 顯示即時相機畫面＋「拍下」／「取消」
//   captured — 顯示已拍/已選的照片＋馬賽克／重拍按鈕
APP.Camera = APP.Camera || {};
APP.Camera.stream = null;
APP.Camera.hasPhoto = false;
APP.Camera.mosaicApplied = false;
APP.Camera.selection = null;
APP.Camera.originalImageData = null;
APP.Camera.state = 'idle';
APP.Camera.idleHintOverride = '';

APP.Camera.render = function () {
  var s = APP.Camera.state;
  document.getElementById('photoIdleBlock').classList.toggle('hidden', s !== 'idle');
  document.getElementById('photoChooseBlock').classList.toggle('hidden', s !== 'choosing');
  document.getElementById('photoCameraLiveBlock').classList.toggle('hidden', s !== 'camera');
  document.getElementById('photoCanvas').classList.toggle('hidden', s !== 'captured');
  document.getElementById('photoResultActions').classList.toggle('hidden', s !== 'captured');

  var hint = document.getElementById('cameraHint');
  if (s === 'idle') {
    hint.textContent = APP.Camera.idleHintOverride || '可選擇拍照或從相簿選取傷患照片（選用，不加照片也能送出）。';
  } else if (s === 'choosing') {
    hint.textContent = '請選擇要用相機拍照，還是從相簿選取既有照片。';
  } else if (s === 'camera') {
    hint.textContent = '相機啟動中，請對準傷患臉部後按「拍下」。';
  } else if (s === 'captured') {
    hint.textContent = '如需保護隱私，可用手指在臉部拖曳方框後按「套用馬賽克」；這是選用步驟，不套用也能直接送出。';
  }
};

// idleHint（選填）：編輯模式要提醒「不拍就保留原照片」，跟建立模式的預設文字不同。
APP.Camera.reset = function (idleHint) {
  APP.Camera.stop();
  APP.Camera.hasPhoto = false;
  APP.Camera.mosaicApplied = false;
  APP.Camera.selection = null;
  APP.Camera.originalImageData = null;
  var canvas = document.getElementById('photoCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  APP.Camera.idleHintOverride = idleHint || '';
  APP.Camera.state = 'idle';
  APP.Camera.render();
};

APP.Camera.showChoice = function () {
  APP.Camera.state = 'choosing';
  APP.Camera.render();
};

APP.Camera.enterCameraMode = function () {
  APP.Camera.state = 'camera';
  APP.Camera.render();
  APP.Camera.start();
};

APP.Camera.cancelCameraMode = function () {
  APP.Camera.stop();
  APP.Camera.state = 'idle';
  APP.Camera.render();
};

APP.Camera.start = function () {
  var video = document.getElementById('cameraVideo');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('cameraHint').textContent = '此瀏覽器不支援相機功能，請改用「從相簿選取」。';
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
    APP.Camera.stream = stream;
    video.srcObject = stream;
  }).catch(function (err) {
    document.getElementById('cameraHint').textContent = '無法開啟相機：' + (err.message || err.name) + '（可改用「從相簿選取」）';
  });
};

APP.Camera.stop = function () {
  if (APP.Camera.stream) {
    APP.Camera.stream.getTracks().forEach(function (t) { t.stop(); });
    APP.Camera.stream = null;
  }
};

APP.Camera.capture = function () {
  var video = document.getElementById('cameraVideo');
  var canvas = document.getElementById('photoCanvas');
  if (!video.videoWidth) { APP.UI.alert('相機尚未就緒，請稍候再試一次。'); return; }

  var maxW = 900;
  var scale = Math.min(1, maxW / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  var ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  APP.Camera.stop();
  APP.Camera.hasPhoto = true;
  APP.Camera.mosaicApplied = false;
  APP.Camera.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  APP.Camera.state = 'captured';
  APP.Camera.render();
};

// 從相簿／檔案選一張現有照片，縮到跟拍照一樣的最大寬度後畫進同一個 canvas，
// 之後的馬賽克、送出流程跟拍照完全一樣。
APP.Camera.loadFromFile = function (file) {
  if (!file) return;
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    var canvas = document.getElementById('photoCanvas');
    var maxW = 900;
    var scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    APP.Camera.stop();
    APP.Camera.hasPhoto = true;
    APP.Camera.mosaicApplied = false;
    APP.Camera.selection = null;
    APP.Camera.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    APP.Camera.state = 'captured';
    APP.Camera.render();
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    APP.UI.alert('這個檔案無法當作圖片開啟，請改選其他照片。');
  };
  img.src = url;
};

APP.Camera.bindSelection = function () {
  var canvas = document.getElementById('photoCanvas');
  var dragging = false;
  var startX = 0, startY = 0;

  function getPos(ev) {
    var rect = canvas.getBoundingClientRect();
    var clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    var clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }
  function onStart(ev) {
    if (!APP.Camera.hasPhoto) return;
    ev.preventDefault();
    dragging = true;
    var p = getPos(ev);
    startX = p.x; startY = p.y;
    APP.Camera.selection = { x: startX, y: startY, w: 0, h: 0 };
  }
  function onMove(ev) {
    if (!dragging) return;
    ev.preventDefault();
    var p = getPos(ev);
    APP.Camera.selection = {
      x: Math.min(startX, p.x), y: Math.min(startY, p.y),
      w: Math.abs(p.x - startX), h: Math.abs(p.y - startY),
    };
    APP.Camera.redrawWithSelectionBox();
  }
  function onEnd() { dragging = false; }

  canvas.addEventListener('mousedown', onStart);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onEnd);
  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd);
};

APP.Camera.redrawWithSelectionBox = function () {
  var canvas = document.getElementById('photoCanvas');
  var ctx = canvas.getContext('2d');
  if (APP.Camera.originalImageData) ctx.putImageData(APP.Camera.originalImageData, 0, 0);
  var s = APP.Camera.selection;
  if (s && s.w > 2 && s.h > 2) {
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  }
};

APP.Camera.applyMosaic = function () {
  var s = APP.Camera.selection;
  if (!APP.Camera.hasPhoto) { APP.UI.alert('請先拍照。'); return; }
  if (!s || s.w < 5 || s.h < 5) { APP.UI.alert('請先在臉部拖曳一個方框。'); return; }

  var canvas = document.getElementById('photoCanvas');
  var ctx = canvas.getContext('2d');
  if (APP.Camera.originalImageData) ctx.putImageData(APP.Camera.originalImageData, 0, 0);

  var x = Math.max(0, Math.round(s.x));
  var y = Math.max(0, Math.round(s.y));
  var w = Math.min(Math.round(s.w), canvas.width - x);
  var h = Math.min(Math.round(s.h), canvas.height - y);
  if (w <= 0 || h <= 0) return;

  var region = ctx.getImageData(x, y, w, h);
  var tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(region, 0, 0);

  var pixelSize = Math.max(6, Math.round(Math.min(w, h) / 12));
  var smallW = Math.max(1, Math.round(w / pixelSize));
  var smallH = Math.max(1, Math.round(h / pixelSize));
  var small = document.createElement('canvas');
  small.width = smallW; small.height = smallH;
  small.getContext('2d').drawImage(tmp, 0, 0, smallW, smallH);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, smallW, smallH, x, y, w, h);
  ctx.imageSmoothingEnabled = true;

  APP.Camera.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  APP.Camera.selection = null;
  APP.Camera.mosaicApplied = true;
  document.getElementById('cameraHint').textContent = '已套用馬賽克。若還有沒糊到的範圍，可以再拖一次方框加強。';
};

// 馬賽克是選用的隱私保護步驟，不是必要條件——只要有拍照就能取得照片，
// 套不套馬賽克由操作人員自行判斷（例如傷患臉部已經包紮看不到，就不需要）。
APP.Camera.getPhotoBase64 = function () {
  if (!APP.Camera.hasPhoto) return null;
  return document.getElementById('photoCanvas').toDataURL('image/jpeg', 0.7);
};

document.addEventListener('DOMContentLoaded', function () {
  var addPhotoBtn = document.getElementById('addPhotoBtn');
  if (addPhotoBtn) addPhotoBtn.addEventListener('click', APP.Camera.showChoice);

  var chooseCameraBtn = document.getElementById('chooseCameraBtn');
  if (chooseCameraBtn) chooseCameraBtn.addEventListener('click', APP.Camera.enterCameraMode);

  var chooseAlbumBtn = document.getElementById('chooseAlbumBtn');
  var fileInput = document.getElementById('photoFileInput');
  if (chooseAlbumBtn && fileInput) {
    chooseAlbumBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      APP.Camera.loadFromFile(fileInput.files[0]);
      fileInput.value = ''; // 清空，才能連續選同一張檔案
    });
  }

  var captureBtn = document.getElementById('captureBtn');
  if (captureBtn) captureBtn.addEventListener('click', APP.Camera.capture);

  var cancelCameraBtn = document.getElementById('cancelCameraBtn');
  if (cancelCameraBtn) cancelCameraBtn.addEventListener('click', APP.Camera.cancelCameraMode);

  var mosaicBtn = document.getElementById('applyMosaicBtn');
  if (mosaicBtn) mosaicBtn.addEventListener('click', APP.Camera.applyMosaic);

  var retakeBtn = document.getElementById('retakeBtn');
  if (retakeBtn) retakeBtn.addEventListener('click', function () { APP.Camera.reset(); });

  APP.Camera.bindSelection();
  APP.Camera.render();
});
