// 라벨 타점 [탐색]의 **순수부** — 행 세우기·칸 상태(●/○/·)·개수·범위·순회 순서.
// 규칙: .claude/decisions.md 「라벨 타점 [탐색]」. 훅 없는 함수만 둔다(테스트 표면).
//
// 재료는 그룹 멤버십 피드 두 벌(하루 차트 · 좌표 라벨) **직독**이다 — 셀 엔진 평가가 없다.
// 행은 **평탄 배열 한 벌**(날짜 머리 · 종목 머리 · 타점)로 세운다: 렌더와 w/s 순회가 같은 배열에서 파생되고,
// 라벨이 수천으로 늘어 가상화가 필요해지면 렌더만 바꿔 붙인다.
import type { Group, GroupMembership, PointGroupMembership } from "../../api/groups.js";
import { expandWithAncestors } from "../../lib/groupTree.js";
import { liveGroupNames } from "../../lib/groupIndex.js";
import type { NavKey } from "../dailyExplore/walk.js";

/** 이 판의 단일 인스턴스 주소 — 열 선택 저장물이 여기 산다(개명 승계가 이 주소로 쓴다 · 카탈로그 duplicable 아님이 전제). */
export const LABEL_EXPLORE_PANEL_ID = "label-explore-1";

export type LabelScope = "day" | "point";
/** 열 = (그룹 이름, 종류). 종류는 고를 때 절(▣ 하루 / ◆ 타점)이 고정한다 — 라벨 조건의 "입구 = scope" 와 같은 결. */
export interface LabelCol {
    name: string;
    scope: LabelScope;
}
export const labelColKey = (c: LabelCol): string => `${c.scope}:${c.name}`;

/** 행 범위 — 「고른 라벨」(고른 열 중 하나라도 ●/○ 인 행만) / 「모든 라벨」(열은 표시만). */
export type LabelRange = "cols" | "all";

/** 칸 상태 — 직접(●) · 상속(○ — 계층: 하위 그룹 경유 / 층위: 그날 하루 라벨) · 없음(·) · 해당 없음(빈 칸). */
export type LabelCell = "direct" | "inherited" | "none" | "na";

export interface PointEntry {
    time: string; // HH:MM:SS
    direct: ReadonlySet<string>;
    applied: ReadonlySet<string>; // 직접 ∪ 조상
}
export interface ChartEntry {
    date: string;
    code: string;
    dayDirect: ReadonlySet<string>;
    dayApplied: ReadonlySet<string>;
    /** 시각 오름차순. 없으면 하루 라벨만 있는 차트. */
    points: readonly PointEntry[];
}

