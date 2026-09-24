APP.PatientForm = APP.PatientForm || {};
APP.PatientForm.mode = 'create'; // create | retriage | edit
APP.PatientForm.editingPatient = null;
APP.PatientForm.selectedColor = null;
APP.PatientForm.selectedGender = null;
APP.PatientForm.afterRetriageCallback = null; // 卸下病患/交接前的傷情再確認會用到
APP.PatientForm.afterEditCallback = null; // 從救護車詳情頁編輯完後，重新打開該詳情頁會用到

var GENDER_LABEL = { MALE: '男', FEMALE: '女', UNKNOWN: '不明' };

// START檢傷流程：key -> 中文標籤／這一步是否為終點（決定顏色）／終點對應顏色／非終點時要跳到第幾步
var START_LABEL = {
  walk_yes: '可行走', walk_no: '不可行走',
  resp_none: '無呼吸', resp_fast: '呼吸≥30/min', resp_normal: '呼吸<30/min',
  circ_bad: 'CRT≥2s或橈動脈(-)', circ_ok: 'CRT<2s且橈動脈(+)',
  mental_ok: '可聽從指令', mental_bad: '不可聽從指令',
};
var START_TERMINAL_COLOR = {
  walk_yes: 'GREEN', resp_none: 'BLACK', resp_fast: 'RED',
  circ_bad: 'RED', mental_ok: 'YELLOW', mental_bad: 'RED',
};
var START_NEXT_STEP = { walk_no: 2, resp_normal: 3, circ_ok: 4 };

APP.PatientForm.startPath = [];

APP.PatientForm.init = function () {
  document.getElementById('addPatientBtn').addEventListener('click', APP.PatientForm.openCreate);
  document.getElementById('patientFormCancelBtn').addEventListener('click', APP.PatientForm.close);
  document.getElementById('patientFormSubmitBtn').addEventListener('click', APP.PatientForm.submit);
  ['RED', 'YELLOW', 'GREEN', 'BLACK'].forEach(function (c) {
    var el = document.getElementById('colorBtn_' + c);
    if (el) el.addEventListener('click', function () { APP.PatientForm.selectColor(c); });
  });
  ['MALE', 'FEMALE', 'UNKNOWN'].forEach(function (g) {
    var el = document.getElementById('genderBtn_' + g);
    if (el) el.addEventListener('click', function () { APP.PatientForm.selectGender(g); });
  });
  document.querySelectorAll('.start-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { APP.PatientForm.handleStartAnswer(btn.dataset.start); });
  });
  document.getElementById('startResetBtn').addEventListener('click', APP.PatientForm.resetStartAssessment);
};

APP.PatientForm.openCreate = function () {
  APP.PatientForm.mode = 'create';
  APP.PatientForm.editingPatient = null;
  APP.PatientForm.selectedColor = null;
  APP.PatientForm.selectedGender = null;
  document.getElementById('patientFormTitle').textContent = '建立傷患（START檢傷）';
  document.getElementById('tagNumberInput').value = '';
  document.getElementById('patientNameInput').value = '';
  document.getElementById('patientAgeInput').value = '';
  document.getElementById('patientNoteInput').value = '';
  document.getElementById('colorPickerBlock').classList.remove('hidden');
  document.getElementById('extraFieldsBlock').classList.remove('hidden');
  document.getElementById('startAssessmentBlock').classList.remove('hidden');
  document.getElementById('cameraBlock').classList.remove('hidden');
  document.getElementById('patientFormSubmitBtn').textContent = '送出';
  APP.PatientForm.highlightColor(null);
  APP.PatientForm.highlightGender(null);
  APP.PatientForm.resetStartAssessment();
  document.getElementById('patientFormModal').classList.remove('hidden');
  APP.Camera.reset();
};

