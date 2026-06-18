import { composeCaseId } from "@/domain/caseId";

/**
 * 시트 행 → 워킹셋 caseId 목록(순수 함수, googleapis 무관).
 *
 * ⚠️ 동기화 주의: 아래 normalizeTradeDate/normalizeTradeTime 은 chart-review 의
 * apps/chart-review/src/lib/parseSheet.ts 와 동일하게 유지해야 한다. caseId 는 이
 * 정규화 결과로 만들어지며(composeCaseId), 어긋나면 같은 시트를 읽어도 data-core
 * review_point 와 매칭되지 않아 "고아"로 드러난다(조용한 오염은 아님).
 * 둘 중 하나를 고치면 다른 쪽도 맞출 것. (중복은 read-only·2곳뿐이라 의도적으로 허용)
 */

const REQUIRED_COLUMNS = ["stockCode", "tradeDate"] as const;

/** 헤더에 stockCode/tradeDate(+ 선택 tradeTime)가 있는 시트 매트릭스에서 caseId 목록을 뽑는다. */
export function parseSheetCaseIds(values: string[][]): string[] {
    if (values.length === 0) return [];

    const headers = values[0].map((h) => h.trim());
    const headerIndex = new Map(headers.map((h, i) => [h, i]));

    for (const column of REQUIRED_COLUMNS) {
        if (!headerIndex.has(column)) {
            throw new Error(`[sheet] required column missing: ${column}`);
        }
    }

    const codeIndex = headerIndex.get("stockCode")!;
    const dateIndex = headerIndex.get("tradeDate")!;
    const timeIndex = headerIndex.get("tradeTime");

    const seen = new Set<string>();
    const caseIds: string[] = [];
    for (let i = 1; i < values.length; i++) {
        const row = values[i] ?? [];
        const stockCode = (row[codeIndex] ?? "").trim();
        const tradeDate = normalizeTradeDate((row[dateIndex] ?? "").trim());
        if (!stockCode || !tradeDate) continue;

        const tradeTime =
            timeIndex === undefined ? "" : normalizeTradeTime((row[timeIndex] ?? "").trim());
        const caseId = composeCaseId({ stockCode, tradeDate, tradeTime: tradeTime || null });
        if (!seen.has(caseId)) {
            seen.add(caseId);
            caseIds.push(caseId);
        }
    }
    return caseIds;
}

function normalizeTradeDate(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const dateMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (dateMatch) {
        const [, year, month, day] = dateMatch;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial > 0) {
        const utc = Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000;
        return new Date(utc).toISOString().slice(0, 10);
    }

    return trimmed;
}

function normalizeTradeTime(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (timeMatch) {
        const [, hour, minute] = timeMatch;
        return `${hour.padStart(2, "0")}:${minute}`;
    }

    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial >= 0 && serial < 1) {
        const totalMinutes = Math.round(serial * 24 * 60);
        const hour = Math.floor(totalMinutes / 60) % 24;
        const minute = totalMinutes % 60;
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    return trimmed.slice(0, 5);
}
