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

type SheetsClient = ReturnType<typeof google.sheets>;

/**
 * Sheets 클라이언트 싱글톤. 매 요청마다 auth/client 를 새로 만들면
 * googleapis 내부 토큰 캐시를 못 써 매번 토큰을 재발급한다. 모듈 레벨에서
 * 1회만 만들어 재사용한다(토큰 캐시 적중 → 첫 호출 이후 auth 왕복 제거).
 */
let sheetsClient: SheetsClient | null = null;

function getSheetsClient(): SheetsClient {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: createSheetsAuth() });
  }
  return sheetsClient;
}

/**
 * "이 (spreadsheetId, tab) 은 존재 + 헤더까지 초기화됨" 캐시.
 * appendSheetRow 의 ensureTabExists(왕복①)와 A1:A2 비어있음 체크(왕복②)는
 * 첫 write 이후엔 불필요하므로, 초기화된 탭은 두 호출을 생략하고 append 만 한다.
 */
const initializedTabs = new Set<string>();

function tabCacheKey(spreadsheetId: string, tab: string): string {
  return `${spreadsheetId}|${tab}`;
}

/** 스프레드시트의 탭(시트) 이름 목록을 반환한다. */
export async function getSpreadsheetTabs(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter(Boolean);
}

/**
 * 주어진 탭의 마지막 행 아래에 dataRow 를 추가한다.
 * - 탭이 없거나 비어있으면 headers 를 먼저 추가한다.
 * - headers 를 빈 배열로 넘기면 헤더를 쓰지 않는다.
 * - 반환값: 헤더를 실제로 썼는지 여부.
 */
export async function appendSheetRow(
  spreadsheetId: string,
  tab: string,
  headers: string[],
  dataRow: string[],
): Promise<{ wroteHeaders: boolean }> {
  const sheets = getSheetsClient();
  const cacheKey = tabCacheKey(spreadsheetId, tab);

  // 이미 초기화된 탭이면 존재/비어있음 확인을 건너뛰고 append 1회만.
  if (initializedTabs.has(cacheKey)) {
    try {
      await appendRows(sheets, spreadsheetId, tab, [dataRow]);
      return { wroteHeaders: false };
    } catch (err) {
      // 외부에서 탭이 삭제된 경우 등 → 캐시를 비우고 느린 경로로 자기복구.
      if (isMissingTabError(err)) {
        initializedTabs.delete(cacheKey);
      } else {
        throw err;
      }
    }
  }

  // 느린 경로(첫 write 또는 캐시 무효화 후): 탭 보장 + 비어있음 확인 후 append.
  await ensureTabExists(sheets, spreadsheetId, tab);

  const existing = await sheets.spreadsheets.values
    .get({ spreadsheetId, range: `${quoteSheetName(tab)}!A1:A2` })
    .catch(() => ({ data: { values: null } }));
  const isEmpty = !existing.data.values || existing.data.values.length === 0;

  const rows: string[][] = [];
  if (isEmpty && headers.length > 0) rows.push(headers);
  rows.push(dataRow);

  await appendRows(sheets, spreadsheetId, tab, rows);
  initializedTabs.add(cacheKey);
  return { wroteHeaders: isEmpty && headers.length > 0 };
}

async function appendRows(
  sheets: SheetsClient,
  spreadsheetId: string,
  tab: string,
  rows: string[][],
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${quoteSheetName(tab)}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

/** 탭 부재(범위 파싱 실패)로 인한 400 에러인지 추정한다. */
function isMissingTabError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = (err as { code?: number; status?: number }).code
    ?? (err as { status?: number }).status;
  return status === 400 || status === 404;
}

/**
 * 주어진 스프레드시트/탭에 매트릭스를 덮어쓴다.
 * - 탭이 없으면 새로 만든다.
 * - 기존 값은 clear 후 A1 부터 다시 채운다.
 */
export async function writeSheetTab({ spreadsheetId, tab, matrix }: WriteSheetTabInput): Promise<void> {
  const sheets = getSheetsClient();

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

  // 덮어쓰기로 탭이 확실히 존재 + 채워졌으므로 append 캐시도 갱신.
  initializedTabs.add(tabCacheKey(spreadsheetId, tab));
}

async function ensureTabExists(
  sheets: SheetsClient,
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
