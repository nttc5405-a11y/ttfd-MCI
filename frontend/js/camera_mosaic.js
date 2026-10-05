// 拍照 + 手動拖框馬賽克（刻意不用自動人臉辨識：現場光線/角度不穩定會不可靠，
// 且對非工程師使用者而言，辨識失敗時很難排除問題；手動拖框簡單、所見即所得）
//
// 一位傷患最多 3 張照片（例如傷患本人1張＋傷患紀錄表1~2張），跟後端
// CONFIG.MAX_PATIENT_PHOTOS 對齊。APP.Camera.photos 是目前這次表單session
// 的完整照片清單，每一項 { isExisting, existingFileId?, label?, dataUrl? }：
//   isExisting=true  → 編輯模式載入的既有照片（只存 fileId，不另外下載縮圖預覽，
//                       避免開表單就多打好幾支 API；要看內容請先用卡片上的🔍查看）
//   isExisting=false → 這次表單session裡新拍/新選的照片，dataUrl 是壓縮後的base64
//
// 五個狀態，對應五個子區塊的顯示/隱藏（見 index.html 的 #cameraBlock）：
//   idle     — 顯示縮圖列＋「新增照片」按鈕（已達上限時按鈕隱藏）
//   choosing — 顯示「拍照」／「從相簿選取」兩個按鈕
//   camera   — 顯示即時相機畫面＋「拍下」／「取消」
//   captured — 顯示剛拍/選的這一張＋馬賽克／重拍／「加入這張照片」
APP.Camera = APP.Camera || {};
APP.Camera.stream = null;
APP.Camera.hasPhoto = false;
APP.Camera.mosaicApplied = false;
APP.Camera.selection = null;
APP.Camera.originalImageData = null;
APP.Camera.state = 'idle';
APP.Camera.idleHintOverride = '';
APP.Camera.photos = [];
APP.Camera.maxPhotos = 3;

APP.Camera.renderThumbStrip = function () {
  var strip = document.getElementById('photoThumbStrip');
  if (!strip) return;
  if (APP.Camera.photos.length === 0) {
    strip.innerHTML = '';
    return;
  }
  strip.innerHTML = APP.Camera.photos.map(function (ph, idx) {
    var inner = ph.isExisting
      ? '<div style="width:70px;height:70px;border-radius:8px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center;padding:4px;color:#475569;">' +
        (ph.label || '既有照片') + '</div>'
      : '<img src="' + ph.dataUrl + '" style="width:70px;height:70px;border-radius:8px;object-fit:cover;display:block;">';
    return '<div style="position:relative;display:inline-block;">' + inner +
      '<button type="button" class="photo-remove-btn" data-photo-idx="' + idx + '" title="移除這張照片" ' +
      'style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:none;font-size:12px;line-height:1;cursor:pointer;">✕</button>' +
      '</div>';
  }).join('');
};

APP.Camera.removePhoto = function (idx) {
  APP.Camera.photos.splice(idx, 1);
  APP.Camera.render();
};

APP.Camera.render = function () {
  var s = APP.Camera.state;
  var atMax = APP.Camera.photos.length >= APP.Camera.maxPhotos;
  document.getElementById('photoIdleBlock').classList.toggle('hidden', s !== 'idle' || atMax);
  document.getElementById('photoChooseBlock').classList.toggle('hidden', s !== 'choosing');
  document.getElementById('photoCameraLiveBlock').classList.toggle('hidden', s !== 'camera');
  document.getElementById('photoCanvas').classList.toggle('hidden', s !== 'captured');
  document.getElementById('photoResultActions').classList.toggle('hidden', s !== 'captured');
  document.getElementById('confirmAddPhotoBtn').classList.toggle('hidden', s !== 'captured');

  APP.Camera.renderThumbStrip();

  var hint = document.getElementById('cameraHint');
  if (s === 'idle') {
    hint.textContent = atMax
      ? ('已達上限 ' + APP.Camera.maxPhotos + ' 張，如需更換請先移除一張再新增。')
      : (APP.Camera.idleHintOverride || ('可新增拍照或從相簿選取的照片（選用，最多' + APP.Camera.maxPhotos + '張，例如傷患本人、傷患紀錄表）。'));
  } else if (s === 'choosing') {
    hint.textContent = '請選擇要用相機拍照，還是從相簿選取既有照片。';
  } else if (s === 'camera') {
    hint.textContent = '相機啟動中，請對準要拍攝的內容後按「拍下」。';
  } else if (s === 'captured') {
    hint.textContent = '如需保護隱私，可用手指在臉部拖曳方框後按「套用馬賽克」；確認沒問題後按「✅ 加入這張照片」。';
  }
};

