// 타점 시트의 **정렬 체인과 그룹**(순수) — n차 정렬 + 1차 키의 그룹 접기.
//
// 규칙 셋만 알면 전부 설명된다.
//  1) 체인 = 사용자가 지정한 단들 + **암묵 폴백**(날짜↓·종목↑·시간↑ 중 체인에 없는 것). 폴백 덕에
//     어떤 정렬이든 결정적이고, 헤더에는 사용자가 고른 단만 뜬다(기본 화면이 안 지저분해진다).
//  2) 값 없음(미배치·미산정·미기입)은 **방향 무관 바닥**. 축 미배치 관례를 결과/그룹까지 넓힌 것.
//  3) 그룹 = 1차 키에서만. 이산 열(날짜·결과·그룹·배치수)은 같은 값끼리 저절로 뭉치고,
//     축처럼 값이 거의 다 유일한 열은 **사람이 그은 컷**이 있을 때만 그룹이 생긴다.
//
// 컷이 왜 정렬을 한 겹 더 꼬는가: 컷 그룹은 순위가 서로 다른 행들을 묶으므로, 그룹 안에서 2차 키가
// 돌면 축 열이 더 이상 순위 순서가 아니다. 그래서 비교자 순서가 [그룹 → 2차… → 1차 원값]이 된다
// (2차가 없으면 1차 원값만 남아 컷 없는 정렬과 완전히 같아진다 → 드래그 배치도 그대로 살아 있다).
import type { SheetRow } from "./rankSheet.js";
import { rowKeyToChartKey } from "../../lib/pointKey.js";
import type { Col } from "./sheetColumns.js";

export type SortKey =
    | { kind: "name" | "date" | "time" | "outcome" | "points" | "comment" }
    | { kind: "axis"; axisId: string };
export type SortKind = SortKey["kind"];
export interface SortStep { key: SortKey; dir: 1 | -1 }
/** 1차부터 순서대로. 비어 있을 수 없다(비면 기본 체인). */
export type SortChain = SortStep[];

/** 열 → 그 열로 정렬할 때의 키. axis 만 축 id 를 실어야 해서 분기 하나. */
export const sortKeyOf = (c: Col): SortKey => (c.key === "axis" ? { kind: "axis", axisId: c.axisId } : { kind: c.key });
/** 정렬 키의 문자열 id — **colKey 와 같은 문자열**(`ax:<id>` / kind)이라 열 설정(고정·숨김·폭·컷)과 키를 공유한다. */
export const sortKeyId = (k: SortKey): string => (k.kind === "axis" ? `ax:${k.axisId}` : k.kind);
export const sameSortKey = (a: SortKey, b: SortKey): boolean => sortKeyId(a) === sortKeyId(b);
/** 체인에서 그 키의 단 번호(1부터). 없으면 0 — 헤더 배지가 그대로 쓴다. */
export const sortStepNo = (chain: SortChain, k: SortKey): number => chain.findIndex((s) => sameSortKey(s.key, k)) + 1;

/** 헤더 첫 클릭 방향 — 축은 강한 쪽 먼저(rank 1), 나머지는 큰/늦은 쪽 먼저. */
const firstDir = (k: SortKey): 1 | -1 => (k.kind === "axis" ? 1 : -1);
/** 사용자가 안 고른 마지막 안전망 — 어떤 정렬이든 순서가 결정되게. 체인에 이미 있는 키는 건너뛴다. */
const FALLBACK: SortChain = [{ key: { kind: "date" }, dir: -1 }, { key: { kind: "name" }, dir: 1 }, { key: { kind: "time" }, dir: 1 }];
export const DEFAULT_CHAIN: SortChain = [{ key: { kind: "date" }, dir: -1 }];

