import type { SheetsTransport } from "./transport.js";
import type { ValueInputOption, ValueRenderOption } from "./types.js";
import { isMissingTabError } from "./errors.js";

export interface ReadMatrixOptions {
    /** 탭 내 범위(예: "A:Z", "A1:D10"). 생략 시 탭 전체. */
    range?: string;
    /** 기본 "FORMATTED_VALUE". */
    valueRender?: ValueRenderOption;
}

export interface OverwriteTabInput {
    spreadsheetId: string;
    tab: string;
    matrix: string[][];
    /** 기본 "RAW". */
    valueInputOption?: ValueInputOption;
}

export interface AppendRowsInput {
    spreadsheetId: string;
    tab: string;
    rows: string[][];
    /** 탭이 비어있을 때만 데이터 앞에 1회 기록. 생략/빈 배열이면 헤더 안 씀. */
    headers?: string[];
    /** 기본 "RAW". */
    valueInputOption?: ValueInputOption;
}

export interface SheetsClient {
    /** 탭(또는 범위)을 원본 셀 매트릭스로 읽는다. */
    readMatrix(spreadsheetId: string, tab: string, opts?: ReadMatrixOptions): Promise<string[][]>;
    /** 스프레드시트의 탭 title 목록. */
    listTabs(spreadsheetId: string): Promise<string[]>;
    /** 탭을 매트릭스로 덮어쓴다(clear 후 A1부터). 탭 없으면 생성. */
    overwriteTab(input: OverwriteTabInput): Promise<void>;
    /** 탭 끝에 행을 추가한다. 빈 탭이면 헤더 자동 초기화. 반환: 헤더를 실제로 썼는지. */
    appendRows(input: AppendRowsInput): Promise<{ wroteHeaders: boolean }>;
}

/** 시트 탭명을 A1 표기 범위에서 안전하게 인용한다('foo' → ''foo'', 내부 ' 는 '' 로 이스케이프). */
function quoteTab(tab: string): string {
    return `'${tab.replace(/'/g, "''")}'`;
}

function tabKey(spreadsheetId: string, tab: string): string {
    return `${spreadsheetId}|${tab}`;
}

/**
 * transport 위에 캐시·헤더초기화·자가복구·범위 조립을 얹은 시트 클라이언트.
 * googleapis 에 비의존(transport 만 안다) → fake transport 로 단위 테스트 가능.
 *
 * 캐시(initializedTabs)는 **인스턴스 단위**다(모듈 전역 아님) — 여러 소비자/시트가 안 섞인다.
 */
export function makeSheetsClient(transport: SheetsTransport): SheetsClient {
    // "이 (spreadsheetId, tab) 은 존재 + 초기화됨" 캐시. append 의 존재/공백 확인 왕복을 2회차부터 생략.
    const initializedTabs = new Set<string>();

    async function ensureTab(spreadsheetId: string, tab: string): Promise<void> {
        const titles = await transport.getTabTitles(spreadsheetId);
        if (!titles.includes(tab)) await transport.addTab(spreadsheetId, tab);
    }

    return {
        async readMatrix(spreadsheetId, tab, opts) {
            const range = opts?.range ? `${quoteTab(tab)}!${opts.range}` : quoteTab(tab);
            return transport.getValues(spreadsheetId, range, opts?.valueRender ?? "FORMATTED_VALUE");
        },

        listTabs(spreadsheetId) {
            return transport.getTabTitles(spreadsheetId);
        },

        async overwriteTab({ spreadsheetId, tab, matrix, valueInputOption = "RAW" }) {
            await ensureTab(spreadsheetId, tab);
            await transport.clearValues(spreadsheetId, quoteTab(tab));
            await transport.updateValues(spreadsheetId, `${quoteTab(tab)}!A1`, matrix, valueInputOption);
            initializedTabs.add(tabKey(spreadsheetId, tab));
        },

        async appendRows({ spreadsheetId, tab, rows, headers = [], valueInputOption = "RAW" }) {
            const key = tabKey(spreadsheetId, tab);
            const target = `${quoteTab(tab)}!A1`;

            // 빠른 경로: 이미 초기화된 탭이면 존재/공백 확인 없이 append 1회.
            if (initializedTabs.has(key)) {
                try {
                    await transport.appendValues(spreadsheetId, target, rows, valueInputOption);
                    return { wroteHeaders: false };
                } catch (err) {
                    // 외부에서 탭이 삭제된 경우 등 → 캐시 무효화 후 느린 경로로 자기복구.
                    if (isMissingTabError(err)) initializedTabs.delete(key);
                    else throw err;
                }
            }

            // 느린 경로(첫 write 또는 캐시 무효화 후): 탭 보장 + 공백 확인 후 append.
            await ensureTab(spreadsheetId, tab);
            const existing = await transport
                .getValues(spreadsheetId, `${quoteTab(tab)}!A1:A2`, "FORMATTED_VALUE")
                .catch(() => [] as string[][]);
            const isEmpty = existing.length === 0;

            const payload: string[][] = [];
            if (isEmpty && headers.length > 0) payload.push(headers);
            payload.push(...rows);

            await transport.appendValues(spreadsheetId, target, payload, valueInputOption);
            initializedTabs.add(key);
            return { wroteHeaders: isEmpty && headers.length > 0 };
        },
    };
}
