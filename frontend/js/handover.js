APP.Handover = APP.Handover || {};
APP.Handover.currentAmbulance = null;
APP.Handover.currentPatients = [];

APP.Handover.init = function () {
  var canvas = document.getElementById('signatureCanvas');
  APP.Handover.resizeCanvas();
  window.addEventListener('resize', APP.Handover.resizeCanvas);

  var drawing = false;
  function pos(ev) {
    var rect = canvas.getBoundingClientRect();
    var clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    var clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  function start(ev) { ev.preventDefault(); drawing = true; var p = pos(ev); var ctx = canvas.getContext('2d'); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(ev) { if (!drawing) return; ev.preventDefault(); var p = pos(ev); var ctx = canvas.getContext('2d'); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseout', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  document.getElementById('clearSignatureBtn').addEventListener('click', APP.Handover.clearSignature);
  document.getElementById('handoverCancelBtn').addEventListener('click', APP.Handover.close);
  document.getElementById('handoverSubmitBtn').addEventListener('click', APP.Handover.submit);
};

APP.Handover.resizeCanvas = function () {
  var canvas = document.getElementById('signatureCanvas');
  if (!canvas || canvas.offsetWidth === 0) return;
  var ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  var ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = '#1E3A8A';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
};

APP.Handover.clearSignature = function () {
  var canvas = document.getElementById('signatureCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

APP.Handover.open = function (ambulance, patients) {
  APP.Handover.currentAmbulance = ambulance;
  APP.Handover.currentPatients = patients;
  document.getElementById('handoverTitle').textContent = ambulance.displayName + ' 交接單';
  document.getElementById('handoverNurseName').value = '';

  var summary = document.getElementById('handoverPatientSummary');
  summary.innerHTML = patients.map(function (p) {
    return '<div>' + p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色）' + (p.name || '未提供姓名') + '</div>';
  }).join('') || '<div class="empty-hint">本車無傷患資料</div>';

  document.getElementById('handoverModal').classList.remove('hidden');
  setTimeout(function () {
    APP.Handover.resizeCanvas();
    APP.Handover.clearSignature();
  }, 100);
};

APP.Handover.close = function () {
  document.getElementById('handoverModal').classList.add('hidden');
};

APP.Handover.submit = function () {
  var canvas = document.getElementById('signatureCanvas');
  var signatureDataUrl = canvas.toDataURL('image/png');
  var nurseName = document.getElementById('handoverNurseName').value.trim();
  var ambulance = APP.Handover.currentAmbulance;
  var patients = APP.Handover.currentPatients;
  var session = APP.Auth.getSession();

  var submitBtn = document.getElementById('handoverSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '產生中...';

  // 先把交接單內容填進畫面外的排版樣板（見 index.html #handoverPdfTemplate），
  // 再用 html2canvas 把它拍成一張圖片放進PDF——中文用瀏覽器自己的字型渲染，
  // 不會有 jsPDF 內建字型不支援中文、直接doc.text()中文變亂碼的問題。
  document.getElementById('pdfIncidentId').textContent = session.incidentId;
  document.getElementById('pdfAmbulance').textContent = ambulance.displayName;
  document.getElementById('pdfHospital').textContent = ambulance.hospitalId || '（無）';
  document.getElementById('pdfTime').textContent = new Date().toLocaleString('zh-TW');
  document.getElementById('pdfOperator').textContent = session.operatorName;
  document.getElementById('pdfNurseName').textContent = nurseName || '（未填寫，以簽名為準）';

  var listEl = document.getElementById('pdfPatientList');
  if (patients.length === 0) {
    listEl.innerHTML = '（無）';
  } else {
    listEl.innerHTML = patients.map(function (p) {
      return '・' + p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色）' +
        (p.name || '未提供姓名') + (p.tagNumber ? '　貼紙編號：' + p.tagNumber : '');
    }).join('<br>');
  }

  var sigImg = document.getElementById('pdfSignatureImg');

  new Promise(function (resolve) {
    sigImg.onload = resolve;
    sigImg.src = signatureDataUrl;
  }).then(function () {
    return html2canvas(document.getElementById('handoverPdfTemplate'), { scale: 2, backgroundColor: '#ffffff' });
  }).then(function (renderedCanvas) {
    var imgData = renderedCanvas.toDataURL('image/png');
    var pdf = new jspdf.jsPDF();
    var pageWidth = pdf.internal.pageSize.getWidth();
    var imgWidth = pageWidth - 20;
    var imgHeight = renderedCanvas.height * imgWidth / renderedCanvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    var pdfBase64 = pdf.output('datauristring');

    return APP.Api.post('saveHandover', APP.DragDrop.withSession({
      ambulanceId: ambulance.vehicleCode,
      hospitalId: ambulance.hospitalId,
      patientIds: patients.map(function (p) { return p.triageId; }),
      nurseName: nurseName,
      pdfBase64: pdfBase64,
    }));
  }).then(function (res) {
    if (res.status !== 'success') { APP.UI.alert(res.message || '交接單存檔失敗'); return; }
    APP.UI.alert('交接單已存檔完成。');
    APP.Handover.close();
    APP.Board.refresh();
  }).catch(function (err) {
    APP.UI.alert('產生交接單失敗：' + (err && err.message ? err.message : '未知錯誤'));
  }).finally(function () {
    submitBtn.disabled = false;
    submitBtn.textContent = '產生並存檔';
  });
};
