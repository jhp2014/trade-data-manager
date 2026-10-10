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

/** 노트 파일 이름(확장자 뺀 마지막 조각) — `26.07.31 삼성전기 0905`. */
const baseOf = (n: ReviewNote): string => n.id.split("/").pop()!.replace(/\.md$/i, "");

/**
 * 종목순 = **Obsidian 파일 목록과 같은 순서**(사용자 확정 2026-10-10): 노트 이름(`날짜 종목명 시간`)의 이름순 —
 * 같은 날이라 곧 종목명 → 시간. 대조는 시스템 로캘 + 숫자 인식(Obsidian 도 같은 PC 의 Chromium 이라 ko-KR 이면
 * 한글 → 영문). 종목코드순이면 Obsidian 과 어긋나 두 화면을 오가며 자리를 찾기 어렵다.
 */
export function makeNameCompare(locale?: string): (a: string, b: string) => number {
    return new Intl.Collator(locale, { numeric: true, sensitivity: "base" }).compare;
}
const nameCompare = makeNameCompare();

/** 그날 행 — 종목순(노트 이름순 = 종목명 → 시각) / 시간순(시각 → 노트 이름). w/s 도 이 순서다. */
export function rowsOn(notes: readonly ReviewNote[], date: string, sort: ReviewSort, cmp: (a: string, b: string) => number = nameCompare): ReviewRow[] {
    const by = new Map<string, ReviewRow>();
    for (const n of notes) {
        if (n.date !== date) continue;
        const k = `${n.code}|${n.time}`;
        const row = by.get(k);
        if (row) row.notes.push(n);
        else by.set(k, { code: n.code, date: n.date, time: n.time, notes: [n] });
    }
    const rows = [...by.values()];
    const name = (r: ReviewRow): string => baseOf(r.notes[0]!);
    rows.sort(sort === "stock"
        ? (a, b) => cmp(name(a), name(b)) || a.time.localeCompare(b.time) || a.code.localeCompare(b.code)
        : (a, b) => a.time.localeCompare(b.time) || cmp(name(a), name(b)) || a.code.localeCompare(b.code));
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
