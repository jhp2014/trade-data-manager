import { config } from "dotenv";
import { existsSync } from "fs";
import { isAbsolute, resolve } from "path";
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

/** 스프레드시트의 탭 title 목록을 반환한다(읽기 전용 메타 조회). */
export async function readSheetTabs(spreadsheetId: string): Promise<string[]> {
    const auth = createSheetsAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
    });

    return (meta.data.sheets ?? [])
        .map((s) => s.properties?.title ?? "")
        .filter(Boolean);
}

function createSheetsAuth() {
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (keyFile) {
        return new google.auth.GoogleAuth({
            keyFile: resolveKeyFile(keyFile),
            scopes: [SHEETS_READONLY_SCOPE],
        });
    }

    const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");

    return new google.auth.JWT({ email, key: privateKey, scopes: [SHEETS_READONLY_SCOPE] });
}

/**
 * GOOGLE_APPLICATION_CREDENTIALS 가 상대경로면 cwd(앱 폴더) 기준이라 hypothesis-lab 에선
 * 못 찾는다. .env 는 레포 루트 공용이고 실제 키파일은 chart-review 앱에 있으므로,
 * 절대경로가 아니면 cwd → 레포 루트 → apps/chart-review 순으로 실제 존재하는 경로를 찾는다.
 */
function resolveKeyFile(keyFile: string): string {
    if (isAbsolute(keyFile) || existsSync(keyFile)) return keyFile;
    const repoRoot = resolve(process.cwd(), "../..");
    for (const base of [repoRoot, resolve(repoRoot, "apps/chart-review")]) {
        const candidate = resolve(base, keyFile);
        if (existsSync(candidate)) return candidate;
    }
    return keyFile; // 못 찾으면 원본 그대로 — 인증 단계에서 에러가 표면화된다.
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
