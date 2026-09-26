// 셀 평가 엔진 — 하루의 모든 (종목,분) 셀에 조건 묶음을 물려 발화 셀을 뽑는다.
// 어휘·비용 등급은 predicate.ts, 규칙 전문은 .claude/decisions.md 「집합 = (낟알, 우주, 조건)」.
//
// ## 셀 = dense 분 타임라인의 샘플이다
// 우주의 정의가 여기 있다. 타임라인 밖 좌표(옛 격자 합류가 "있을 일 없지만 정직하게" 값 결손으로
// 싣던 것)는 **셀이 아니다** — 우주를 예외 하나로 흐리면 결손 지도가 첫 줄부터 애매해진다.
//
// ## 비용은 단락이 정한다 — 싼 술어부터, 비싼 재료는 통과한 셀에서만
// 술어를 비용 등급(costTierOf) 오름차순으로 AND 단락한다. tier 2(존 순위 = 분 단면)는 tier ≤1 을
// 전부 통과한 셀에서만 호출된다. 19만 셀 × tier 0 술어는 ms 급이다.
//
// ⚠ **단락이 줄이는 건 "셀당 재료 호출"이지 존 순위의 지배 비용이 아니다.**
// 분 단면은 **분당 한 번** 캐시되므로(cellMaterials.ranksAt), 그 분에 재료를 묻는 셀이 하나라도 있으면
// 그 분의 단면(유니버스 정렬)이 굽힌다 — 즉 지배 비용은 셀 수가 아니라 **분 수**다.
//
// 실측(2026-09-22 · 날짜 3개 · Node·브라우저 양쪽, 20~24만 셀 · 720분):
//   · 분 단면 720개 전량 선굽기      = 219~303ms   ← 지배 비용
//   · tier 0 술어만(등락률)          =  80~147ms
//   · 존순위 단독(하한 0, 최악)      = **240~473ms**
// 하한을 올려도(싼 앞항 추가) 거의 안 줄어든다 — 종목을 걸러도 분은 안 줄기 때문이다.
// ⚠ 옛 주석의 「5.76초」는 **재현되지 않았다**(2026-09-22). 귀속(분 단면)은 맞았고 크기만 틀렸다 —
//   그 수를 근거로 「계산」 관문을 세웠다가 실측으로 철회했다(decisions 「모드가 작업면을 가른다」).
//   실제로 싸게 하려면 **분을 줄이는 조건**(시각 창)이거나 단면을 미리 굽는 쪽이다.
//
// ## 상한은 **산출물 상한**이지 평가 중단이 아니다
// 전량 평가해 matched 를 끝까지 세고, 정렬(분↑ → 코드↑) 뒤 앞에서 자른다. 평가 중에 멈추면
// "코드 오름차순 앞 종목만 남는" 편향이 생긴다. 평가를 실제로 멈추는 건 HARD_CAP 그물 하나뿐이다
// (조건이 사실상 전부일 때 19만 셀 × 분 단면 = 프리즈를 막는 2차 방어선. 1차는 "조건 없음 = 안 보여줌").
import { minuteOfDayOf, type MinuteDerived } from "../replay/dayReplay.js";
import { breakoutOfStock, type BreakoutChainResult } from "./breakoutChain.js";
import { chainCandidatesOf } from "./chainFilter.js";
import {
    CELL_VALUE_FIELDS,
    breakoutKeyOf,
    breakoutStructKeyOf,
    costTierOf,
    exprOfCellConditions,
    pruneCellExpr,
    unknownCellPredicate,
    type CellConditions,
    type CellExpr,
    type CellPredicate,
    type CellValueField,
    type CellValueRange,
    type Transition,
} from "./predicate.js";
import { themeZoneKeyOf, type ThemeAnswer, type ThemeZoneParams } from "./themeZone.js";

/** 입력 종목 — 쓰는 필드만 Pick(probe·rankSection 과 같은 수법: 와이어 ReplayStock 이 그대로 들어온다). */
export type CellStock = Pick<
    MinuteDerived,
    "code" | "times" | "rate" | "cumAmount" | "minuteOpen" | "minuteHigh" | "minuteLow" | "trailingHighs" | "basePrice"
>;