// ── 체인 조작(헤더 클릭) ────────────────────────────────────────────────────
/** 평클릭 = 체인을 그 열 하나로 리셋. 이미 단독 1차면 방향만 뒤집는다. */
export function resetSort(chain: SortChain, k: SortKey): SortChain {
    const sole = chain.length === 1 && sameSortKey(chain[0].key, k);
    return [{ key: k, dir: sole ? ((chain[0].dir === 1 ? -1 : 1) as 1 | -1) : firstDir(k) }];
}
/** Shift+클릭 = 체인에 단 추가. 이미 있으면 그 단의 방향만 뒤집는다(빼기는 헤더 우클릭). */
export function pushSort(chain: SortChain, k: SortKey): SortChain {
    const i = chain.findIndex((s) => sameSortKey(s.key, k));
    if (i < 0) return [...chain, { key: k, dir: firstDir(k) }];
    return chain.map((s, j) => (j === i ? { ...s, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : s));
}
/** 체인에서 한 단 빼기. 마지막 한 단은 못 뺀다(정렬 없는 상태는 없다) → 기본 체인으로. */
export function dropSort(chain: SortChain, k: SortKey): SortChain {
    const next = chain.filter((s) => !sameSortKey(s.key, k));
    return next.length ? next : DEFAULT_CHAIN;
}

// ── 영속 복원 ───────────────────────────────────────────────────────────────
const SORT_KINDS: readonly string[] = ["name", "date", "time", "outcome", "axis"];
function parseStep(o: unknown): SortStep | null {
    if (!o || typeof o !== "object") return null;
    const s = o as { key?: { kind?: unknown; axisId?: unknown }; dir?: unknown };
    if (s.dir !== 1 && s.dir !== -1) return null;
    const k = s.key;
    if (!k || typeof k.kind !== "string" || !SORT_KINDS.includes(k.kind)) return null;
    if (k.kind === "axis" && typeof k.axisId !== "string") return null;
    return s as SortStep;
}
/** 저장된 정렬 복원. **옛 단일 정렬 객체(`{key,dir}`)도 1단 체인으로 받는다**(마이그레이션). 형태가 깨지면 null. */
export function parseSortChain(o: unknown): SortChain | null {
    if (Array.isArray(o)) {
        const steps = o.map(parseStep);
        return steps.every((s): s is SortStep => s != null) && steps.length > 0 ? steps : null;
    }
    const one = parseStep(o);
    return one ? [one] : null;
}

// ── 비교 ────────────────────────────────────────────────────────────────────
/** 정렬이 행 밖에서 끌어와야 하는 값 — 지금은 종목명 하나뿐(이름은 마스터 조회라 행에 없다). */
export interface SortCtx {
    nameOf: (code: string) => string;
}

/** 한 키에서 이 행의 값. **null = 값 없음**(미배치·미산정·미기입) → 방향 무관 바닥. */
export function sortValueOf(k: SortKey, row: SheetRow, ctx: SortCtx): string | number | null {
    switch (k.kind) {
        case "name": return ctx.nameOf(row.stockCode);
        case "date": return row.date;
        case "time": return row.time ?? null; // day 행(시각 없음)은 언제나 바닥 — 그 열 자체가 day 모드엔 없다
        case "outcome": return row.outcome || null;
        case "points": return row.pointCount ?? null;
        case "comment": return row.comment ? 1 : null;
        case "axis": return row.cells[k.axisId]?.rank ?? null;
    }
}

type Cmp = (a: SheetRow, b: SheetRow) => number;
const stepCmp = (s: SortStep, ctx: SortCtx): Cmp => (a, b) => {
    const va = sortValueOf(s.key, a, ctx), vb = sortValueOf(s.key, b, ctx);
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    return (typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : (va as number) - (vb as number)) * s.dir;
};

/**
 * 컷 그룹 번호(강한 쪽부터 0). cutKeys = 경계 orderKey 들 — 컷은 "이 자리 **바로 아래**에서 끊는다"라
 * 자기 자신은 위 그룹에 남는다. 미배치는 그룹이 없다(null) → 언제나 바닥.
 */
export function cutGroupIdx(row: SheetRow, axisId: string, cutKeys: number[]): number | null {
    const ok = row.cells[axisId]?.orderKey;
    if (ok == null) return null;
    let n = 0;
    for (const c of cutKeys) if (c > ok) n++;
    return n;
}

/**
 * 저장된 컷(**타점 앵커**) → 경계 orderKey. **행이 아니라 축 라인 전체**로 푼다 — 필터가 그 자리의 행을
 * 지워도 경계는 살아 있어야 한다. 그 타점이 축에서 빠졌으면(배치 해제·축 정리) 조용히 버린다.
 */
export function resolveCutKeys(anchors: string[], orderKeyOfPoint: Map<string, number> | undefined): number[] {
    if (!orderKeyOfPoint) return [];
    const keys = new Set<number>();
    for (const a of anchors) {
        // 옛 저장물 흡수 — day 축 컷이 타점 키(3조각)로 남아 있으면 시각을 벗겨 차트 행 키로 푼다
        // (resolveBound·레일 마커와 같은 규칙: 저장물 마이그레이션 대신 읽기가 감당).
        const ok = orderKeyOfPoint.get(a) ?? orderKeyOfPoint.get(rowKeyToChartKey(a));
        if (ok != null) keys.add(ok);
    }
    return [...keys].sort((a, b) => b - a); // 강→약
}

/** 컷이 실제로 그룹을 만드는 상태인가 — 1차가 축이고 그 축에 컷이 있을 때만. */
export const cutsActive = (chain: SortChain, cutKeys: number[]): boolean => cutKeys.length > 0 && chain[0]?.key.kind === "axis";

function chainCmps(chain: SortChain, ctx: SortCtx, cutKeys: number[]): Cmp[] {
    const cmps: Cmp[] = [];
    if (cutsActive(chain, cutKeys)) {
        const p = chain[0];
        const axisId = (p.key as { axisId: string }).axisId;
        cmps.push((a, b) => {
            const ga = cutGroupIdx(a, axisId, cutKeys), gb = cutGroupIdx(b, axisId, cutKeys);
            if (ga == null) return gb == null ? 0 : 1;
            if (gb == null) return -1;
            return (ga - gb) * p.dir;
        });
        for (const s of chain.slice(1)) cmps.push(stepCmp(s, ctx));
        cmps.push(stepCmp(p, ctx)); // 그룹 안 최종 폴백 = 원래 순위(2차가 없으면 이게 곧 컷 없는 정렬)
    } else {
        for (const s of chain) cmps.push(stepCmp(s, ctx));
    }
    for (const f of FALLBACK) if (!chain.some((s) => sameSortKey(s.key, f.key))) cmps.push(stepCmp(f, ctx));
    return cmps;
}

/** 체인(+컷)으로 정렬한 새 배열. */
export function sortSheetRows(rows: SheetRow[], chain: SortChain, ctx: SortCtx, cutKeys: number[] = []): SheetRow[] {
    const cmps = chainCmps(chain, ctx, cutKeys);
    return [...rows].sort((a, b) => {
        for (const c of cmps) { const v = c(a, b); if (v !== 0) return v; }
        return 0;
    });
}

// ── 그룹 ────────────────────────────────────────────────────────────────────
/** 값이 몇 가지뿐이라 정렬만 해도 덩어리가 생기는 열 — 여기만 그룹 헤더가 저절로 붙는다. */
const DISCRETE: ReadonlySet<SortKind> = new Set<SortKind>(["date", "outcome"]);
export const isDiscreteKey = (k: SortKey): boolean => DISCRETE.has(k.kind);

/** 그린 순서 그대로의 한 덩어리. label=null 이면 헤더 없는 통짜(그룹 안 걸린 정렬). */
export interface SheetGroup { id: string; label: string | null; rows: SheetRow[] }

function discreteLabel(k: SortKey, v: string | number | null): string {
    if (v == null) return k.kind === "outcome" ? "결과 없음" : "값 없음";
    if (k.kind === "date") return String(v).replace(/-/g, ".");
    return String(v);
}
/** 컷 그룹 라벨 — 그 덩어리가 차지한 순위 범위. 미배치 덩어리는 이름 그대로. */
function cutLabel(rows: SheetRow[], axisId: string): string {
    const ranks = rows.map((r) => r.cells[axisId]?.rank).filter((n): n is number => n != null);
    if (ranks.length === 0) return "미배치";
    const lo = Math.min(...ranks), hi = Math.max(...ranks);
    return lo === hi ? `${lo}위` : `${lo}~${hi}위`;
}

/**
 * 정렬된 행 → 그룹. 1차 키에서만 접는다(컷 > 이산 열 > 안 접음).
 * 이미 정렬돼 있어 같은 그룹이 붙어 있으므로 한 번 훑으며 끊기만 하면 된다.
 */
export function buildSheetGroups(sorted: SheetRow[], chain: SortChain, ctx: SortCtx, cutKeys: number[] = []): SheetGroup[] {
    const p = chain[0];
    const cut = cutsActive(chain, cutKeys);
    if (!p || (!cut && !isDiscreteKey(p.key))) return [{ id: "all", label: null, rows: sorted }];
    const axisId = cut ? (p.key as { axisId: string }).axisId : "";
    const idOf = (row: SheetRow): string =>
        cut ? `g${cutGroupIdx(row, axisId, cutKeys) ?? "un"}` : `v${sortValueOf(p.key, row, ctx) ?? ""}`;

    const out: SheetGroup[] = [];
    for (const row of sorted) {
        const id = idOf(row);
        if (out.length && out[out.length - 1].id === id) out[out.length - 1].rows.push(row);
        else out.push({ id, label: "", rows: [row] });
    }
    for (const g of out) g.label = cut ? cutLabel(g.rows, axisId) : discreteLabel(p.key, sortValueOf(p.key, g.rows[0], ctx));
    return out;
}
