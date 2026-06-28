// 월별 수집용 — "YYYY-MM" 검증 + 그 달 날짜 열거. 순수(타임존 무관 문자열/달력 산술).
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;

/** "YYYY-MM" 형식·월 1~12·연 2000~2100 검증("가능한 년월"). */
export function isValidYearMonth(yearMonth: string): boolean {
    if (!YEAR_MONTH_RE.test(yearMonth)) return false;
    const [y, m] = yearMonth.split("-").map(Number);
    return y >= 2000 && y <= 2100 && m >= 1 && m <= 12;
}

/** "YYYY-MM" → 그 달 모든 날짜 "YYYY-MM-DD"[](01~말일, 윤년 반영). 형식 불량이면 throw. */
export function enumerateMonthDates(yearMonth: string): string[] {
    if (!isValidYearMonth(yearMonth)) {
        throw new Error(`잘못된 년월(YYYY-MM, 2000~2100): ${yearMonth}`);
    }
    const [y, m] = yearMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate(); // m 1-based → 그 달 말일
    const p = (n: number) => String(n).padStart(2, "0");
    const dates: string[] = [];
    for (let d = 1; d <= lastDay; d++) dates.push(`${yearMonth}-${p(d)}`);
    return dates;
}