/** 주입 재료 — 기존 단일 출처의 어댑터. 계산 규칙을 여기로 들이지 말 것(서수 출처 단일화 불변식). */
export interface CellMaterials {
    /** 격자 파생 Point 의 시각(분) 목록 — 없으면 빈 배열. (클라: useAutoPoints/defDerived) */
    gridMinutesOf(code: string): readonly number[];
    /**
     * 테마 술어의 답(판정 + 존 순위 best) — 파라미터가 payload 라 술어마다 다르다. null = 재료 없음(모름 →
     * 미발화). ⚠ 단락 뒤에만 불린다. (클라: sectionSeries.themeSectionAt + themeZone.themeAnswerOf)
     */
    themeAt(code: string, min: number, p: ThemeZoneParams): ThemeAnswer | null;
    /**
     * 그 종목·그날의 확정 기준선(그 날 원주가 스케일) — 없으면 null(돌파 사슬의 기준선 밴드가 없다 →
     * 이름표가 전부 「고가 돌파」). 옵셔널: 안 쓰는 호출자(probe 등가·기존 테스트)는 부재 = 없음.
     */
    baselineOf?(code: string): number | null;
}

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

/** 발화 셀 하나 — 시각(자정기준 분) + 발화한 **조건 id** + 그 분의 표시값. 결손은 null(지어내지 않는다). */
export interface CellHit {
    code: string;
    min: number;
    /** 이 셀을 발화시킨 조건 id 들(칸이 곧 로직) — 선언 순서. */
    tags: string[];
    ratePct: number | null;
    cumAmount: number | null;
    /** 존 순위 술어가 든 조건이 발화했을 때의 순위/테마(다중 테마는 best=min). 아니면 null. */
    zoneRank: number | null;
    zoneTheme: string | null;
}

export interface CellEvalResult {
    /** 정렬·상한 적용 뒤의 목록 — **순회도 렌더도 이 배열 하나만 본다**(두 벌이면 커서가 없는 행으로 간다). */
    hits: CellHit[];
    /** 상한 전 **걸린 셀 수**(조건이 여럿 걸린 셀도 하나로 센다 — 목록 행 수와 같은 단위).
     *  tooWide 면 "확인된 최소치"다(평가를 중단했으므로).
     *  ⚠ 칸별 발화 수(byCondition)의 합과 다르다 — 그쪽은 (조건,셀) 쌍이라 겹치는 셀만큼 크다.
     *  화면의 "조건 N건"·꼬리 안내·HARD_CAP 은 **전부 이 셀 수**를 쓴다(단위가 섞이면 숫자가 거짓말한다). */
    matched: number;
    limit: number;
    truncated: boolean;
    /** HARD_CAP 도달 — 조건이 너무 넓다(목록 대신 그 사실을 말해야 한다). */
    tooWide: boolean;
    /** 조건 id → 그 조건이 발화시킨 셀 수(상한 전). 칸이 곧 로직이라는 모델의 화면 증거. */
    byCondition: Map<string, number>;
}

export interface CellEvalOptions {
    /** 산출물 상한(기본 2,000) — 정렬 뒤 앞에서 자른다. */
    limit?: number;
    /**
     * 자르는 **단위**(기본 `"cell"`). 섹션(종목 머리 + 자식) 화면은 반드시 `"stockGroup"` 이어야 한다:
     * 시각 프리픽스로 자르면 한 종목이 반토막 나서 **머리의 `◇ n` 이 거짓말**을 한다.
     * 상한이 산출물 상한(전량 평가 후 컷)이라 남은 종목의 수는 어느 단위로 잘라도 정확하다.
     */
    limitBy?: "cell" | "stockGroup";
    /** 평가 중단 그물(기본 50,000 **셀**) — 넘으면 즉시 반환하고 tooWide. */
    hardCap?: number;
}

export const CELL_LIMIT = 2000;
export const CELL_HARD_CAP = 50_000;

const KRW_PER_EOK = 100_000_000;

