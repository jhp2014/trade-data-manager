// 작업 대상 목록의 **행 모델**(순수) — 두 우주가 한 배열로 모인다.
// 규칙 전문은 .claude/decisions.md 「집합 = (낟알, 우주, 조건)」.
//
// ## 왜 순수 함수가 소유하나
// "화면 순서 = 순회 순서" 불변식은 **행 배열이 하나일 때만** 성립한다. 순회가 별도 배열(옛
// `flatPoints`)을 만들면 접힘이 반영되지 않은 유령 행을 밟는다. 그래서 목록도 순회도 여기서 나온
// `rows` 하나를 본다. 가상화·붙는 머리 산술도 이 배열의 파생이다.
//
// ## 접힘은 **행을 안 만드는 것**이다
// 접힌 종목의 자식을 렌더에서만 숨기면 순회가 그걸 계속 밟는다. 빌더가 아예 안 넣으면
// "접힌 것은 순회에서 빠진다"가 별도 코드 없이 구조적으로 성립한다.
import type { CellHit } from "@trade-data-manager/market/domain";
import type { ReviewPointKey } from "@trade-data-manager/market/domain";
import type { DayPresence } from "../../lib/presence.js";

/** 종단 목록의 항목 — 기존 계약 그대로(WorksetList 가 쓰던 모양). */
export interface WorksetEntry {
    date: string;
    code: string;
    presence: DayPresence;
    points: ReviewPointKey[];
}

/**
 * 하루 우주의 좌표 하나 — 조건이 뽑았거나(hit), 라벨이거나, 둘 다.
 * **셋 다 같은 급의 행**이다(표식만 갈린다 — ◇ 후보 / ◆ 라벨 / 둘 다는 둘이 보인다).
 */
export interface DayCell {
    code: string;
    /** "HH:MM:SS" — 타점 자연키와 같은 자(시선·배정이 이 문자열을 그대로 쓴다). */
    time: string;
    min: number;
    /** 조건이 뽑은 셀이면 그 산출물(라벨만인 좌표는 null). */
    hit: CellHit | null;
    /** 좌표 라벨이 붙어 있나 — **조건이 이걸 지우지 못한다**(겹쳐 놓인 진실 층). */
    labeled: boolean;
}

export type WorksetRow =
    // ── 종단(전 기간) — 날짜 > 종목 > 타점 3층
    | { kind: "date"; key: string; date: string; count: number }
    | { kind: "stock"; key: string; entry: WorksetEntry }
    | { kind: "point"; key: string; entry: WorksetEntry; point: ReviewPointKey }
    // ── 하루(셀) — 종목 > 좌표 2층(날짜가 상수라 날짜 머리가 없다)
    | { kind: "dayStock"; key: string; code: string; hits: number; labels: number; collapsed: boolean }
    | { kind: "dayCell"; key: string; date: string; cell: DayCell };

/** 밟을 수 있는 행의 키 — 머리(날짜·종목)는 시선 대상이 아니라 그룹 라벨이다. */
export interface NavKey {
    code: string;
    date: string;
    /** null = 하루 선택(종단의 종목 행). 하루 우주에는 없다(전부 좌표). */
    time: string | null;
}

/** 종단 3층 — 기존 동작 그대로(행 빌드를 목록 컴포넌트 밖으로 옮긴 것뿐). */
export function longitudinalRows(groups: readonly { date: string; stocks: readonly WorksetEntry[] }[]): WorksetRow[] {
    const out: WorksetRow[] = [];
    for (const g of groups) {
        out.push({ kind: "date", key: `@${g.date}`, date: g.date, count: g.stocks.length });
        for (const e of g.stocks) {
            out.push({ kind: "stock", key: `${e.date}|${e.code}`, entry: e });
            for (const p of e.points) out.push({ kind: "point", key: `${e.date}|${e.code}|${p.time}`, entry: e, point: p });
        }
    }
    return out;
}

export interface DayRowsOptions {
    /** `종목순` = 종목 머리 + 자식(접힘 있음) · `시간순` = 머리 없이 평탄(접힘 개념이 없다). */
    sort: "stock" | "time";
    /** 접힌 종목 코드들 — 그 자식 행은 **만들지 않는다**(순회에서 빠지는 이유). */
    collapsed: ReadonlySet<string>;
}

/**
 * 하루 우주의 행 — 조건이 뽑은 셀 ∪ 그날 라벨. 정렬은 종목순이면 (코드↑, 분↑), 시간순이면 (분↑, 코드↑).
 * ⚠ **라벨은 조건과 무관하게 실린다** — 조건이 비어도 라벨 행은 선다(decisions 「집합」: 겹쳐 놓인 진실 층).
 */
export function dayRows(cells: readonly DayCell[], date: string, opts: DayRowsOptions): WorksetRow[] {
    const out: WorksetRow[] = [];
    if (opts.sort === "time") {
        const flat = [...cells].sort((a, b) => a.min - b.min || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
        for (const c of flat) out.push({ kind: "dayCell", key: `${date}|${c.code}|${c.time}`, date, cell: c });
        return out;
    }
    const byCode = new Map<string, DayCell[]>();
    for (const c of cells) {
        const list = byCode.get(c.code);
        if (list) list.push(c);
        else byCode.set(c.code, [c]);
    }
    for (const code of [...byCode.keys()].sort()) {
        const list = byCode.get(code)!.sort((a, b) => a.min - b.min);
        const collapsed = opts.collapsed.has(code);
        out.push({
            kind: "dayStock",
            key: `${date}|${code}`,
            code,
            hits: list.filter((c) => c.hit !== null).length,
            labels: list.filter((c) => c.labeled).length,
            collapsed,
        });
        if (collapsed) continue; // 자식을 **안 만든다** — 접힘이 곧 순회 제외다
        for (const c of list) out.push({ kind: "dayCell", key: `${date}|${code}|${c.time}`, date, cell: c });
    }
    return out;
}

/** 순회 대상 — 좌표 행만(머리는 건너뛴다). 화면에 없는 행은 여기에도 없다. */
export function walkableOf(rows: readonly WorksetRow[]): NavKey[] {
    const out: NavKey[] = [];
    for (const r of rows) {
        if (r.kind === "point") out.push({ code: r.entry.code, date: r.entry.date, time: r.point.time });
        else if (r.kind === "dayCell") out.push({ code: r.cell.code, date: r.date, time: r.cell.time });
    }
    return out;
}

export const navKeyOf = (k: NavKey): string => `${k.code}|${k.date}|${k.time ?? ""}`;

/**
 * 목록 안에서 한 칸 — 끝을 넘으면 `boundary`(호출자가 날짜를 넘길지 정한다).
 * 커서가 목록에 없으면 방향의 첫 항목으로 들어간다(옛 동작 그대로).
 */
export function stepWithin(
    order: readonly NavKey[],
    cursor: { code: string; date: string; time: string | null } | null,
    dir: 1 | -1,
): { kind: "move"; to: NavKey } | { kind: "boundary"; dir: 1 | -1 } | null {
    if (order.length === 0) return null;
    const at = cursor === null ? -1 : order.findIndex((k) => k.code === cursor.code && k.date === cursor.date && k.time === cursor.time);
    if (at < 0) return { kind: "move", to: dir > 0 ? order[0]! : order[order.length - 1]! };
    const next = at + dir;
    if (next < 0 || next >= order.length) return { kind: "boundary", dir };
    return { kind: "move", to: order[next]! };
}
