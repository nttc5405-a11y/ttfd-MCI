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

  var docPdf = new jspdf.jsPDF();
  docPdf.setFontSize(16);
  docPdf.text('大量傷病患後送交接單', 20, 20);
  docPdf.setFontSize(11);
  docPdf.text('案件：' + session.incidentId, 20, 30);
  docPdf.text('救護車：' + ambulance.displayName, 20, 37);
  docPdf.text('送達醫院：' + (ambulance.hospitalId || ''), 20, 44);
  docPdf.text('時間：' + new Date().toLocaleString('zh-TW'), 20, 51);
  docPdf.text('操作人員：' + session.operatorName, 20, 58);

  var y = 68;
  docPdf.text('傷患清單：', 20, y);
  y += 7;
  if (patients.length === 0) {
    docPdf.text('（無）', 24, y);
    y += 7;
  } else {
    patients.forEach(function (p) {
      var line = '・' + p.triageId + '（' + (COLOR_LABEL[p.color] || p.color) + '色）' +
        (p.name || '未提供姓名') + (p.tagNumber ? '　貼紙編號：' + p.tagNumber : '');
      docPdf.text(line, 24, y);
      y += 7;
    });
  }

  y += 5;
  docPdf.text('護理人員：' + (nurseName || '（未填寫，以簽名為準）'), 20, y);
  y += 7;
  docPdf.text('簽名：', 20, y);
  try {
    docPdf.addImage(signatureDataUrl, 'PNG', 45, y - 6, 60, 25);
  } catch (e) {
    // 簽名區塊為空白時 addImage 可能丟出例外，此情況直接略過圖片即可
  }

  var pdfBase64 = docPdf.output('datauristring');

  APP.Api.post('saveHandover', APP.DragDrop.withSession({
    ambulanceId: ambulance.vehicleCode,
    hospitalId: ambulance.hospitalId,
    patientIds: patients.map(function (p) { return p.triageId; }),
    nurseName: nurseName,
    pdfBase64: pdfBase64,
  })).then(function (res) {
    if (res.status !== 'success') { APP.UI.alert(res.message || '交接單存檔失敗'); return; }
    APP.UI.alert('交接單已存檔完成。');
    APP.Handover.close();
    APP.Board.refresh();
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};