/** 조건 하나의 종목별 전이 상태 — 술어 슬롯마다 하나 + 칸 하나. 종목 루프 안에서만 산다(하루 경계와 같은 이유). */
interface TransitionState {
    /** 직전 셀에서 참이었나(단락으로 건너뛴 셀·결손은 **미참으로 되돌린다** — 모르는 것을 참으로 세지 않는다). */
    prevTrue: boolean;
    /** 직전 셀의 밑값(improve 용). 미참이면 뜻이 없다. */
    prevValue: number | null;
    /** firstOfDay 용 — 하루 1회. */
    fired: boolean;
}

const newState = (): TransitionState => ({ prevTrue: false, prevValue: null, fired: false });

/** 전이 적용 — 참/거짓과 상태 갱신을 한 자리에서. value 는 improve 의 밑값(없으면 엣지로 동작). */
function applyTransition(t: Transition | undefined, st: TransitionState, raw: boolean, value: number | null, improveUp: boolean): boolean {
    if (t === undefined) {
        st.prevTrue = raw;
        st.prevValue = raw ? value : null;
        return raw;
    }
    let out = false;
    if (raw) {
        if (t === "firstOfDay") out = !st.fired;
        else if (t === "firstTrue") out = !st.prevTrue;
        else {
            // improve = 직전 미참(결손·미관찰·존 밖 포함) ∨ 밑값 개선. "직전 미참"을 포함하는 것이
            // 존 재진입 재발화(옛 prevZoneRank === null)의 등가 조건이다. 밑값이 없으면 엣지와 같다.
            if (!st.prevTrue || st.prevValue === null || value === null) out = !st.prevTrue;
            else out = improveUp ? value > st.prevValue : value < st.prevValue;
        }
        if (out && t === "firstOfDay") st.fired = true;
    }
    st.prevTrue = raw;
    st.prevValue = raw ? value : null;
    return out;
}

