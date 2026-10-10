// 복기 노트 [탐색]의 순수부 — 노트 목록 → 날짜 목록·그날 행·달력 표식. 훅 없음(테스트가 잠근다).
// 행 = 좌표(종목·날·시각) 하나. 같은 좌표 노트가 둘 이상이면 **한 행으로 합친다** — 행이 둘이면 w/s 의
// 커서 찾기(stepWithin 의 첫 매치)가 두 번째 행에 갇힌다. 합친 사실은 칸이 경고로 말한다(dup).
import type { ReviewNote } from "@trade-data-manager/wire";

export type ReviewSort = "stock" | "time";

export interface ReviewRow {
    code: string;
    date: string;
    /** HH:MM:SS */
    time: string;
    /** 이 좌표의 노트들(보통 1) — 표시는 첫 노트, 둘 이상이면 경고. */
    notes: ReviewNote[];
}

/** 노트 있는 날(오름차순·유일) — 날짜 넘기기의 「갈 수 있는 날」. */
export function noteDatesOf(notes: readonly ReviewNote[]): string[] {
    return [...new Set(notes.map((n) => n.date))].sort();
}

/** 노트 있는 달(YYYY-MM, 오름차순) — 달력의 연·월 칩. */
export function noteMonthsOf(dates: readonly string[]): string[] {
    return [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
}

/** 그날 행 — 종목순(코드 → 시각) / 시간순(시각 → 코드). w/s 도 이 순서다. */
export function rowsOn(notes: readonly ReviewNote[], date: string, sort: ReviewSort): ReviewRow[] {
    const by = new Map<string, ReviewRow>();
    for (const n of notes) {
        if (n.date !== date) continue;
        const k = `${n.code}|${n.time}`;
        const row = by.get(k);
        if (row) row.notes.push(n);
        else by.set(k, { code: n.code, date: n.date, time: n.time, notes: [n] });
    }
    const rows = [...by.values()];
    rows.sort(sort === "stock"
        ? (a, b) => a.code.localeCompare(b.code) || a.time.localeCompare(b.time)
        : (a, b) => a.time.localeCompare(b.time) || a.code.localeCompare(b.code));
    return rows;
}

/** 아직 안 본 노트(상태 빈칸) — 노트 단위로 센다. */
export const unseenOf = (notes: readonly ReviewNote[]): number => notes.filter((n) => n.state === null).length;

/** 날짜 → 안 본 노트 수(노트 있는 날만 키가 있다) — 달력 표식의 재료. */
export function unseenByDate(notes: readonly ReviewNote[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const n of notes) m.set(n.date, (m.get(n.date) ?? 0) + (n.state === null ? 1 : 0));
    return m;
}
