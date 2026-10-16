// 거래일 목록(YYYY-MM-DD 오름차순) 위의 계산(순수) — 경로 줄 날짜 고르기가 쓴다.

/** 날짜 고르기 판을 처음 열 때 보일 년·월 — 경로 날짜가 있으면 그 달, 없으면 최신 거래일의 달. 목록이 비면 null. */
export function initialView(days: readonly string[], date: string): { year: string; month: string } | null {
    const base = date || days[days.length - 1];
    return base ? { year: base.slice(0, 4), month: base.slice(5, 7) } : null;
}

/** 년 → 거래일이 있는 월("01".."12") 집합. */
export function monthsByYear(days: readonly string[]): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const d of days) {
        const y = d.slice(0, 4);
        let ms = out.get(y);
        if (!ms) out.set(y, (ms = new Set()));
        ms.add(d.slice(5, 7));
    }
    return out;
}

/** 년을 바꿀 때의 월 — 같은 월에 거래일이 있으면 그대로, 없으면 그 해의 가장 늦은 월. */
export function monthForYear(months: ReadonlySet<string> | undefined, month: string): string {
    if (!months || months.size === 0) return month;
    return months.has(month) ? month : [...months].sort().at(-1)!;
}