/** 차트 목록 — 정렬: 날짜 내림(최근순) · 날짜 안 종목 코드 오름(탐색판과 같은 자) · 종목 안 시각 오름. */
export function labelChartsOf(
    memberships: readonly GroupMembership[],
    pointMemberships: readonly PointGroupMembership[],
    groupByName: ReadonlyMap<string, Group>,
): ChartEntry[] {
    const byKey = new Map<string, { date: string; code: string; day: string[]; points: PointEntry[] }>();
    const slot = (code: string, date: string): { date: string; code: string; day: string[]; points: PointEntry[] } => {
        const k = `${code}|${date}`;
        let e = byKey.get(k);
        if (!e) byKey.set(k, (e = { date, code, day: [], points: [] }));
        return e;
    };
    for (const m of memberships) {
        const names = liveGroupNames(m.groupNames, groupByName);
        if (names.length > 0) slot(m.stockCode, m.date).day = names;
    }
    for (const p of pointMemberships) {
        const names = liveGroupNames(p.groupNames, groupByName);
        if (names.length === 0) continue;
        slot(p.stockCode, p.date).points.push({ time: p.time, direct: new Set(names), applied: new Set(expandWithAncestors(names, groupByName)) });
    }
    const out: ChartEntry[] = [];
    for (const e of byKey.values()) {
        e.points.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
        out.push({ date: e.date, code: e.code, dayDirect: new Set(e.day), dayApplied: new Set(expandWithAncestors(e.day, groupByName)), points: e.points });
    }
    return out.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

const setCell = (direct: ReadonlySet<string>, applied: ReadonlySet<string>, name: string): LabelCell =>
    direct.has(name) ? "direct" : applied.has(name) ? "inherited" : "none";

/** 종목 머리줄의 ▣ 판정 — 화면엔 안 찍는다(이름줄 = 이름 + 테마뿐). 행 세우기·개수(차트 수)가 쓴다. ◆ 열은 해당 없음. */
export function stockCellOf(chart: ChartEntry, col: LabelCol): LabelCell {
    return col.scope === "day" ? setCell(chart.dayDirect, chart.dayApplied, col.name) : "na";
}

/**
 * 타점 줄 칸 — ◆ 열은 제 라벨, ▣ 열은 그날 하루 라벨(층위 상속)을 **다른 라벨과 똑같이** 찍는다: 직접 = ●, 하위 경유 = ○.
 * 하루인지 타점인지는 범례가 말한다 — 칸에서 또 가르지 않는다(2026-09-28 사용자 확정, 옛 "▣ 는 타점 줄에 늘 ○" 를 대체).
 */
export function pointCellOf(chart: ChartEntry, p: PointEntry, col: LabelCol): LabelCell {
    return col.scope === "point" ? setCell(p.direct, p.applied, col.name) : setCell(chart.dayDirect, chart.dayApplied, col.name);
}

const hit = (c: LabelCell): boolean => c === "direct" || c === "inherited";

export type LabelRow =
    | { kind: "date"; date: string }
    /** stop = 보이는 타점 줄이 0개 — w/s 가 머리줄에서 멈춘다(하루 라벨만 있는 차트 · 타점이 전부 걸러진 ▣ 차트). */
    | { kind: "stock"; chart: ChartEntry; stop: boolean; firstTime: string | null }
    | { kind: "point"; chart: ChartEntry; point: PointEntry };

/**
 * 보이는 행 — 평탄 배열. 좁히기(`narrow`)는 늘 「열 라벨만」의 부분집합이라 좁히는 동안 범위는 무관하다.
 *  · 타점 줄: 「전체」 이거나, 대상 열(좁힘 = 그 열 하나, 아니면 고른 열 전부) 중 하나라도 ●/○
 *  · 종목 머리줄: 남은 타점 줄이 있거나, 대상 ▣ 열에서 제 칸이 ●/○ (「전체」 면 늘)
 *  · 날짜 머리줄: 남은 자식이 있으면
 */
export function shownRowsOf(charts: readonly ChartEntry[], cols: readonly LabelCol[], range: LabelRange, narrow: LabelCol | null = null): LabelRow[] {
    const everything = range === "all" && narrow === null;
    const targets = narrow !== null ? [narrow] : cols;
    const out: LabelRow[] = [];
    let lastDate: string | null = null;
    for (const chart of charts) {
        const points = everything ? chart.points : chart.points.filter((p) => targets.some((c) => hit(pointCellOf(chart, p, c))));
        const headHit = everything || points.length > 0 || targets.some((c) => hit(stockCellOf(chart, c)));
        if (!headHit) continue;
        if (chart.date !== lastDate) {
            out.push({ kind: "date", date: chart.date });
            lastDate = chart.date;
        }
        out.push({ kind: "stock", chart, stop: points.length === 0, firstTime: points[0]?.time ?? null });
        for (const point of points) out.push({ kind: "point", chart, point });
    }
    return out;
}

/**
 * 개수 — **적용 기준(●+○)**, 좁히기 결과와 같은 자. ◆ 열 = 타점 수, ▣ 열 = **차트 수**.
 * 범위 토글과 무관하다(보이는 행이 아니라 라벨이 센다).
 */
export function labelCountsByCol(charts: readonly ChartEntry[], cols: readonly LabelCol[]): { total: Map<string, number>; byDate: Map<string, Map<string, number>> } {
    const total = new Map<string, number>();
    const byDate = new Map<string, Map<string, number>>();
    for (const chart of charts) {
        let day = byDate.get(chart.date);
        if (!day) byDate.set(chart.date, (day = new Map()));
        for (const c of cols) {
            const n = c.scope === "day"
                ? (hit(stockCellOf(chart, c)) ? 1 : 0)
                : chart.points.reduce((acc, p) => acc + (hit(pointCellOf(chart, p, c)) ? 1 : 0), 0);
            if (n === 0) continue;
            const k = labelColKey(c);
            total.set(k, (total.get(k) ?? 0) + n);
            day.set(k, (day.get(k) ?? 0) + n);
        }
    }
    return { total, byDate };
}

/** 순회 순서 — 렌더 배열과 같은 한 배열에서 파생(보이는 대로 밟는다). 타점 = 시각 · 멈춤 머리줄 = 시각 없음. */
export function navOrderOf(rows: readonly LabelRow[]): NavKey[] {
    const out: NavKey[] = [];
    for (const r of rows) {
        if (r.kind === "point") out.push({ code: r.chart.code, date: r.chart.date, time: r.point.time });
        else if (r.kind === "stock" && r.stop) out.push({ code: r.chart.code, date: r.chart.date });
    }
    return out;
}

/** 목록 순서의 비교 — 날짜 내림 · 코드 오름 · 머리줄(시각 없음)이 그 차트 맨 앞 · 시각 오름. */
function cmpNav(a: { code: string; date: string; time: string | null }, b: { code: string; date: string; time: string | null }): number {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.time === b.time) return 0;
    if (a.time === null) return -1;
    if (b.time === null) return 1;
    return a.time < b.time ? -1 : 1;
}

