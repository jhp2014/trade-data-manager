/**
 * 차트 타겟 파서 공용 유틸.
 *
 * 종목코드(6자리 숫자) / 날짜(YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD) / 시간(HH:MM, HH:MM:SS)
 * 토큰 판별 및 정규화 기능을 제공한다.
 */

const STOCK_CODE_RE = /^[A-Z0-9]{6}$/i;
const DATE_RES: readonly RegExp[] = [
    /^(\d{4})-(\d{2})-(\d{2})$/,    // YYYY-MM-DD
    /^(\d{4})\.(\d{2})\.(\d{2})$/,  // YYYY.MM.DD
    /^(\d{4})(\d{2})(\d{2})$/,      // YYYYMMDD
];
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

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

/**
 * 토큰이 HH:MM 또는 HH:MM:SS 형식의 시간인지 검사. 콜론이 반드시 있어야 한다.
 * 범위 검증까지 통과해야 true (25:99 같은 잘못된 값은 false).
 */
export function isTimeLike(token: string): boolean {
    return normalizeTime(token) !== null;
}

/**
 * 토큰을 "HH:MM:SS" 형식으로 정규화한다.
 * - HH:MM → HH:MM:00
 * - HH:MM:SS → HH:MM:SS
 * - 시/분/초가 유효 범위(0-23, 0-59, 0-59)를 벗어나면 null
 * - 시/분은 2자리로 zero-pad
 */
export function normalizeTime(token: string): string | null {
    const m = token.match(TIME_RE);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = m[3] !== undefined ? Number(m[3]) : 0;
    if (hh < 0 || hh > 23) return null;
    if (mm < 0 || mm > 59) return null;
    if (ss < 0 || ss > 59) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
