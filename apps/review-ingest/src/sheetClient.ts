import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export async function writeSheet(matrix: string[][]): Promise<void> {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_ID");
  const tab = process.env.GOOGLE_SHEETS_TAB?.trim() || "review";
  const auth = createSheetsAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: quoteSheetName(tab),
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(tab)}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: matrix,
    },
  });
}

function createSheetsAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (keyFile) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: [SHEETS_SCOPE],
    });
  }

  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [SHEETS_SCOPE],
  });
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `[review-ingest export] ${key} is required. Set GOOGLE_APPLICATION_CREDENTIALS or service-account EMAIL/PRIVATE_KEY plus GOOGLE_SHEETS_ID.`,
    );
  }
  return value;
}

function quoteSheetName(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}