/** 종목 하나의 사전계산(tier 1) — 창별 전고 자와 격자 분 집합. 조건이 안 쓰면 만들지 않는다. */
interface StockPrecomputed {
    priorHighOf(days: number): number | null;
    gridMinutes: ReadonlySet<number> | null;
    /** 돌파 후보 키 → 후보 분(자정기준). */
    breakouts: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * 돌파 후보 분 — 사슬은 구조 키(zigzag·밴드)마다 종목당 한 번만 세우고(`chains` 메모), 사슬 필터는 그 위에서
 * 고른다. 기준선은 분봉과 같은 반올림의 % 로 옮긴다(`breakoutOfStock` 안).
 */
function breakoutMinutes(
    p: BreakoutPred,
    s: CellStock,
    mat: CellMaterials,
    chains: Map<string, BreakoutChainResult>,
): ReadonlySet<number> {
    const sk = breakoutStructKeyOf(p);
    let r = chains.get(sk);
    if (r === undefined) {
        r = breakoutOfStock(s, mat.baselineOf?.(s.code) ?? null, { zigzagPct: p.zigzagPct, bandPct: p.bandPct });
        chains.set(sk, r);
    }
    const out = new Set<number>();
    for (const b of chainCandidatesOf(r.bars, s, p.chain)) out.add(minuteOfDayOf(s.times[b.i]));
    return out;
}

function precompute(
    s: CellStock,
    mat: CellMaterials,
    needDays: readonly number[],
    needGrid: boolean,
    needBreakout: ReadonlyMap<string, BreakoutPred>,
): StockPrecomputed {
    const highs = new Map<number, number | null>();
    for (const days of needDays) {
        // ⚠ index 0 = **당일** 전체 고가라 반드시 1부터 자른다(포함하면 영영 거짓 — probe 테스트가 지키던 규칙).
        const w = s.trailingHighs.un.slice(1, Math.max(1, Math.floor(days)) + 1);
        highs.set(days, w.length > 0 ? Math.max(...w) : null); // 창이 비면 결손(신규 상장 등)
    }
    const breakouts = new Map<string, ReadonlySet<number>>();
    const chains = new Map<string, BreakoutChainResult>();
    for (const [key, p] of needBreakout) breakouts.set(key, breakoutMinutes(p, s, mat, chains));
    return {
        priorHighOf: (days) => highs.get(days) ?? null,
        gridMinutes: needGrid ? new Set(mat.gridMinutesOf(s.code)) : null,
        breakouts,
    };
}

/** 셀의 값 — cellValue 술어의 밑값(전부 셀 배열 O(1)). */
function valueOf(field: CellValueField, s: CellStock, i: number): number | null {
    switch (field) {
        case "ratePct":
            return s.rate[i] ?? null;
        case "cumAmountEok":
            return (s.cumAmount[i] ?? 0) / KRW_PER_EOK;
        case "minuteAmountEok":
            return ((s.cumAmount[i] ?? 0) - (i > 0 ? (s.cumAmount[i - 1] ?? 0) : 0)) / KRW_PER_EOK;
        case "minuteHighPct":
            return s.minuteHigh[i] ?? null;
    }
}

/** 구간 판정 — 종단 axisValue 와 같은 규칙(OR, 양끝 포함, 뒤집힌 구간은 스왑, point 경계는 결손). */
function inRanges(v: number, ranges: readonly CellValueRange[]): boolean {
    for (const r of ranges) {
        if (!r.from && !r.to) continue;
        if (r.from && r.from.kind !== "value") continue; // 타점 앵커 경계 = 하루 우주에선 결손
        if (r.to && r.to.kind !== "value") continue;
        const lo = r.from && r.from.kind === "value" ? r.from.value : -Infinity;
        const hi = r.to && r.to.kind === "value" ? r.to.value : Infinity;
        const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
        if (v >= a && v <= b) return true;
    }
    return false;
}

const hm = (min: number): string => {
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
};

/**
 * 종목 그룹째 자르기 — 상한을 넘는 **마지막 종목은 통째로** 뺀다(반토막 금지).
 * 정렬은 분↑ 이라 한 종목의 셀이 흩어져 있다 — 그래서 "앞에서 N개"가 아니라 **남길 종목 집합**을 정한다:
 * 이른 분부터 종목을 등록해 가다가 상한을 넘기는 순간 그 종목은 빼고, 이미 등록된 종목의 셀만 남긴다.
 * 그러면 남은 종목의 건수가 화면 머리(`◇ n`)와 정확히 일치한다.
 */
function cutByStockGroup(sorted: readonly CellHit[], limit: number): CellHit[] {
    const perCode = new Map<string, number>();
    for (const h of sorted) perCode.set(h.code, (perCode.get(h.code) ?? 0) + 1);
    const keep = new Set<string>();
    let total = 0;
    for (const h of sorted) {
        if (keep.has(h.code)) continue;
        const n = perCode.get(h.code) ?? 0;
        if (total + n > limit) continue; // 이 종목은 통째로 뺀다 — 뒤에 더 작은 종목이 있으면 그건 든다
        keep.add(h.code);
        total += n;
    }
    return sorted.filter((h) => keep.has(h.code));
}

/**
 * 하루의 발화 셀 — 종목별 dense 타임라인 단일 패스.
 * 같은 (code,min)은 한 항목에 조건 id 가 쌓이고, 정렬은 분 오름차순 → 코드 오름차순(결정론).
 */
// ── 식 트리 평가 ───────────────────────────────────────────────────────────
//
// 컴파일 한 번(비용 정렬 + 상태 슬롯 배정) → 종목마다 상태 배열 새로, 셀마다 트리 한 번.
// 옛 2층(조건 = OR 가지 · 술어 = AND 잎)은 `exprOfCellConditions` 가 그대로 이 모양으로 올린다 —
// 그래서 기존 등가 게이트가 **이 엔진을 검증한다**(옛 경로를 따로 남겨 두 벌이 되지 않게).

interface Compiled {
    node: CellExpr;
    /** 전이 상태 슬롯 — 잎과 AND 노드만 쓰지만, 슬롯은 모든 노드에 준다(색인이 단순해진다). */
    idx: number;
    children: Compiled[];
    tier: 0 | 1 | 2;
    /** 이 AND 노드의 **직속 값 잎**이 정확히 하나면 그 자식(improve 의 밑값 자리). 아니면 null. */
    soleValueChild: Compiled | null;
    /** 돌파 잎의 판정 키 — 셀마다 문자열을 만들지 않게 컴파일 때 한 번. 그 밖은 null. */
    breakoutKey: string | null;
}

function compile(e: CellExpr, next: () => number): Compiled {
    const idx = next();
    if (e.kind === "pred") {
        const breakoutKey = e.pred.kind === "breakout" ? breakoutKeyOf(e.pred) : null;
        return { node: e, idx, children: [], tier: costTierOf(e.pred), soleValueChild: null, breakoutKey };
    }
    // 단락 순서 = 비용 오름차순. 가지의 비용은 그 안 **가장 비싼 잎**이다(싼 가지부터 봐야 비싼 재료가 늦게 불린다).
    const children = e.of.map((c) => compile(c, next)).sort((a, b) => a.tier - b.tier);
    const valueLeaves = children.filter((c) => c.node.kind === "pred" && c.node.pred.kind === "cellValue");
    return {
        node: e,
        idx,
        children,
        tier: children.reduce<0 | 1 | 2>((t, c) => (c.tier > t ? c.tier : t), 0),
        soleValueChild: e.kind === "and" && valueLeaves.length === 1 ? valueLeaves[0]! : null,
        breakoutKey: null,
    };
}

/** 건너뛴 가지의 전이 상태는 **미관찰로 되돌린다** — 안 본 것을 참으로 세지 않는다(fired 래치는 그대로). */
function resetSubtree(c: Compiled, st: TransitionState[]): void {
    const s = st[c.idx]!;
    s.prevTrue = false;
    s.prevValue = null;
    for (const ch of c.children) resetSubtree(ch, st);
}

/** 한 셀의 평가 문맥 — 재료 호출이 셀당 한 번이 되게 존 순위를 여기 캐시한다. */
interface CellCtx {
    s: CellStock;
    i: number;
    min: number;
    pre: StockPrecomputed;
    mat: CellMaterials;
    /** 테마 술어 답 캐시 — 파라미터 키별(같은 셀에서 같은 파라미터는 한 번만 계산). */
    themeAns: Map<string, ThemeAnswer | null>;
    /** 이 가지의 테마 술어가 낸 존 순위 best — 발화한 가지만 hit 에 싣는다(usedZone 과 같은 규칙). */
    themeUsed: { rank: number; theme: string } | null;
}

function runNode(c: Compiled, st: TransitionState[], ctx: CellCtx): boolean {
    const e = c.node;
    let out: boolean;

    if (e.kind === "pred") {
        const p = e.pred;
        let raw = false;
        let v: number | null = null;
        let improveUp = true;
        switch (p.kind) {
            case "cellValue": {
                v = valueOf(p.field, ctx.s, ctx.i);
                improveUp = CELL_VALUE_FIELDS[p.field].improve === "up";
                raw = v !== null && inRanges(v, p.ranges);
                break;
            }
            case "priorHighBreak": {
                const bar = ctx.pre.priorHighOf(p.days);
                raw = bar !== null && (ctx.s.minuteHigh[ctx.i] ?? -Infinity) > bar;
                break;
            }
            case "gridPoint":
                raw = ctx.pre.gridMinutes !== null && ctx.pre.gridMinutes.has(ctx.min);
                break;
            case "breakout": {
                raw = ctx.pre.breakouts.get(c.breakoutKey!)?.has(ctx.min) === true;
                break;
            }
            case "candleShape": {
                // 거래 없는 봉(시가 = 종가)은 어느 쪽도 아니다.
                const o = ctx.s.minuteOpen[ctx.i];
                const c = ctx.s.rate[ctx.i];
                raw = o !== undefined && c !== undefined && (p.shape === "bull" ? c > o : c < o);
                break;
            }
            case "time":
                raw = p.ranges.some((r) => {
                    const t = hm(ctx.min);
                    return t >= r.from && t <= r.to;
                });
                break;
            case "theme": {
                const key = themeZoneKeyOf(p);
                let ans = ctx.themeAns.get(key);
                if (ans === undefined) {
                    ans = ctx.mat.themeAt(ctx.s.code, ctx.min, p);
                    ctx.themeAns.set(key, ans);
                }
                raw = ans !== null && ans.pass;
                // improve 전이의 밑값 = 존 순위(작을수록 개선 — 방향은 종류가 안다).
                v = ans?.zoneRank ?? null;
                improveUp = false;
                if (ans !== null && ans.zoneRank !== null && ans.theme !== null
                    && (ctx.themeUsed === null || ans.zoneRank < ctx.themeUsed.rank)) {
                    ctx.themeUsed = { rank: ans.zoneRank, theme: ans.theme };
                }
                break;
            }
            default:
                unknownCellPredicate(p);
        }
        out = applyTransition(p.transition, st[c.idx]!, raw, v, improveUp);
    } else if (e.kind === "and") {
        let all = true;
        let k = 0;
        for (; k < c.children.length; k++) {
            if (!runNode(c.children[k]!, st, ctx)) { all = false; break; }
        }
        // ⚠ 단락 — 나머지 가지는 **평가하지 않는다**(비싼 재료를 안 부르는 것이 요점).
        for (let rest = k + 1; rest < c.children.length; rest++) resetSubtree(c.children[rest]!, st);
        // 묶음 전이 — 자식 AND 전체를 하나의 f 로 본다. improve 의 밑값은 **직속 값 잎이 정확히 하나일 때**
        // 그 값이고(그래야 잎 하나짜리 묶음에서 두 자리가 동치), 아니면 밑값 없이 엣지로 동작한다.
        const sole = c.soleValueChild;
        const base = sole !== null && all ? st[sole.idx]!.prevValue : null;
        const improveUp = sole !== null && sole.node.kind === "pred" && sole.node.pred.kind === "cellValue"
            ? CELL_VALUE_FIELDS[sole.node.pred.field].improve === "up"
            : true;
        out = applyTransition(e.transition, st[c.idx]!, all, base, improveUp);
    } else {
        let any = false;
        let k = 0;
        for (; k < c.children.length; k++) {
            if (runNode(c.children[k]!, st, ctx)) { any = true; break; }
        }
        for (let rest = k + 1; rest < c.children.length; rest++) resetSubtree(c.children[rest]!, st);
        out = any;
    }

    return e.neg === true ? !out : out;
}

/**
 * 하루의 발화 셀 — 종목별 dense 타임라인 단일 패스.
 * 같은 (code,min)은 한 항목에 **발화한 최상위 가지 id** 가 쌓이고, 정렬은 분↑ → 코드↑(결정론).
 * ⚠ tags 안의 가지 순서는 **선언 순서가 아니라 비용 순서**다(compile 이 children 을 tier 로 정렬한다).
 *   화면이 순서에 뜻을 주면 안 된다 — 뜻이 있는 건 "어느 가지가 발화했나"라는 집합뿐이다.
 *
 * ⚠ 루트가 OR 이면 **가지를 단락하지 않는다** — 어느 가지가 발화했는지(tags·byCondition)가 화면의
 * 재료라서다. 안쪽 OR 은 단락한다(그건 아무도 안 묻는다). 옛 엔진도 조건을 전부 돌았으므로 비용 동일.
 */
export function evaluateCellsExpr(
    stocks: readonly CellStock[],
    mat: CellMaterials,
    expr: CellExpr | null,
    opts: CellEvalOptions = {},
): CellEvalResult {
    const limit = opts.limit ?? CELL_LIMIT;
    const hardCap = opts.hardCap ?? CELL_HARD_CAP;
    const byCondition = new Map<string, number>();

    const pruned = expr === null ? null : pruneCellExpr(expr);
    if (pruned === null) {
        return { hits: [], matched: 0, limit, truncated: false, tooWide: false, byCondition };
    }

    let slots = 0;
    const root = compile(pruned, () => slots++);
    // 태그를 다는 단위 = **루트의 직속 가지**(루트가 OR 일 때). 그 외엔 루트 자신 하나.
    // ⚠ **부정된 루트 OR 은 쪼개지 않는다** — 가지를 직접 돌면 `runNode(root)` 를 안 지나 `root.neg` 가
    //   통째로 증발하고 `¬(a ∨ b)` 가 정확히 반대 집합(`a ∨ b`)으로 평가된다. 부정은 가지별로 분배되지
    //   않으므로(드모르간은 구조를 바꾼다) 그때는 루트 하나로 돈다 — 태그가 한 종류로 줄 뿐이다.
    const branches = pruned.kind === "or" && pruned.neg !== true ? root.children : [root];
    for (const b of branches) byCondition.set(b.node.id, 0);

    // 사전계산 소요 — 식이 안 쓰는 재료는 만들지 않는다. **트리를 걸어야 한다**: 평평한 2중 루프로
    // 재면 묶음 안의 격자·전고 술어를 못 보고, 그 조건은 화면에 오류 없이 **조용히 아무것도 안 건다**.
    const needDays: number[] = [];
    let needGrid = false;
    const needBreakout = new Map<string, BreakoutPred>();
    const scan = (e: CellExpr): void => {
        if (e.kind === "pred") {
            if (e.pred.kind === "priorHighBreak" && !needDays.includes(e.pred.days)) needDays.push(e.pred.days);
            if (e.pred.kind === "gridPoint") needGrid = true;
            if (e.pred.kind === "breakout") needBreakout.set(breakoutKeyOf(e.pred), e.pred);
            return;
        }
        for (const c of e.of) scan(c);
    };
    scan(pruned);

    const byKey = new Map<string, CellHit>();
    let matched = 0;
    let tooWide = false;

    outer: for (const s of stocks) {
        const n = s.times.length;
        if (n === 0) continue;
        const pre = precompute(s, mat, needDays, needGrid, needBreakout);
        // 전이 상태 — 노드마다 슬롯 하나. 종목이 바뀌면 새로 만든다(하루 경계 = 종목 타임라인).
        const st: TransitionState[] = Array.from({ length: slots }, newState);

        for (let i = 0; i < n; i++) {
            const min = minuteOfDayOf(s.times[i]);
            const ctx: CellCtx = { s, i, min, pre, mat, themeAns: new Map(), themeUsed: null };

            for (const b of branches) {
                // ⚠ 캐스트 — TS 는 함수 호출(runNode 의 속 변이)로 프로퍼티 좁힘을 안 풀어서, 그냥 null 을
                //   대입하면 아래 읽기가 never 로 좁혀진다.
                ctx.themeUsed = null as CellCtx["themeUsed"];
                if (!runNode(b, st, ctx)) continue;

                byCondition.set(b.node.id, (byCondition.get(b.node.id) ?? 0) + 1);
                const key = `${s.code}|${min}`;
                let hit = byKey.get(key);
                if (!hit) {
                    matched++; // **셀** 수 — 같은 셀에 가지가 여럿 걸려도 하나다(목록 행 수와 같은 단위)
                    hit = {
                        code: s.code,
                        min,
                        tags: [],
                        ratePct: s.rate[i] ?? null,
                        cumAmount: s.cumAmount[i] ?? null,
                        zoneRank: null,
                        zoneTheme: null,
                    };
                    byKey.set(key, hit);
                }
                if (!hit.tags.includes(b.node.id)) hit.tags.push(b.node.id);
                if (ctx.themeUsed !== null && (hit.zoneRank === null || ctx.themeUsed.rank < hit.zoneRank)) {
                    hit.zoneRank = ctx.themeUsed.rank;
                    hit.zoneTheme = ctx.themeUsed.theme;
                }

                if (matched > hardCap) {
                    // 그물 — 여기서부터는 비싼 재료도 안 부르고 즉시 접는다(matched 는 확인된 최소치).
                    // 셀 수 기준이라 켜진 가지 수에 따라 그물이 조여지지 않는다.
                    tooWide = true;
                    break outer;
                }
            }
        }
    }

    const out = [...byKey.values()];
    out.sort((a, b) => a.min - b.min || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    const truncated = out.length > limit;
    const cut = truncated ? (opts.limitBy === "stockGroup" ? cutByStockGroup(out, limit) : out.slice(0, limit)) : out;
    return { hits: cut, matched, limit, truncated, tooWide, byCondition };
}

/**
 * 옛 계약(평평한 조건 목록)의 어댑터 — 조건 = OR 가지, 술어 = AND 잎으로 올려 **같은 엔진**을 탄다.
 * 두 벌을 남기지 않는 것이 요점이다(언젠가 둘이 다른 답을 낸다).
 */
export function evaluateCells(
    stocks: readonly CellStock[],
    mat: CellMaterials,
    conditions: CellConditions,
    opts: CellEvalOptions = {},
): CellEvalResult {
    return evaluateCellsExpr(stocks, mat, exprOfCellConditions(conditions), opts);
}
