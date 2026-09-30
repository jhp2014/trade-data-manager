// 사슬 필터 — 「돌파」 생성기의 **② 필터 층**(2026-09-24, decisions 「Daily 타점 생성 = 돌파 사슬」).
//
// ① 격자(밴드·zigzag)가 세운 사슬 봉들(`ChainBar`) 위에 거는 **식**이다. 생성소와 같은 문법 — 봉 조건 칩
// 사이 AND/OR, 한 겹 괄호, NOT — 이고 구조 규칙은 core `flatExpr` 한 벌을 그대로 쓴다.
//
// ## 순번은 수식어다 — 칩·괄호·식 전체
// 「처음 K개」는 **붙은 자리**가 곧 뜻이다:
//   · 조건 칩 `대금≥50억 · 처음 1`      = 그 사슬의 **첫 50억 봉**(다른 조건과 무관하게 센다)
//   · 괄호 `(대금≥50억 AND 양봉) · 처음 1` = 둘 다인 **첫 봉**
//   · 식 전체(꼬리)                     = 식을 통과한 봉 중 처음 K개(기본 처음 1 — 옛 저장물도 그대로)
// 순번은 그 봉 **이전 봉만** 센다(사슬마다 새로) — 어디에 붙여도 미래를 안 본다.
// 한 칩·괄호 안에서 순번이 먼저, NOT 이 나중이다 — `NOT(대금≥50억 · 처음 1)` = "첫 50억 봉만 뺀 나머지".
//
// ## 순번 있는 항은 단락하지 않는다
// AND/OR 를 무턱대고 단락하면 뒤 칩의 순번 셈이 봉마다 들쭉날쭉 건너뛰어진다 — 칩의 순번은 **그 칩 조건이 참인
// 모든 봉**을 세야 뜻이 선다. 그래서 **순번이 든 항(그 아래 어디든 firstK)은 늘 평가한다**. 순번 없는 항은
// 부작용이 없으니 결과가 정해진 뒤엔 건너뛰고, 테마 칩(분 단면 — 비싸다)이 든 항은 맨 뒤에 본다(2026-09-30 —
// 「대금≥50억 AND 테마」에서 대금 탈락 봉은 테마를 안 부른다). 결과는 전부 평가한 것과 같다.
//
// ## 테마 칩 — 조건판 테마와 한 벌(2026-09-30)
// 칩 = 테마 술어 payload 통째(`{ kind: "theme" } & ThemeZoneParams`) — 파서·판정·편집면이 조건판 테마와 같다.
// 판정은 주입 재료(`ChainMaterials.themeAt` — 엔진의 CellMaterials.themeAt 을 종목으로 묶은 것)가 한다. 컷이
// 하나도 안 켜진 칩은 재료 없이 참(빈 술어 = 조건 아님). 재료가 없거나 한 번이라도 모름(null)이면 **그 종목 사슬
// 판정 전체가 모름**(null) — 거짓으로 치면 `NOT 테마` 가 "전부 통과"라고 거짓말한다.
//
// ## 생성소의 조건과의 경계
// 차이는 하나 — **순번 셈에 드는가**. 순번은 이 식의 칩·괄호가 가르고, 생성소의 조건은 순번이 정해진 뒤에 거른다.
// 봉 순번·세션 고가 돌파·이름표는 사슬 문맥이 있어야 서므로 여기에만 있다.
// 「시각」은 생성소에도 있지만 **뜻이 다르다**(2026-09-27): 여기서 `NOT 시각 09:00~09:02` 는 그 봉을 **줄 서기에서
// 뺀다** — 09:03 이후 첫 봉이 「처음 1」이 된다. 생성소의 시각은 처음 1 을 뽑은 **뒤에** 거르므로 자리가 비어 버린다.
// 뺀 봉도 사슬의 일부다 — 고가·밴드·봉 순번(`pos`)은 그대로 센다(사슬을 다시 세우는 안은 기각).
import {
    foldFlat,
    isFoldedFlat,
    normalizeFlat,
    parseGroups,
    parseOp,
    rebuildFlat,
    xorNeg,
    type FlatExpr,
    type FlatGroup,
    type FoldedFlat,
    type Op,
} from "../expr/flatExpr.js";
import { minuteOfDayOf } from "../replay/dayReplay.js";
import type { BreakoutLabel, ChainBar, ChainSeries } from "./breakoutChain.js";
import { anyThemeCondOn, parseThemeZoneParams, themeZoneKeyOf, type ThemeAnswer, type ThemeZoneParams } from "./themeZone.js";

