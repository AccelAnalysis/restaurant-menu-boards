// ==================== Code.gs ====================
// Restaurant Menu Board – Google Apps Script backend (Sheets storage)
// Drop this entire file into a new Apps Script project bound to your menu Google Sheet

const AUTH_TOKEN = 'replace-me-with-a-strong-secret'; // ← Change this! (or leave empty to disable auth)
const SHEET_NAME = 'MenuState';                       // Hidden sheet that holds the data
const DATA_CELL = 'A1';                               // Entire JSON is stored in this single cell

/**
 * Main GET endpoint – returns current menu state
 */
function doGet(e) {
  try {
    if (!isAuthorized(e.parameter)) {
      return ContentService.createTextOutput('Unauthorized')
        .setMimeType(ContentService.MimeType.TEXT)
        .setResponseCode(403);
    }
    const state = readState();
    return ContentService.createTextOutput(JSON.stringify({ menu: state }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT)
      .setResponseCode(500);
  }
}

/**
 * Main POST endpoint – receives new menu state from admin
 */
function doPost(e) {
  try {
    const payload = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    if (!isAuthorized(payload)) {
      return ContentService.createTextOutput('Unauthorized')
        .setMimeType(ContentService.MimeType.TEXT)
        .setResponseCode(403);
    }

    if (payload.action === 'setMenu' && payload.menu !== undefined) {
      writeState(payload.menu);
      const saved = readState(); // return fresh copy
      return ContentService.createTextOutput(JSON.stringify({ menu: saved }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // If no valid action, just return current state
    const current = readState();
    return ContentService.createTextOutput(JSON.stringify({ menu: current }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT)
      .setResponseCode(500);
  }
}

/**
 * Authorization check – supports both GET (?token=) and POST (body.token)
 */
function isAuthorized(source) {
  if (!AUTH_TOKEN) return true; // auth disabled
  const provided = source && source.token;
  return provided === AUTH_TOKEN;
}

/**
 * Ensure the storage sheet and headers exist
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.hideSheet();
  }

  // Create headers if row 1 is empty
  const headerRange = sheet.getRange('A1:C1');
  const currentHeaders = headerRange.getValues()[0];

  if (!currentHeaders[0]) {
    sheet.getRange('A1').setValue('Description');
    sheet.getRange('B1').setValue('Last Updated');
    sheet.getRange('C1').setValue('Menu JSON (do not edit)');
    sheet.setFrozenRows(1);
    sheet.getRange('A1:C1').setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  }

  // Always make sure data cell exists
  if (sheet.getRange(DATA_CELL).getValue() === '') {
    sheet.getRange(DATA_CELL).setValue('{}');
  }

  SpreadsheetApp.flush();
}

/**
 * Write the full menu JSON to the sheet
 */
function writeState(state) {
  setupSheet();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const jsonString = JSON.stringify(state || {}, null, 2);
  sheet.getRange(DATA_CELL).setValue(jsonString);
  sheet.getRange('B1').setValue(new Date());
}

/**
 * Read the full menu JSON from the sheet
 */
function readState() {
  setupSheet();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const raw = sheet.getRange(DATA_CELL).getValue();

  if (!raw) return {};

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse stored JSON', e);
      return {};
    }
  }
  return {};
}

/**
 * Optional: Add a custom menu so you can run setup manually
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Menu Board Admin')
    .addItem('🔧 Setup / Repair Storage Sheet', 'setupSheet')
    .addToUi();
}

// Run once after pasting the code to create the sheet immediately
// (You can delete this line after the first run if you want)
setupSheet();
