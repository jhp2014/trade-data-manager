/**
 * 차트 타겟 파서 공용 유틸.
 *
 * 종목코드(6자리 숫자) / 날짜(YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD) 토큰 판별 및
 * 정규화 기능을 제공한다.
 */

const STOCK_CODE_RE = /^[A-Z0-9]{6}$/i;
const DATE_RES: readonly RegExp[] = [
    /^(\d{4})-(\d{2})-(\d{2})$/,    // YYYY-MM-DD
    /^(\d{4})\.(\d{2})\.(\d{2})$/,  // YYYY.MM.DD
    /^(\d{4})(\d{2})(\d{2})$/,      // YYYYMMDD
];

/** 토큰이 6자리 종목코드 형식인지 판별. */
export function isStockCode(token: string): boolean {
    return STOCK_CODE_RE.test(token);
}

/** 토큰이 지원하는 날짜 포맷 중 하나인지 판별. */
export function isDateLike(token: string): boolean {
    return DATE_RES.some((re) => re.test(token));
}

/**
 * 다양한 날짜 포맷을 "YYYY-MM-DD" 로 정규화.
 * 매칭되는 패턴이 없으면 null.
 */
export function normalizeDate(token: string): string | null {
    for (const re of DATE_RES) {
        const m = token.match(re);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return null;
}