/** 양끝 포함 구간 — 한쪽이 없으면 반열림. */
export interface ChainRange {
    min?: number;
    max?: number;
}

/** "HH:MM" 양끝 포함 — 생성소 시각 조건(CellTimeRange)과 같은 모양. */
export interface ChainTimeRange {
    from: string;
    to: string;
}

/** 사슬 필터가 보는 시계열 — 사슬 재료 + 봉 시각(unix초, 「시각」 조건의 재료). */
export type ChainFilterSeries = ChainSeries & { times: readonly number[] };

/** 봉 조건 하나 — 전부 **그 봉까지의 값**(미래 누출 없음). 아니다는 NOT 으로 건다. */
export type ChainCond =
    /** 사슬 안 봉 순번(봉 수, 첫 봉 = 0). */
    | ({ kind: "pos" } & ChainRange)
    /** 봉 대금 ≥ N억. */
    | { kind: "amount"; minEok: number }
    /** 시가→고가 %(가격 비). */
    | ({ kind: "openHigh" } & ChainRange)
    /** 시가→종가 %(가격 비 — 양봉 = 0 초과). */
    | ({ kind: "openClose" } & ChainRange)
    /** 고가 ≥ 직전까지 세션 최고가(터치 포함). */
    | { kind: "sessionHigh" }
    /** 그 봉 시점 이름표. */
    | { kind: "label"; label: BreakoutLabel }
    /** 그 봉 시각이 구간 중 하나에 든다(구간끼리 OR). 주 용도는 NOT — 「그 시간대 봉은 줄 서기에서 뺀다」. */
    | { kind: "time"; ranges: ChainTimeRange[] }
    /** 그 봉 분의 테마 존 판정 — 조건판 테마 술어와 같은 payload·같은 판정(themeAnswerAt). */
    | ({ kind: "theme" } & ThemeZoneParams);
export type ChainCondKind = ChainCond["kind"];
export type ChainThemeCond = Extract<ChainCond, { kind: "theme" }>;
export const CHAIN_COND_KINDS: readonly ChainCondKind[] = ["pos", "amount", "openHigh", "openClose", "sessionHigh", "label", "time", "theme"];

/** 사슬 필터의 주입 재료 — 종목은 호출자가 묶는다. 부재 = 재료 없음. */
export interface ChainMaterials {
    /** 테마 칩의 답(그 분 · 그 칩 파라미터). null = 재료 없음(모름). */
    themeAt?: (min: number, p: ThemeZoneParams) => ThemeAnswer | null;
}

/** 켜진 컷이 있는 테마 칩이 식에 있나 — 재료 게이트(테마 재료 대기)의 기준. */
export function chainUsesTheme(f: ChainFilter): boolean {
    return f.expr.of.some((t) => t.cond.kind === "theme" && anyThemeCondOn(t.cond));
}

/** 식의 항 — 봉 조건 칩 하나. `kind` 는 접힌 묶음(and/or)과 겹치지 않는다. */
export interface ChainTerm {
    kind: "check";
    /** 항 주소 — 편집면·순번 셈의 키. 식 안에서 유일. */
    id: string;
    cond: ChainCond;
    neg?: boolean;
    /** 칩 순번 — 이 조건이 참인 봉 중 사슬 안 처음 K개. 부재 = 전부. */
    firstK?: number;
}

export type ChainExpr = FlatExpr<ChainTerm>;

