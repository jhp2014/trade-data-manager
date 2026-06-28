// 날짜 범위 열거 — 순수(UTC 산술, 타임존 무관). collect·preview 가 [from,to]를 일자로 편다.
/** "YYYY-MM-DD" → 다음 날. */
export function nextDate(date: string): string {
    const dt = new Date(`${date}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
}

/** [from,to] inclusive 의 모든 날짜. from > to 면 빈 배열. */
export function enumerateDates(from: string, to: string): string[] {
    const out: string[] = [];
    for (let d = from; d <= to; d = nextDate(d)) out.push(d);
    return out;
}
