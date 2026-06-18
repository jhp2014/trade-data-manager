import { config } from "dotenv";
import { resolve } from "path";
import { google } from "googleapis";

/**
 * Google Sheets transport (읽기 전용, 서버 전용).
 *
 * chart-review 의 apps/chart-review/src/actions/sheet.ts 와 평행한 자체 보유 사본이다.
 * 중복은 read-only·2곳뿐이라 의도적으로 허용(추출 안 함). 자격증명 env 가 바뀌면 양쪽을 맞출 것.
 * caseId 에 영향을 주는 정규화는 sheetParse.ts 에 따로 격리되어 있다.
 */

const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

config({ path: resolve(process.cwd(), "../../.env") });

/** 시트 탭을 읽어 원본 셀 매트릭스(string[][])를 반환한다. */
export async function readSheetValues(spreadsheetId: string, tab: string): Promise<string[][]> {
    const auth = createSheetsAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${quoteSheetName(tab)}!A:ZZZ`,
        valueRenderOption: "FORMATTED_VALUE",
    });

    return (res.data.values ?? []) as string[][];
}

function createSheetsAuth() {
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (keyFile) {
        return new google.auth.GoogleAuth({ keyFile, scopes: [SHEETS_READONLY_SCOPE] });
    }

    const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");

    return new google.auth.JWT({ email, key: privateKey, scopes: [SHEETS_READONLY_SCOPE] });
}

function requireEnv(key: string): string {
    const value = process.env[key]?.trim();
    if (!value) {
        throw new Error(`[sheet] ${key} is required to read Google Sheets`);
    }
    return value;
}

function quoteSheetName(tab: string): string {
    return `'${tab.replace(/'/g, "''")}'`;
}