export interface ChainFilter {
    expr: ChainExpr;
    /** 식 전체 순번(꼬리) — 식을 통과한 봉 중 사슬마다 처음 K개. null = 전부. */
    firstK: number | null;
}

export const CHAIN_FIRST_K_MAX = 999;
export const EMPTY_CHAIN_EXPR: ChainExpr = { id: "chain", of: [], ops: [], groups: [] };
/** 기본 = 사슬마다 첫 봉(조건 없음 + 꼬리 처음 1). 사슬 필터가 없는 옛 저장물도 이 값으로 읽는다. */
export const DEFAULT_CHAIN_FILTER: ChainFilter = { expr: EMPTY_CHAIN_EXPR, firstK: 1 };

/**
 * 한 항으로 줄어든 괄호의 수식어를 그 항에 싣는다 — NOT 은 XOR, 순번은:
 *  · 항에 NOT 이 없으면 min(항 K, 괄호 K) — `처음 a개 중 처음 b개` = 처음 min(a,b)개(정확).
 *  · 항에 NOT 이 있으면 NOT 과 순번의 순서가 뒤집혀 한 항으로 못 적는다 — 그런 삭제는 화면이 막는다
 *    (`canRemoveChainTerm`). 여기까지 오면(깨진 저장물) 괄호 순번을 버린다.
 */
export function absorbChainGroup(t: ChainTerm, g: FlatGroup): ChainTerm {
    let out: ChainTerm = t;
    if (g.firstK !== undefined && t.neg !== true) {
        const k = t.firstK === undefined ? g.firstK : Math.min(t.firstK, g.firstK);
        out = { ...out, firstK: k };
    }
    return xorNeg(out, g.neg === true);
}

/** 이 항을 빼도 되나 — 순번 붙은 두 항짜리 괄호에서 남는 항이 NOT 이면 순번이 갈 곳이 없다. */
export function canRemoveChainTerm(e: ChainExpr, id: string): boolean {
    const i = e.of.findIndex((t) => t.id === id);
    if (i < 0) return false;
    const g = e.groups.find((x) => x.from <= i && i <= x.to);
    if (!g || g.firstK === undefined || g.to - g.from !== 1) return true;
    const other = e.of[i === g.from ? g.to : g.from]!;
    return other.neg !== true;
}

// ── 판정 ──────────────────────────────────────────────────────────────────

const inRange = (v: number, r: ChainRange): boolean =>
    (r.min === undefined || v >= r.min - 1e-9) && (r.max === undefined || v <= r.max + 1e-9);
const lv = (pct: number): number => 1 + pct / 100;
/** a% → b% 의 가격 비 변화(%) — 둘 다 기준가 대비 % 라 차가 아니라 비로 잰다. */
export const movePct = (a: number, b: number): number => (lv(b) / lv(a) - 1) * 100;

/** "HH:MM" → 자정부터의 분. */
const hmMin = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** 봉 조건 하나 — 순번·NOT 없는 맨 조건. 테마 칩은 재료가 있어야 서므로 null(모름)을 낼 수 있다. */
export function chainCondHolds(c: ChainCond, b: ChainBar, s: ChainFilterSeries, mat?: ChainMaterials): boolean | null {
    switch (c.kind) {
        case "pos": return inRange(b.pos, c);
        case "amount": return b.tv >= c.minEok * 1e8;
        case "openHigh": return inRange(movePct(s.minuteOpen[b.i], s.minuteHigh[b.i]), c);
        case "openClose": return inRange(movePct(s.minuteOpen[b.i], s.rate[b.i]), c);
        case "sessionHigh": return b.sessionHigh;
        case "label": return b.label === c.label;
        case "time": {
            const m = minuteOfDayOf(s.times[b.i]);
            return c.ranges.some((r) => m >= hmMin(r.from) && m <= hmMin(r.to));
        }
        case "theme": {
            // 빈 술어 = 조건 아님 — 재료도 안 부른다(enter 만 켠 칩이 영원히 거짓인 함정도 피한다).
            if (!anyThemeCondOn(c)) return true;
            const ans = mat?.themeAt?.(minuteOfDayOf(s.times[b.i]), c) ?? null;
            return ans === null ? null : ans.pass;
        }
    }
}

