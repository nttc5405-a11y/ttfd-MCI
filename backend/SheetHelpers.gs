// ═══════════════════════════════════════════════════════════════
//  共用工具：分頁內「多區塊」讀寫、資料列<->物件轉換、雜項工具
// ═══════════════════════════════════════════════════════════════

// 案件專屬分頁內的四個資料區塊（欄位用數字，1=A欄）
// 區塊之間刻意留一欄空白緩衝，避免相鄰區塊資料被誤判連在一起
const BLOCK = {
  PATIENT:   { anchorCol: 1,  width: 14 }, // A~N   傷患
  AMBULANCE: { anchorCol: 16, width: 8  }, // P~W   救護車
  HOSPITAL:  { anchorCol: 25, width: 5  }, // Y~AC  醫院
  AUDIT:     { anchorCol: 31, width: 6  }, // AE~AJ 稽核紀錄（純append）
};

const PATIENT_HEADERS = [
  '檢傷編號', '現場貼紙編號', '分類顏色', '分類歷程JSON', '姓名', '性別', '年齡',
  '建立時間', '檢傷人員', '照片檔案ID', '現況狀態', '目前救護車代碼', '送達醫院ID', '備註',
];

const AMBULANCE_HEADERS = [
  '車輛代碼', '顯示名稱', '狀態', '車上傷患清單JSON', '目前醫院ID', '抵達時間', '本案隨車人員', '最後更新時間',
];

const HOSPITAL_HEADERS = [
  '醫院ID', '醫院名稱', '收治狀態', '已送達人數', '最後更新時間',
];

const AUDIT_HEADERS = [
  '時間戳記', '操作人員', '動作類型', '目標編號', '詳情', '原始payload',
];

// ────────────────────────────────────────────────────────────────
// 區塊讀寫共用函式
// ────────────────────────────────────────────────────────────────

// 找出指定區塊「錨點欄」從 startRow 起第一個空白列（自動往下延伸搜尋）
function findNextEmptyRow(sheet, anchorCol, startRow) {
  startRow = startRow || 2;
  const chunk = 500;
  let row = startRow;
  while (true) {
    const maxRow = sheet.getMaxRows();
    if (row > maxRow) return row;
    const readHeight = Math.min(chunk, maxRow - row + 1);
    const values = sheet.getRange(row, anchorCol, readHeight, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === '' || values[i][0] === null) {
        return row + i;
      }
    }
    row += readHeight;
    if (readHeight < chunk) return row;
  }
}

// 新分頁預設只有26欄（到Z），稽核紀錄區用到第36欄（AJ），
// 寫入前先主動擴充，避免依賴「寫超出範圍會自動擴欄」這種不同版本行為可能不一致的假設
function ensureSheetHasColumns(sheet, minCols) {
  const current = sheet.getMaxColumns();
  if (current < minCols) {
    sheet.insertColumnsAfter(current, minCols - current);
  }
}

function writeBlockHeader(sheet, block, headers) {
  const range = sheet.getRange(1, block.anchorCol, 1, block.width);
  range.setValues([headers]);
  range.setFontWeight('bold').setBackground('#d9ead3');
}

// 讀取整個區塊目前已有資料的列（不含表頭，從第2列起）
function readBlockRows(sheet, block) {
  const lastEmptyRow = findNextEmptyRow(sheet, block.anchorCol, 2);
  const lastDataRow = lastEmptyRow - 1;
  if (lastDataRow < 2) return [];
  return sheet.getRange(2, block.anchorCol, lastDataRow - 1, block.width).getValues();
}

// 在區塊尾端新增一列，回傳實際寫入的列號
function appendBlockRow(sheet, block, rowValues) {
  const row = findNextEmptyRow(sheet, block.anchorCol, 2);
  sheet.getRange(row, block.anchorCol, 1, block.width).setValues([rowValues]);
  return row;
}

