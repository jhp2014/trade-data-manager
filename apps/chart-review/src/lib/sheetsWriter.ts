import { config } from "dotenv";
import { resolve } from "path";
import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

config({ path: resolve(process.cwd(), "../../.env") });

type WriteSheetTabInput = {
  spreadsheetId: string;
  tab: string;
  matrix: string[][];
};

/**
 * 주어진 스프레드시트/탭에 매트릭스를 덮어쓴다.
 * - 탭이 없으면 새로 만든다.
 * - 기존 값은 clear 후 A1 부터 다시 채운다.
 */
export async function writeSheetTab({ spreadsheetId, tab, matrix }: WriteSheetTabInput): Promise<void> {
  const auth = createSheetsAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await ensureTabExists(sheets, spreadsheetId, tab);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: quoteSheetName(tab),
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(tab)}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: matrix },
  });
}

async function ensureTabExists(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string,
): Promise<void> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const exists = (meta.data.sheets ?? []).some((sheet) => sheet.properties?.title === tab);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tab } } }],
    },
  });
}

function createSheetsAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (keyFile) {
    return new google.auth.GoogleAuth({ keyFile, scopes: [SHEETS_SCOPE] });
  }

  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  return new google.auth.JWT({ email, key: privateKey, scopes: [SHEETS_SCOPE] });
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `[export] ${key} 가 필요합니다. GOOGLE_APPLICATION_CREDENTIALS 또는 서비스 계정 EMAIL/PRIVATE_KEY 를 설정하세요.`,
    );
  }
  return value;
}

function quoteSheetName(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}
