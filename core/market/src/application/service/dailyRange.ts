// 일봉 기본 수집 범위 정책 — 오늘 기준 1년 반. 순수 문자열 날짜 산술(타임존 무관).
import type { DateRange } from "../port/outbound/dailyCandleProvider.js";

const DEFAULT_LOOKBACK_MONTHS = 18;

/** 해당 연·월의 일수. */
function daysInMonth(year: number, month1: number): number {
    return new Date(year, month1, 0).getDate(); // month1=1..12, day0 = 직전달 말일
}

/** "YYYY-MM-DD" 에서 months 만큼 과거로. 말일은 대상 달 일수로 클램프(예: 03-31 −1달 → 02-28). */
function subtractMonths(date: string, months: number): string {
    const [y, m, d] = date.split("-").map(Number);
    const total = y * 12 + (m - 1) - months;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    const nd = Math.min(d, daysInMonth(ny, nm));
    const p = (n: number) => String(n).padStart(2, "0");
    return `${ny}-${p(nm)}-${p(nd)}`;
}

/**
 * 기본 일봉 수집 범위 = [오늘−18개월, 오늘]. inclusive.
 * 충분히 과거라 기존 저장분과 항상 겹쳐 자가치유 경계 비교가 성립한다.
 */
export function defaultDailyRange(today: string): DateRange {
    return { from: subtractMonths(today, DEFAULT_LOOKBACK_MONTHS), to: today };
}

/** Asia/Seoul 기준 오늘(YYYY-MM-DD). en-CA 로케일이 ISO 형식을 준다. */
export function seoulToday(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}
