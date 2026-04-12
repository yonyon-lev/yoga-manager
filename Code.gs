// ================================================
// Google Apps Script — ניהול שיעורי יוגה
// מחובר לגיליון: yoga-manager
// https://docs.google.com/spreadsheets/d/1al8L0RoFs3A5JYS4QzQqOgSSMwbtC01V5R8QJW1WtAs
// ================================================
// הוראות פריסה:
// 1. פתח https://script.google.com → פרויקט חדש
// 2. מחק קוד קיים, הדבק את כל הקוד הזה, שמור (Ctrl+S)
// 3. פרוס → פריסה חדשה → אפליקציית אינטרנט
//    הפעל בשם: אני | מי יכול לגשת: כולם (Anyone)
// 4. אשר הרשאות → העתק את הכתובת → הדבק ב-⚙️ באפליקציה
//
// חשוב: לאחר כל עריכה בקוד, חייבים לפרוס גרסה חדשה!
// ================================================

const SPREADSHEET_ID = '1al8L0RoFs3A5JYS4QzQqOgSSMwbtC01V5R8QJW1WtAs';
const SHEET_NAME = 'YogaData';
const EMPTY_STATE = '{"students":[],"payments":[],"actionArtPayments":[],"_version":0}';

// ---------- helpers ----------

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange('A1').setValue(EMPTY_STATE);
  }
  return sheet;
}

function readState(sheet) {
  const raw = sheet.getRange('A1').getValue();
  try {
    const s = JSON.parse(raw || EMPTY_STATE);
    if (!Array.isArray(s.students))        s.students = [];
    if (!Array.isArray(s.payments))        s.payments = [];
    if (!Array.isArray(s.actionArtPayments)) s.actionArtPayments = [];
    return s;
  } catch (_) {
    return JSON.parse(EMPTY_STATE);
  }
}

function writeState(sheet, state) {
  state._version  = (state._version || 0) + 1;
  state._lastSaved = new Date().toISOString();
  sheet.getRange('A1').setValue(JSON.stringify(state));
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- main entry point ----------
// ALL reads AND writes go through doGet using URL parameters.
// This is the only CORS-safe approach for a static HTML page calling Apps Script.
//
// Parameters:
//   op  — operation name (default: "read")
//   d   — JSON-encoded payload (URL-encoded)

function doGet(e) {
  const op = (e.parameter && e.parameter.op) || 'read';
  let d = null;
  if (e.parameter && e.parameter.d) {
    try { d = JSON.parse(decodeURIComponent(e.parameter.d)); } catch (_) {}
  }

  try {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return jsonOut({ error: 'Could not acquire lock — try again' });

    const sheet = getSheet();

    // ---- read (no write needed) ----
    if (op === 'read') {
      const state = readState(sheet);
      lock.releaseLock();
      return ContentService
        .createTextOutput(JSON.stringify(state))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ---- write operations ----
    const state = readState(sheet);

    switch (op) {

      case 'saveStudent': {
        // Upsert a complete student object (includes cards + attendance)
        if (!d || !d.id) break;
        const idx = state.students.findIndex(s => s.id === d.id);
        if (idx >= 0) state.students[idx] = d;
        else state.students.push(d);
        break;
      }

      case 'deleteStudent': {
        if (!d || !d.id) break;
        state.students      = state.students.filter(s => s.id !== d.id);
        state.payments      = state.payments.filter(p => p.studentId !== d.id);
        break;
      }

      case 'addPayment': {
        if (!d || !d.id) break;
        // Idempotent: don't duplicate
        if (!state.payments.some(p => p.id === d.id)) state.payments.push(d);
        break;
      }

      case 'addArtPayment': {
        if (!d || !d.id) break;
        if (!state.actionArtPayments.some(p => p.id === d.id)) state.actionArtPayments.push(d);
        break;
      }

      case 'deleteArtPayment': {
        if (!d || !d.id) break;
        state.actionArtPayments = state.actionArtPayments.filter(p => p.id !== d.id);
        break;
      }

      default:
        lock.releaseLock();
        return jsonOut({ error: 'Unknown op: ' + op });
    }

    writeState(sheet, state);
    lock.releaseLock();
    return jsonOut({ ok: true, _version: state._version, _lastSaved: state._lastSaved });

  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// doPost kept as a no-op redirect to doGet (not used by the client)
function doPost(e) {
  return doGet(e);
}
