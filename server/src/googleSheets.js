const path = require("node:path");
const { GoogleAuth } = require("google-auth-library");

const KEY_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
  path.join(__dirname, "..", "service-account.json");
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

let auth = null;
function getAuth() {
  if (!auth) {
    auth = new GoogleAuth({
      keyFile: KEY_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }
  return auth;
}

/** Fetches all values from one tab of the configured spreadsheet, as a grid of strings. */
async function getSheetRows(tabName) {
  if (!SPREADSHEET_ID) {
    throw new Error("GOOGLE_SHEET_ID is not configured (set it in server/.env or the environment)");
  }

  const client = await getAuth().getClient();
  const { token } = await client.getAccessToken();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(tabName)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sheets API returned ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.values || [];
}

module.exports = { getSheetRows };
