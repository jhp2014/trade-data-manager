import { google, type sheets_v4 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { ValueInputOption, ValueRenderOption } from "./types.js";
import { SheetsError } from "./errors.js";

/**
 * 시트 저수준 연산 추상화. 기본은 googleapis 구현이지만 주입형이라
 * - 테스트에서 mock 으로 교체(네트워크 없이 캐시/헤더초기화/자가복구 검증)
 * - 미래에 다른 전송으로 교체
 * 가 가능하다. **googleapis 를 import 하는 곳은 이 파일뿐** — client 로직은 비의존.
 */
export interface SheetsTransport {
    getValues(spreadsheetId: string, range: string, valueRender: ValueRenderOption): Promise<string[][]>;
    updateValues(
        spreadsheetId: string,
        range: string,
        values: string[][],
        valueInputOption: ValueInputOption,
    ): Promise<void>;
    clearValues(spreadsheetId: string, range: string): Promise<void>;
    appendValues(
        spreadsheetId: string,
        range: string,
        values: string[][],
        valueInputOption: ValueInputOption,
    ): Promise<void>;
    getTabTitles(spreadsheetId: string): Promise<string[]>;
    addTab(spreadsheetId: string, title: string): Promise<void>;
}

/** googleapis 에러를 SheetsError(meta.status 포함)로 정규화. status 로 자가복구 판단. */
function wrap(err: unknown, op: string, meta: Record<string, unknown> = {}): SheetsError {
    const status =
        (err as { code?: number; status?: number })?.code ??
        (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : String(err);
    return new SheetsError(`[sheets] ${op} 실패: ${message}`, { op, status, ...meta });
}

/** OAuth2 클라이언트로 인증된 googleapis Sheets 전송 구현. */
export function createGoogleapisTransport(auth: OAuth2Client): SheetsTransport {
    const sheets: sheets_v4.Sheets = google.sheets({ version: "v4", auth });
    return {
        async getValues(spreadsheetId, range, valueRender) {
            try {
                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range,
                    valueRenderOption: valueRender,
                });
                return (res.data.values ?? []) as string[][];
            } catch (err) {
                throw wrap(err, "getValues", { range });
            }
        },
        async updateValues(spreadsheetId, range, values, valueInputOption) {
            try {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range,
                    valueInputOption,
                    requestBody: { values },
                });
            } catch (err) {
                throw wrap(err, "updateValues", { range });
            }
        },
        async clearValues(spreadsheetId, range) {
            try {
                await sheets.spreadsheets.values.clear({ spreadsheetId, range });
            } catch (err) {
                throw wrap(err, "clearValues", { range });
            }
        },
        async appendValues(spreadsheetId, range, values, valueInputOption) {
            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range,
                    valueInputOption,
                    insertDataOption: "INSERT_ROWS",
                    requestBody: { values },
                });
            } catch (err) {
                throw wrap(err, "appendValues", { range });
            }
        },
        async getTabTitles(spreadsheetId) {
            try {
                const res = await sheets.spreadsheets.get({
                    spreadsheetId,
                    fields: "sheets.properties.title",
                });
                return (res.data.sheets ?? [])
                    .map((s) => s.properties?.title ?? "")
                    .filter(Boolean);
            } catch (err) {
                throw wrap(err, "getTabTitles");
            }
        },
        async addTab(spreadsheetId, title) {
            try {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
                });
            } catch (err) {
                throw wrap(err, "addTab", { title });
            }
        },
    };
}