// afterSave（選填）：確認/送出後要接著做的事（例如卸下病患前、交接前的傷情再確認），
// 會收到後端回傳的最新傷患物件。customTitle（選填）：彈窗標題，預設是一般的重新檢傷分類。
// 預先選取傷患「目前」的顏色——多數情況是來確認「有沒有變化」，沒變化的話點一下同一個
// 顏色（已經反白）就能送出，不用強迫使用者每次都重新想一次答案。
APP.PatientForm.openRetriage = function (patient, afterSave, customTitle) {
  APP.PatientForm.mode = 'retriage';
  APP.PatientForm.editingPatient = patient;
  APP.PatientForm.afterRetriageCallback = afterSave || null;
  APP.PatientForm.selectedColor = patient.color;
  document.getElementById('patientFormTitle').textContent = customTitle || ('重新檢傷分類：' + patient.triageId);
  document.getElementById('colorPickerBlock').classList.remove('hidden');
  document.getElementById('extraFieldsBlock').classList.add('hidden');
  document.getElementById('cameraBlock').classList.add('hidden');
  document.getElementById('patientFormSubmitBtn').textContent = '送出';
  APP.PatientForm.highlightColor(patient.color);
  document.getElementById('patientFormModal').classList.remove('hidden');
};

// 更正基本資料（姓名/性別/年齡/貼紙編號/備註，選填重新拍照）——刻意不碰檢傷顏色，
// 顏色的修改一律走「重新檢傷分類」（會留下歷程），避免這裡跟那邊互相打架、記錄不一致。
var GENDER_KEY_BY_LABEL = { '男': 'MALE', '女': 'FEMALE', '不明': 'UNKNOWN' };

APP.PatientForm.openEdit = function (patient, afterSave) {
  APP.PatientForm.mode = 'edit';
  APP.PatientForm.editingPatient = patient;
  APP.PatientForm.afterEditCallback = afterSave || null;
  APP.PatientForm.selectedColor = patient.color; // 不會被送出，但保留原值避免其他共用邏輯誤判成「未選顏色」
  APP.PatientForm.selectedGender = GENDER_KEY_BY_LABEL[patient.gender] || null;

  document.getElementById('patientFormTitle').textContent = '編輯傷患資料：' + patient.triageId;
  document.getElementById('tagNumberInput').value = patient.tagNumber || '';
  document.getElementById('patientNameInput').value = patient.name || '';
  document.getElementById('patientAgeInput').value = patient.age || '';
  document.getElementById('patientNoteInput').value = patient.note || '';

  document.getElementById('colorPickerBlock').classList.add('hidden');
  document.getElementById('extraFieldsBlock').classList.remove('hidden');
  document.getElementById('startAssessmentBlock').classList.add('hidden');
  document.getElementById('cameraBlock').classList.remove('hidden');
  document.getElementById('patientFormSubmitBtn').textContent = '儲存修改';
  APP.PatientForm.highlightGender(APP.PatientForm.selectedGender);
  document.getElementById('patientFormModal').classList.remove('hidden');

  APP.Camera.reset();
  document.getElementById('cameraHint').textContent = '如不需更換照片，忽略這一區直接按「儲存修改」即可，會保留原照片。';
};

APP.PatientForm.selectColor = function (c) {
  APP.PatientForm.selectedColor = c;
  APP.PatientForm.highlightColor(c);
};

APP.PatientForm.highlightColor = function (c) {
  ['RED', 'YELLOW', 'GREEN', 'BLACK'].forEach(function (color) {
    var el = document.getElementById('colorBtn_' + color);
    if (el) el.classList.toggle('ring-4', color === c);
  });
};

APP.PatientForm.selectGender = function (g) {
  APP.PatientForm.selectedGender = g;
  APP.PatientForm.highlightGender(g);
};

APP.PatientForm.highlightGender = function (g) {
  ['MALE', 'FEMALE', 'UNKNOWN'].forEach(function (gender) {
    var el = document.getElementById('genderBtn_' + gender);
    if (el) el.classList.toggle('active', gender === g);
  });
};

// ─── START檢傷流程精靈：點選就自動往下一步或直接判定顏色 ──────────────────
APP.PatientForm.handleStartAnswer = function (key) {
  APP.PatientForm.startPath.push(key);
  if (START_TERMINAL_COLOR[key]) {
    APP.PatientForm.finishStartAssessment(START_TERMINAL_COLOR[key]);
  } else {
    APP.PatientForm.showStartStep(START_NEXT_STEP[key]);
  }
};

APP.PatientForm.showStartStep = function (n) {
  for (var i = 1; i <= 4; i++) {
    document.getElementById('startStep' + i).classList.toggle('hidden', i !== n);
  }
  document.getElementById('startResult').classList.add('hidden');
};