// 開啟表單時呼叫一次（建立傷患傳空陣列；編輯傷患傳既有照片清單）。
// idleHint（選填）：編輯模式要額外提醒的文字，跟「尚未加任何照片時」的預設文字不同。
APP.Camera.reset = function (initialPhotos, idleHint) {
  APP.Camera.stop();
  APP.Camera.photos = (initialPhotos || []).slice(0, APP.Camera.maxPhotos);
  APP.Camera.idleHintOverride = idleHint || '';
  APP.Camera.discardStaging();
};

// 放棄「這一次」正在拍/選的單張照片，回到縮圖列畫面——不會動到已經加入清單的照片。
// 「取消」（相機畫面）、「重拍／重選」都是呼叫這支，不是整個表單的 reset。
APP.Camera.discardStaging = function () {
  APP.Camera.stop();
  APP.Camera.hasPhoto = false;
  APP.Camera.mosaicApplied = false;
  APP.Camera.selection = null;
  APP.Camera.originalImageData = null;
  var canvas = document.getElementById('photoCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
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
// 之後的馬賽克、加入清單流程跟拍照完全一樣。
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

// 把目前暫存的這一張（拍照/相簿選取，可能已套馬賽克）正式加入照片清單，
// 回到縮圖列畫面；清單滿了就擋下，請先移除一張。
APP.Camera.confirmAddPhoto = function () {
  if (!APP.Camera.hasPhoto) return;
  if (APP.Camera.photos.length >= APP.Camera.maxPhotos) {
    APP.UI.alert('已達上限 ' + APP.Camera.maxPhotos + ' 張，請先移除一張再加入新照片。');
    return;
  }
  var dataUrl = document.getElementById('photoCanvas').toDataURL('image/jpeg', 0.7);
  APP.Camera.photos.push({ isExisting: false, dataUrl: dataUrl });
  APP.Camera.discardStaging();
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
  document.getElementById('cameraHint').textContent = '已套用馬賽克。若還有沒糊到的範圍，可以再拖一次方框加強；確認沒問題後按「✅ 加入這張照片」。';
};

// 這次表單session裡「新拍/新選」的照片（base64），依加入順序排列——提交表單時用。
APP.Camera.getNewPhotosBase64 = function () {
  return APP.Camera.photos.filter(function (p) { return !p.isExisting; }).map(function (p) { return p.dataUrl; });
};

// 編輯模式下，使用者選擇保留的既有照片 fileId——提交表單時用，後端只接受
// 真的屬於這位傷患的 fileId，不是的話會被忽略。
APP.Camera.getKeepPhotoFileIds = function () {
  return APP.Camera.photos.filter(function (p) { return p.isExisting; }).map(function (p) { return p.existingFileId; });
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
  if (cancelCameraBtn) cancelCameraBtn.addEventListener('click', APP.Camera.discardStaging);

  var mosaicBtn = document.getElementById('applyMosaicBtn');
  if (mosaicBtn) mosaicBtn.addEventListener('click', APP.Camera.applyMosaic);

  var retakeBtn = document.getElementById('retakeBtn');
  if (retakeBtn) retakeBtn.addEventListener('click', APP.Camera.discardStaging);

  var confirmAddPhotoBtn = document.getElementById('confirmAddPhotoBtn');
  if (confirmAddPhotoBtn) confirmAddPhotoBtn.addEventListener('click', APP.Camera.confirmAddPhoto);

  var thumbStrip = document.getElementById('photoThumbStrip');
  if (thumbStrip) {
    thumbStrip.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.photo-remove-btn');
      if (!btn) return;
      APP.Camera.removePhoto(Number(btn.dataset.photoIdx));
    });
  }

  APP.Camera.bindSelection();
  APP.Camera.render();
});
