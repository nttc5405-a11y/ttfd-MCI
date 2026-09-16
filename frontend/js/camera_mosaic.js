// 拍照 + 手動拖框馬賽克（刻意不用自動人臉辨識：現場光線/角度不穩定會不可靠，
// 且對非工程師使用者而言，辨識失敗時很難排除問題；手動拖框簡單、所見即所得）
APP.Camera = APP.Camera || {};
APP.Camera.stream = null;
APP.Camera.hasPhoto = false;
APP.Camera.mosaicApplied = false;
APP.Camera.selection = null;
APP.Camera.originalImageData = null;

APP.Camera.reset = function () {
  APP.Camera.hasPhoto = false;
  APP.Camera.mosaicApplied = false;
  APP.Camera.selection = null;
  APP.Camera.originalImageData = null;
  var canvas = document.getElementById('photoCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  canvas.classList.add('hidden');
  document.getElementById('cameraVideo').classList.remove('hidden');
  document.getElementById('cameraHint').textContent = '相機啟動中，請對準傷患臉部後按「拍照」。';
  APP.Camera.start();
};

APP.Camera.start = function () {
  var video = document.getElementById('cameraVideo');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('cameraHint').textContent = '此瀏覽器不支援相機功能，可跳過拍照直接建立傷患。';
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
    APP.Camera.stream = stream;
    video.srcObject = stream;
  }).catch(function (err) {
    document.getElementById('cameraHint').textContent = '無法開啟相機：' + (err.message || err.name) + '（可跳過拍照直接建立傷患）';
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

  video.classList.add('hidden');
  canvas.classList.remove('hidden');
  APP.Camera.stop();
  APP.Camera.hasPhoto = true;
  APP.Camera.mosaicApplied = false;
  APP.Camera.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  document.getElementById('cameraHint').textContent = '請用手指在臉部拖曳一個方框，再按「套用馬賽克」。';
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

APP.Camera.getMosaicedPhotoBase64 = function () {
  if (!APP.Camera.hasPhoto || !APP.Camera.mosaicApplied) return null;
  return document.getElementById('photoCanvas').toDataURL('image/jpeg', 0.7);
};

document.addEventListener('DOMContentLoaded', function () {
  var captureBtn = document.getElementById('captureBtn');
  if (captureBtn) captureBtn.addEventListener('click', APP.Camera.capture);
  var mosaicBtn = document.getElementById('applyMosaicBtn');
  if (mosaicBtn) mosaicBtn.addEventListener('click', APP.Camera.applyMosaic);
  var retakeBtn = document.getElementById('retakeBtn');
  if (retakeBtn) retakeBtn.addEventListener('click', APP.Camera.reset);
  APP.Camera.bindSelection();
});
