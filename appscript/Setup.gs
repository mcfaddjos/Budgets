/**
 * Run once from the Apps Script editor (select setupSpreadsheet in the
 * function dropdown, click Run) right after the first `clasp push`, before
 * the Web App is used. Every other tab is created lazily on first access,
 * which would otherwise leave the two QuickAdd tabs missing until the app
 * happened to call a sync action — but those tabs need to exist up front
 * since a person opens and types into them directly in Google Sheets.
 */
function setupSpreadsheet() {
  Object.keys(HEADERS).forEach((name) => getSheet_(name));
}

/** Run via `clasp run setInviteCode_ --params '["your-code"]'` or from the editor. */
function setInviteCode_(code) {
  PropertiesService.getScriptProperties().setProperty("INVITE_CODE", code);
}