/** 사슬 봉 하나의 판정 — 식 통과 여부 · 꼬리 순번(통과 봉만) · 최종 후보 여부. */
export interface ChainVerdict {
    bar: ChainBar;
    pass: boolean;
    /** 식을 통과한 봉 중 사슬 안 순서(0부터) — 떨어졌으면 null. */
    rank: number | null;
    picked: boolean;
}

type ChainNode = ChainTerm | FoldedFlat<ChainTerm>;

/**
 * 사슬 봉 전부의 판정 — 순번 셈은 사슬마다 새로. 셀 엔진(picked)·기본 차트 사슬 층이 같은 이 함수를 쓴다.
 * **null = 모름**(테마 칩의 재료가 없거나 한 번이라도 모름) — 그 종목 사슬 판정 전체를 말할 수 없다.
 */
export function chainVerdicts(bars: readonly ChainBar[], s: ChainFilterSeries, f: ChainFilter, mat?: ChainMaterials): ChainVerdict[] | null {
    if (chainUsesTheme(f) && mat?.themeAt === undefined) return null;
    const tree = foldFlat(f.expr);
    const empty = f.expr.of.length === 0;
    const counts = new Map<string, number>();
    let unknown = false;
    // 항의 성질(식당 한 번) — 순번이 든 항(늘 평가) · 켜진 테마 칩이 든 항(맨 뒤).
    const rankedOf = new Map<ChainNode, boolean>();
    const themedOf = new Map<ChainNode, boolean>();
    const hasRanked = (x: ChainNode): boolean => {
        let v = rankedOf.get(x);
        if (v === undefined) {
            v = x.firstK !== undefined || (isFoldedFlat(x) && x.of.some(hasRanked));
            rankedOf.set(x, v);
        }
        return v;
    };
    const hasTheme = (x: ChainNode): boolean => {
        let v = themedOf.get(x);
        if (v === undefined) {
            v = isFoldedFlat(x) ? x.of.some(hasTheme) : x.cond.kind === "theme" && anyThemeCondOn(x.cond);
            themedOf.set(x, v);
        }
        return v;
    };
    /** 순번 수식어 — 참인 봉을 세어 처음 K개만 참으로. */
    const ranked = (id: string, v: boolean, k: number | undefined): boolean => {
        if (k === undefined || !v) return v;
        const c = counts.get(id) ?? 0;
        counts.set(id, c + 1);
        return c < k;
    };
    const ev = (x: ChainNode, b: ChainBar): boolean => {
        if (isFoldedFlat(x)) {
            // 순번 든 항은 늘 → 나머지는 결과가 안 정해졌을 때만, 테마 없는 것 먼저(부작용 없는 항은 건너뛰어도 뜻 불변).
            const and = x.kind === "and";
            let acc = and;
            const take = (y: ChainNode): void => {
                const v = ev(y, b);
                acc = and ? acc && v : acc || v;
            };
            const decided = (): boolean => (and ? !acc : acc);
            for (const y of x.of) if (hasRanked(y)) take(y);
            for (const y of x.of) if (!hasRanked(y) && !hasTheme(y) && !decided()) take(y);
            for (const y of x.of) if (!hasRanked(y) && hasTheme(y) && !decided()) take(y);
            const r = ranked(x.id, acc, x.firstK);
            return x.neg === true ? !r : r;
        }
        const h = chainCondHolds(x.cond, b, s, mat);
        if (h === null) unknown = true;
        const r = ranked(x.id, h === true, x.firstK);
        return x.neg === true ? !r : r;
    };
    const out: ChainVerdict[] = [];
    let chain = -1;
    let rank = 0;
    for (const bar of bars) {
        if (bar.chain !== chain) {
            chain = bar.chain;
            rank = 0;
            counts.clear();
        }
        const pass = empty || ev(tree, bar);
        if (unknown) return null;
        const r = pass ? rank++ : null;
        out.push({ bar, pass, rank: r, picked: r !== null && (f.firstK === null || r < f.firstK) });
    }
    return out;
}