APP.PatientForm.finishStartAssessment = function (color) {
  for (var i = 1; i <= 4; i++) {
    document.getElementById('startStep' + i).classList.add('hidden');
  }
  var pathText = APP.PatientForm.startPath.map(function (k) { return START_LABEL[k]; }).join('→');
  document.getElementById('startResultText').textContent = pathText + '（建議：' + (COLOR_LABEL[color] || color) + '色）';
  document.getElementById('startResult').classList.remove('hidden');
  APP.PatientForm.selectColor(color); // 自動帶入建議顏色，仍可手動點別的顏色覆蓋
};

APP.PatientForm.resetStartAssessment = function () {
  APP.PatientForm.startPath = [];
  document.getElementById('startResult').classList.add('hidden');
  APP.PatientForm.showStartStep(1);
};

APP.PatientForm.getStartSummaryText = function () {
  if (APP.PatientForm.startPath.length === 0) return '';
  return 'START評估：' + APP.PatientForm.startPath.map(function (k) { return START_LABEL[k]; }).join('→');
};

APP.PatientForm.close = function () {
  document.getElementById('patientFormModal').classList.add('hidden');
  if (APP.PatientForm.mode === 'create' || APP.PatientForm.mode === 'edit') APP.Camera.stop();
  // 使用者自己按取消／叉掉視窗時，後續動作（卸下病患、交接、重新打開救護車詳情）要整個中止，
  // 不能留著上一次設定的callback，等下次無關的操作卻被誤觸發。
  APP.PatientForm.afterRetriageCallback = null;
  APP.PatientForm.afterEditCallback = null;
};

APP.PatientForm.submit = function () {
  if (!APP.PatientForm.selectedColor) { APP.UI.alert('請選擇檢傷分類顏色。'); return; }

  if (APP.PatientForm.mode === 'retriage') {
    APP.Api.post('retriagePatient', APP.DragDrop.withSession({
      patientId: APP.PatientForm.editingPatient.triageId,
      newColor: APP.PatientForm.selectedColor,
    })).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
      var callback = APP.PatientForm.afterRetriageCallback;
      APP.PatientForm.afterRetriageCallback = null;
      APP.PatientForm.close();
      APP.Board.refresh();
      if (callback) callback(res.data);
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
    return;
  }

  if (APP.PatientForm.mode === 'edit') {
    var editPayload = APP.DragDrop.withSession({
      patientId: APP.PatientForm.editingPatient.triageId,
      tagNumber: document.getElementById('tagNumberInput').value.trim(),
      name: document.getElementById('patientNameInput').value.trim(),
      gender: APP.PatientForm.selectedGender ? GENDER_LABEL[APP.PatientForm.selectedGender] : '',
      age: document.getElementById('patientAgeInput').value.trim(),
      note: document.getElementById('patientNoteInput').value.trim(),
    });
    var editPhoto = APP.Camera.getPhotoBase64();
    if (editPhoto) editPayload.photoBase64 = editPhoto;

    APP.Api.post('updatePatientInfo', editPayload).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '更新失敗'); return; }
      var callback = APP.PatientForm.afterEditCallback;
      APP.PatientForm.afterEditCallback = null;
      APP.PatientForm.close();
      APP.Board.refresh();
      if (callback) callback(res.data);
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
    return;
  }

  var startSummary = APP.PatientForm.getStartSummaryText();
  var freeNote = document.getElementById('patientNoteInput').value.trim();
  var combinedNote = startSummary && freeNote ? (startSummary + '；' + freeNote) : (startSummary || freeNote);

  var payload = APP.DragDrop.withSession({
    triageColor: APP.PatientForm.selectedColor,
    tagNumber: document.getElementById('tagNumberInput').value.trim(),
    name: document.getElementById('patientNameInput').value.trim(),
    gender: APP.PatientForm.selectedGender ? GENDER_LABEL[APP.PatientForm.selectedGender] : '',
    age: document.getElementById('patientAgeInput').value.trim(),
    note: combinedNote,
  });
  var photo = APP.Camera.getPhotoBase64();
  if (photo) payload.photoBase64 = photo;

  APP.Api.post('createPatient', payload).then(function (res) {
    if (res.status !== 'success') { APP.UI.alert(res.message || '建立失敗'); return; }
    APP.PatientForm.close();
    APP.Board.refresh();
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};