/**
 * 한 칸 — 커서가 목록에 있으면 이웃, 없으면(라벨을 떼서 사라짐 · 라벨 아닌 분 · 다른 판에서 옴) **정렬상
 * 끼어들 자리의 이웃**으로 간다(전 기간 목록에서 처음으로 튀면 자리를 잃는다). 끝이면 boundary — 날짜 넘기기는 없다.
 */
export function stepFrom(
    order: readonly NavKey[],
    cursor: { code: string; date: string; time: string | null } | null,
    dir: 1 | -1,
): { kind: "move"; to: NavKey } | { kind: "boundary" } | null {
    if (order.length === 0) return null;
    if (cursor === null) return { kind: "move", to: dir > 0 ? order[0]! : order[order.length - 1]! };
    const key = (k: NavKey): { code: string; date: string; time: string | null } => ({ code: k.code, date: k.date, time: k.time ?? null });
    const at = order.findIndex((k) => cmpNav(key(k), cursor) === 0);
    let next: number;
    if (at >= 0) next = at + dir;
    else {
        const after = order.findIndex((k) => cmpNav(key(k), cursor) > 0); // 커서 뒤 첫 칸(-1 = 끝 너머)
        const ins = after < 0 ? order.length : after;
        next = dir > 0 ? ins : ins - 1;
    }
    if (next < 0 || next >= order.length) return { kind: "boundary" };
    return { kind: "move", to: order[next]! };
}

/** 개명 승계 — 열이 그룹 이름을 들고 있으므로 useGroups.renameGroup 이 저장 집합과 함께 부른다. 바뀔 게 없으면 같은 배열. */
export function renameInLabelCols(cols: readonly LabelCol[], from: string, to: string): readonly LabelCol[] {
    return cols.some((c) => c.name === from) ? cols.map((c) => (c.name === from ? { ...c, name: to } : c)) : cols;
}

/** 저장물 파싱 — 모양이 틀린 칸은 버린다(영속 가방은 사람이 고칠 수도, 옛 모양일 수도 있다). */
export function parseLabelCols(v: unknown): LabelCol[] {
    if (!Array.isArray(v)) return [];
    return v.filter((c): c is LabelCol =>
        !!c && typeof c === "object" && typeof (c as LabelCol).name === "string" && ((c as LabelCol).scope === "day" || (c as LabelCol).scope === "point"));
}