/** 후보(최종 통과 봉)만 — null = 모름(chainVerdicts). */
export function chainCandidatesOf(bars: readonly ChainBar[], s: ChainFilterSeries, f: ChainFilter, mat?: ChainMaterials): ChainBar[] | null {
    const vs = chainVerdicts(bars, s, f, mat);
    if (vs === null) return null;
    const out: ChainBar[] = [];
    for (const v of vs) if (v.picked) out.push(v.bar);
    return out;
}

// ── 키 · 파서 ─────────────────────────────────────────────────────────────

/** 판정 키 — 항 id 는 뜻이 없어 빼고 모양만(엔진 후보 메모의 단위). */
export function chainFilterKey(f: ChainFilter): string {
    return JSON.stringify([
        // 테마 칩은 파라미터 키로 — 필드 순서만 다른 같은 칩이 메모를 가르지 않게.
        f.expr.of.map((t) => [t.cond.kind === "theme" ? themeZoneKeyOf(t.cond) : t.cond, t.neg === true ? 1 : 0, t.firstK ?? 0]),
        f.expr.ops,
        f.expr.groups.map((g) => [g.from, g.to, g.neg === true ? 1 : 0, g.firstK ?? 0]),
        f.firstK,
    ]);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const parseK = (v: unknown): number | undefined =>
    finite(v) && v >= 1 ? Math.min(CHAIN_FIRST_K_MAX, Math.floor(v)) : undefined;

/** 구간 — 양끝이 다 없으면 조건 없음(null). `int` 면 0 이상 정수(봉 순번). */
function parseRange(raw: Record<string, unknown>, int = false): ChainRange | null {
    const fix = (v: unknown): number | undefined => (finite(v) ? (int ? Math.max(0, Math.floor(v)) : v) : undefined);
    const min = fix(raw.min);
    const max = fix(raw.max);
    if (min === undefined && max === undefined) return null;
    const r: ChainRange = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    // 하한 > 상한은 뒤집어 받는다(그대로 두면 조용히 전부 탈락).
    if (r.min !== undefined && r.max !== undefined && r.min > r.max) return { min: r.max, max: r.min };
    return r;
}

/** 봉 조건 하나 — 모양이 안 맞으면 null(그 항만 떨어진다). */
export function parseChainCond(raw: unknown): ChainCond | null {
    if (!isObj(raw)) return null;
    switch (raw.kind) {
        case "pos": { const r = parseRange(raw, true); return r ? { kind: "pos", ...r } : null; }
        case "openHigh": { const r = parseRange(raw); return r ? { kind: "openHigh", ...r } : null; }
        case "openClose": { const r = parseRange(raw); return r ? { kind: "openClose", ...r } : null; }
        case "amount": return finite(raw.minEok) && raw.minEok > 0 ? { kind: "amount", minEok: raw.minEok } : null;
        case "sessionHigh": return { kind: "sessionHigh" };
        case "label": return raw.label === "baseline" || raw.label === "high" ? { kind: "label", label: raw.label } : null;
        case "time": {
            // 못 읽는 구간만 떨어진다 · 뒤집힌 구간은 뒤집어 받는다 · 구간이 하나도 없으면 조건이 아니다.
            if (!Array.isArray(raw.ranges)) return null;
            const ranges: ChainTimeRange[] = [];
            for (const r of raw.ranges) {
                if (!isObj(r) || typeof r.from !== "string" || typeof r.to !== "string" || !HM.test(r.from) || !HM.test(r.to)) continue;
                ranges.push(r.from <= r.to ? { from: r.from, to: r.to } : { from: r.to, to: r.from });
            }
            return ranges.length > 0 ? { kind: "time", ranges } : null;
        }
        case "theme": {
            // 조건판 테마와 같은 파서 한 벌 — 테마 payload 가 바뀌면 두 자리가 같이 바뀐다.
            const p = parseThemeZoneParams(raw);
            return p === null ? null : { kind: "theme", ...p };
        }
        default: return null;
    }
}

let termSeq = 0;
/** 새 항 id — 식 안에서 유일하면 된다. */
export const newChainTermId = (): string => `c${Date.now().toString(36)}${(termSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * 사슬 필터 — 항 단위로 관대하다(못 읽는 항만 떨어지고 연산자·괄호는 원래 자리로 되짚는다).
 * `legacyLabel` = 옛 술어의 이름표 거르기(식 이전) — 식이 없는 옛 저장물을 옮길 때만 쓴다.
 *
 * 옛 모양(식 이전, 2026-09-24 오전): `{ pos?, amountEok?, openHigh?, openClose?, sessionHigh?: "yes"|"no", firstK }`
 * + 술어 `label` → 전부 AND 로 이은 식 + 꼬리 순번. 사슬 필터가 아예 없으면 기본(처음 1).
 */
export function parseChainFilter(raw: unknown, legacyLabel: unknown = undefined): ChainFilter {
    const tailK = (r: Record<string, unknown>): number | null => (r.firstK === null ? null : parseK(r.firstK) ?? 1);
    if (isObj(raw) && isObj(raw.expr)) {
        const e = raw.expr;
        const of: ChainTerm[] = [];
        const from: number[] = [];
        const seen = new Set<string>();
        (Array.isArray(e.of) ? e.of : []).forEach((t, i) => {
            if (!isObj(t)) return;
            const cond = parseChainCond(t.cond);
            if (!cond) return;
            // 없거나 겹친 id 는 **자리로** 짓는다(결정적 — 같은 저장물을 두 번 읽어도 같은 id. 순번 셈의 키라 겹치면 안 된다).
            let id = typeof t.id === "string" && t.id !== "" ? t.id : `t${i}`;
            while (seen.has(id)) id = `${id}~${i}`;
            seen.add(id);
            const k = parseK(t.firstK);
            of.push({ kind: "check", id, cond, ...(t.neg === true ? { neg: true } : {}), ...(k !== undefined ? { firstK: k } : {}) });
            from.push(i);
        });
        const rawOps = (Array.isArray(e.ops) ? e.ops : []).map(parseOp);
        const groups = parseGroups(e.groups).map((g) => (g.firstK === undefined ? g : { ...g, firstK: Math.min(CHAIN_FIRST_K_MAX, g.firstK) }));
        const expr = rebuildFlat(typeof e.id === "string" && e.id !== "" ? e.id : EMPTY_CHAIN_EXPR.id, of, from, rawOps, groups, absorbChainGroup);
        return { expr, firstK: tailK(raw) };
    }
    // ── 옛 모양 → 식
    const terms: ChainTerm[] = [];
    const add = (cond: ChainCond, neg = false): void => { terms.push({ kind: "check", id: `m${terms.length}`, cond, ...(neg ? { neg: true } : {}) }); };
    const r = isObj(raw) ? raw : {};
    if (isObj(r.pos)) { const x = parseRange(r.pos, true); if (x) add({ kind: "pos", ...x }); }
    if (finite(r.amountEok) && r.amountEok > 0) add({ kind: "amount", minEok: r.amountEok });
    if (isObj(r.openHigh)) { const x = parseRange(r.openHigh); if (x) add({ kind: "openHigh", ...x }); }
    if (isObj(r.openClose)) { const x = parseRange(r.openClose); if (x) add({ kind: "openClose", ...x }); }
    if (r.sessionHigh === "yes" || r.sessionHigh === "no") add({ kind: "sessionHigh" }, r.sessionHigh === "no");
    if (legacyLabel === "baseline" || legacyLabel === "high") add({ kind: "label", label: legacyLabel });
    const expr = normalizeFlat<ChainTerm>({ id: EMPTY_CHAIN_EXPR.id, of: terms, ops: terms.slice(1).map((): Op => "and"), groups: [] });
    return { expr, firstK: isObj(raw) ? tailK(raw) : 1 };
}