// 依「區塊內第一欄（keyColOffset=0）」的值找列，回傳 {rowIndex, rowValues} 或 null
// rowIndex 是試算表實際列號（可直接用在 updateBlockRow）
function findBlockRowByKey(sheet, block, keyColOffset, keyValue) {
  const rows = readBlockRows(sheet, block);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][keyColOffset]) === String(keyValue)) {
      return { rowIndex: i + 2, rowValues: rows[i] };
    }
  }
  return null;
}

function updateBlockRow(sheet, block, rowIndex, rowValues) {
  sheet.getRange(rowIndex, block.anchorCol, 1, block.width).setValues([rowValues]);
}

function appendAuditLog(sheet, operatorName, actionType, targetId, detail, payload) {
  const row = findNextEmptyRow(sheet, BLOCK.AUDIT.anchorCol, 2);
  sheet.getRange(row, BLOCK.AUDIT.anchorCol, 1, BLOCK.AUDIT.width).setValues([[
    new Date(), operatorName || '', actionType || '', targetId || '', detail || '', JSON.stringify(payload || {}),
  ]]);
}

// ────────────────────────────────────────────────────────────────
// 資料列 <-> 物件 轉換（順序必須與對應 HEADERS 一致）
// ────────────────────────────────────────────────────────────────

function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function patientRowToObject(row) {
  return {
    triageId: row[0],
    tagNumber: row[1],
    color: row[2],
    colorHistory: safeParseJSON(row[3], []),
    name: row[4],
    gender: row[5],
    age: row[6],
    createdAt: row[7],
    triageOfficer: row[8],
    photoFileId: row[9],
    status: row[10],
    ambulanceCode: row[11],
    hospitalId: row[12],
    note: row[13],
  };
}

function patientObjectToRow(p) {
  return [
    p.triageId, p.tagNumber || '', p.color, JSON.stringify(p.colorHistory || []),
    p.name || '', p.gender || '', p.age || '', p.createdAt, p.triageOfficer || '',
    p.photoFileId || '', p.status, p.ambulanceCode || '', p.hospitalId || '', p.note || '',
  ];
}

function ambulanceRowToObject(row) {
  return {
    vehicleCode: row[0],
    displayName: row[1],
    status: row[2],
    patientIds: safeParseJSON(row[3], []),
    hospitalId: row[4],
    arrivedAt: row[5],
    crew: row[6],
    updatedAt: row[7],
  };
}

function ambulanceObjectToRow(a) {
  return [
    a.vehicleCode, a.displayName || '', a.status, JSON.stringify(a.patientIds || []),
    a.hospitalId || '', a.arrivedAt || '', a.crew || '', a.updatedAt,
  ];
}

function hospitalRowToObject(row) {
  return {
    hospitalId: row[0],
    name: row[1],
    status: row[2],
    deliveredCount: row[3],
    updatedAt: row[4],
  };
}

function hospitalObjectToRow(h) {
  return [h.hospitalId, h.name || '', h.status, h.deliveredCount || 0, h.updatedAt];
}

// ────────────────────────────────────────────────────────────────
// 雜項工具
// ────────────────────────────────────────────────────────────────

function sanitizeSheetName(name) {
  if (!name || typeof name !== 'string') return null;
  const cleaned = name.replace(/[\\\/\?\*\[\]\:]/g, '_').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, CONFIG.INCIDENT_ID_MAX_LEN);
}

// 取得案件專屬分頁，找不到就回傳 {error:{...}} 方便呼叫端直接 return
function getIncidentSheetOrError(incidentId) {
  if (!incidentId) {
    return { error: { status: 'error', code: 'INVALID_INCIDENT_ID', message: '案件編號無效。' } };
  }
  const doc = getDoc();
  const sheet = doc.getSheetByName(incidentId);
  if (!sheet) {
    return { error: { status: 'error', code: 'INCIDENT_NOT_FOUND', message: '找不到此案件分頁。' } };
  }
  return { sheet: sheet };
}
