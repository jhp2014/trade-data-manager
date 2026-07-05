// 일봉 기본 수집 범위 정책 — 오늘 기준 1년 반. 순수 문자열 날짜 산술(타임존 무관).
import type { DateRange } from "#domain";

const DEFAULT_LOOKBACK_MONTHS = 18;

/** 해당 연·월의 일수. */
function daysInMonth(year: number, month1: number): number {
    return new Date(year, month1, 0).getDate(); // month1=1..12, day0 = 직전달 말일
}

/** "YYYY-MM-DD" 에서 months 만큼 과거로. 말일은 대상 달 일수로 클램프(예: 03-31 −1달 → 02-28). */
export function subtractMonths(date: string, months: number): string {
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

const COLLECT_LOOKBACK_MONTHS = 24;

/**
 * collect(최신 유지) 일봉 수집 범위 = [오늘−24개월, 오늘]. inclusive.
 * 24개월 ≈ 500거래일 < 600(키움 한 콜) → 1콜로 끝나고, 차트 표시 깊이(chartDailyRange)와도 일치.
 * self-heal 경계 비교는 오늘−24개월 봉이 기존 저장분과 겹치면 성립(치유는 earliest 부터 전체 재수집).
 */
export function collectDailyRange(today: string): DateRange {
    return { from: subtractMonths(today, COLLECT_LOOKBACK_MONTHS), to: today };
}

// backfill 런웨이 — range.from 이전으로 ≈600거래일(2.4년) 이상을 확보해, 백필 구간 어느 날의 차트에도
// 뒤로 충분한 일봉 히스토리가 있게 한다. 30개월(≈630거래일)이면 600봉 이상 보장.
const BACKFILL_RUNWAY_MONTHS = 30;

/**
 * backfill 일봉 수집 범위 = [range.from−≈600봉, range.to]. inclusive.
 * "가장 과거(range.from) 기준 600봉 깊이" — 백필 구간의 모든 거래일이 ≥600봉 차트 런웨이를 갖는다.
 */
export function backfillDailyRange(range: DateRange): DateRange {
    return { from: subtractMonths(range.from, BACKFILL_RUNWAY_MONTHS), to: range.to };
}

const CHART_LOOKBACK_MONTHS = 24;

/**
 * 차트 조회용 일봉 범위 = [date−2년, date]. inclusive.
 * 오늘이 아니라 요청 거래일 기준(과거 어느 날의 그날까지 차트를 재현). 직전 거래일 종가(분봉 % 기준가)도 이 범위에 포함된다.
 */
export function chartDailyRange(date: string): DateRange {
    return { from: subtractMonths(date, CHART_LOOKBACK_MONTHS), to: date };
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
