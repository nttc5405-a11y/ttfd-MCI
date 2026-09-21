APP.PatientForm = APP.PatientForm || {};
APP.PatientForm.mode = 'create'; // create | retriage
APP.PatientForm.editingPatient = null;
APP.PatientForm.selectedColor = null;
APP.PatientForm.selectedGender = null;

var GENDER_LABEL = { MALE: '男', FEMALE: '女', UNKNOWN: '不明' };

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
  document.getElementById('extraFieldsBlock').classList.remove('hidden');
  document.getElementById('cameraBlock').classList.remove('hidden');
  APP.PatientForm.highlightColor(null);
  APP.PatientForm.highlightGender(null);
  document.getElementById('patientFormModal').classList.remove('hidden');
  APP.Camera.reset();
};

APP.PatientForm.openRetriage = function (patient) {
  APP.PatientForm.mode = 'retriage';
  APP.PatientForm.editingPatient = patient;
  APP.PatientForm.selectedColor = null;
  document.getElementById('patientFormTitle').textContent = '重新檢傷分類：' + patient.triageId;
  document.getElementById('extraFieldsBlock').classList.add('hidden');
  document.getElementById('cameraBlock').classList.add('hidden');
  APP.PatientForm.highlightColor(null);
  document.getElementById('patientFormModal').classList.remove('hidden');
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

APP.PatientForm.close = function () {
  document.getElementById('patientFormModal').classList.add('hidden');
  if (APP.PatientForm.mode === 'create') APP.Camera.stop();
};

APP.PatientForm.submit = function () {
  if (!APP.PatientForm.selectedColor) { APP.UI.alert('請選擇檢傷分類顏色。'); return; }

  if (APP.PatientForm.mode === 'retriage') {
    APP.Api.post('retriagePatient', APP.DragDrop.withSession({
      patientId: APP.PatientForm.editingPatient.triageId,
      newColor: APP.PatientForm.selectedColor,
    })).then(function (res) {
      if (res.status !== 'success') { APP.UI.alert(res.message || '操作失敗'); return; }
      APP.PatientForm.close();
      APP.Board.refresh();
    }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
    return;
  }

  if (APP.Camera.hasPhoto && !APP.Camera.mosaicApplied) {
    APP.UI.alert('已拍照但尚未套用馬賽克，請先拖框蓋住臉部並按「套用馬賽克」，或按「重拍」放棄這張照片。');
    return;
  }

  var payload = APP.DragDrop.withSession({
    triageColor: APP.PatientForm.selectedColor,
    tagNumber: document.getElementById('tagNumberInput').value.trim(),
    name: document.getElementById('patientNameInput').value.trim(),
    gender: APP.PatientForm.selectedGender ? GENDER_LABEL[APP.PatientForm.selectedGender] : '',
    age: document.getElementById('patientAgeInput').value.trim(),
    note: document.getElementById('patientNoteInput').value.trim(),
  });
  var photo = APP.Camera.getMosaicedPhotoBase64();
  if (photo) payload.photoBase64 = photo;

  APP.Api.post('createPatient', payload).then(function (res) {
    if (res.status !== 'success') { APP.UI.alert(res.message || '建立失敗'); return; }
    APP.PatientForm.close();
    APP.Board.refresh();
  }).catch(function () { APP.UI.alert('網路錯誤，請重試。'); });
};
