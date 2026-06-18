/**
 * caseId 형식: `{stockCode}-{YYYY-MM-DD}[-{HHmm}]`
 *   예) 055550-2026-06-05-0911  (타점 시각 있음)
 *       055550-2026-06-05       (시각 없음 = groupId fallback)
 *
 * chart-review 의 resolveFieldValue("caseId") 가 만드는 문자열의 역연산.
 * 평상시 입력은 Sheet 컬럼을 그대로 읽으므로 파서는 데이터 파이프라인이 아니라
 * write 경계의 "검증 가드 + 컬럼 없는 caseId 분해" 용도로만 쓴다.
 */

export type CaseIdParts = {
    stockCode: string;
    tradeDate: string; // YYYY-MM-DD
    tradeTime: string | null; // HH:MM (시각 없으면 null)
};

const CASE_ID_RE = /^([0-9A-Za-z]{1,10})-(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?$/;

/** caseId 를 구성요소로 분해. 형식/범위가 어긋나면 null. */
export function parseCaseId(caseId: string): CaseIdParts | null {
    const m = CASE_ID_RE.exec(caseId.trim());
    if (!m) return null;

    const [, stockCode, y, mo, d, hh, mm] = m;
    const month = Number(mo);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    let tradeTime: string | null = null;
    if (hh !== undefined && mm !== undefined) {
        if (Number(hh) > 23 || Number(mm) > 59) return null;
        tradeTime = `${hh}:${mm}`;
    }

    return { stockCode, tradeDate: `${y}-${mo}-${d}`, tradeTime };
}

/** caseId 가 well-formed 인지. */
export function isValidCaseId(caseId: string): boolean {
    return parseCaseId(caseId) !== null;
}

/** 구성요소 → caseId. tradeTime 없으면 groupId 형태로 떨어진다. */
export function composeCaseId(parts: {
    stockCode: string;
    tradeDate: string;
    tradeTime?: string | null;
}): string {
    const base = `${parts.stockCode}-${parts.tradeDate}`;
    const hhmm = toHHmm(parts.tradeTime);
    return hhmm ? `${base}-${hhmm}` : base;
}

/** 주어진 컬럼들로 만든 caseId 가 실제 caseId 와 일치하는지(enrich 일관성 체크). */
export function caseIdMatchesParts(
    caseId: string,
    parts: { stockCode: string; tradeDate: string; tradeTime?: string | null },
): boolean {
    return composeCaseId(parts) === caseId.trim();
}

/** "HH:MM[:SS]" → "HHmm". 빈 값/형식 불일치면 "". */
function toHHmm(tradeTime: string | null | undefined): string {
    if (!tradeTime) return "";
    const m = /^(\d{2}):(\d{2})/.exec(tradeTime);
    return m ? `${m[1]}${m[2]}` : "";
}
