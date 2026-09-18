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
// ⚠ **단락이 줄이는 건 "셀당 재료 호출"이지 존 순위의 지배 비용이 아니다**(2026-09-18 실측으로 확인).
// 분 단면은 **분당 한 번** 캐시되므로(cellMaterials.ranksAt), 그 분에 재료를 묻는 셀이 하나라도 있으면
// 그 분의 단면(유니버스 정렬)이 굽힌다 — 즉 지배 비용은 셀 수가 아니라 **분 수**(거래분 ~390)다.
// 실측: 존순위 칸 켜기 = **하한 0 에서 5.76초 / 하한 300억(싼 앞항 추가)에서 5.68초** — 차이 없음.
// 종목을 걸러도 분은 안 줄기 때문이다. 이 칸을 실제로 싸게 하려면 **분을 줄이는 조건**(시각 창)이거나
// 단면을 미리 굽는 쪽이어야 한다 — 종목별 필터를 더 얹는 방향은 효과가 없다(시각 창 쪽은 미측정 가설).
//
// ## 상한은 **산출물 상한**이지 평가 중단이 아니다
// 전량 평가해 matched 를 끝까지 세고, 정렬(분↑ → 코드↑) 뒤 앞에서 자른다. 평가 중에 멈추면
// "코드 오름차순 앞 종목만 남는" 편향이 생긴다. 평가를 실제로 멈추는 건 HARD_CAP 그물 하나뿐이다
// (조건이 사실상 전부일 때 19만 셀 × 분 단면 = 프리즈를 막는 2차 방어선. 1차는 "조건 없음 = 안 보여줌").
import { minuteOfDayOf, type MinuteDerived } from "../replay/dayReplay.js";
import {
    CELL_VALUE_FIELDS,
    costTierOf,
    isCellPredicateEmpty,
    unknownCellPredicate,
    type CellCondition,
    type CellConditions,
    type CellPredicate,
    type CellValueField,
    type CellValueRange,
    type Transition,
} from "./predicate.js";

/** 입력 종목 — 쓰는 필드만 Pick(probe·rankSection 과 같은 수법: 와이어 ReplayStock 이 그대로 들어온다). */
export type CellStock = Pick<MinuteDerived, "code" | "times" | "rate" | "cumAmount" | "minuteHigh" | "trailingHighs">;

/** 주입 재료 — 기존 단일 출처의 어댑터. 계산 규칙을 여기로 들이지 말 것(서수 출처 단일화 불변식). */
export interface CellMaterials {
    /** 격자 파생 Point 의 시각(분) 목록 — 없으면 빈 배열. (클라: useAutoPoints/defDerived) */
    gridMinutesOf(code: string): readonly number[];
    /** 그 분의 존 순위(소속 테마 중 best)와 승자 테마 — 존 밖·테마 없음·결손 = null.
     *  ⚠ 단락 뒤에만 불린다(비싼 재료). (클라: sectionSeries 캐시 + themeStrength.themeStatsOf) */
    zoneRankAt(code: string, min: number): { rank: number; theme: string } | null;
}

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
}

function precompute(s: CellStock, mat: CellMaterials, needDays: readonly number[], needGrid: boolean): StockPrecomputed {
    const highs = new Map<number, number | null>();
    for (const days of needDays) {
        // ⚠ index 0 = **당일** 전체 고가라 반드시 1부터 자른다(포함하면 영영 거짓 — probe 테스트가 지키던 규칙).
        const w = s.trailingHighs.un.slice(1, Math.max(1, Math.floor(days)) + 1);
        highs.set(days, w.length > 0 ? Math.max(...w) : null); // 창이 비면 결손(신규 상장 등)
    }
    return {
        priorHighOf: (days) => highs.get(days) ?? null,
        gridMinutes: needGrid ? new Set(mat.gridMinutesOf(s.code)) : null,
    };
}

/** 셀의 값 — cellValue 술어의 밑값. zoneRank 만 재료 콜백이 필요해 호출부가 넘긴다. */
function valueOf(field: CellValueField, s: CellStock, i: number, zone: { rank: number; theme: string } | null): number | null {
    switch (field) {
        case "ratePct":
            return s.rate[i] ?? null;
        case "cumAmountEok":
            return (s.cumAmount[i] ?? 0) / KRW_PER_EOK;
        case "minuteHighPct":
            return s.minuteHigh[i] ?? null;
        case "zoneRank":
            return zone?.rank ?? null;
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
export function evaluateCells(
    stocks: readonly CellStock[],
    mat: CellMaterials,
    conditions: CellConditions,
    opts: CellEvalOptions = {},
): CellEvalResult {
    const limit = opts.limit ?? CELL_LIMIT;
    const hardCap = opts.hardCap ?? CELL_HARD_CAP;
    const byCondition = new Map<string, number>();

    // 살아 있는 조건 = 켜져 있고 술어가 하나라도 있는 것. **빈 조건은 "전부"가 아니라 빠진다**
    // (조건 없음 = 안 보여줌 — 빈 술어를 참으로 세면 그 칸이 19만 셀을 통째로 통과시킨다).
    const live: { c: CellCondition; preds: CellPredicate[] }[] = [];
    for (const c of conditions) {
        if (!c.enabled) continue;
        const preds = c.predicates.filter((p) => !isCellPredicateEmpty(p));
        if (preds.length === 0) continue;
        preds.sort((a, b) => costTierOf(a) - costTierOf(b)); // 단락 순서 = 비용 오름차순
        live.push({ c, preds });
        byCondition.set(c.id, 0);
    }
    if (live.length === 0) {
        return { hits: [], matched: 0, limit, truncated: false, tooWide: false, byCondition };
    }

    // 사전계산 소요 — 조건이 안 쓰는 재료는 만들지 않는다.
    const needDays: number[] = [];
    let needGrid = false;
    for (const { preds } of live) {
        for (const p of preds) {
            if (p.kind === "priorHighBreak" && !needDays.includes(p.days)) needDays.push(p.days);
            if (p.kind === "gridPoint") needGrid = true;
        }
    }

    const byKey = new Map<string, CellHit>();
    let matched = 0;
    let tooWide = false;

    outer: for (const s of stocks) {
        const n = s.times.length;
        if (n === 0) continue;
        const pre = precompute(s, mat, needDays, needGrid);

        // 전이 상태 — 조건마다 (술어 슬롯 배열 + 칸 하나). 종목이 바뀌면 새로 만든다(하루 경계 = 종목 타임라인).
        const states = live.map(({ preds }) => ({ preds: preds.map(newState), cond: newState() }));

        for (let i = 0; i < n; i++) {
            const min = minuteOfDayOf(s.times[i]);
            // 존 순위는 셀당 한 번만 — 여러 조건이 같은 셀에서 물어도 재료 호출은 하나다.
            let zone: { rank: number; theme: string } | null = null;
            let zoneAsked = false;

            for (let ci = 0; ci < live.length; ci++) {
                const { c, preds } = live[ci];
                const st = states[ci];
                let all = true;
                let condValue: number | null = null;
                let condImproveUp = true;
                let valueProviders = 0;
                let usedZone = false;

                for (let pi = 0; pi < preds.length; pi++) {
                    const p = preds[pi];
                    let raw = false;
                    let v: number | null = null;
                    let improveUp = true;

                    switch (p.kind) {
                        case "cellValue": {
                            if (p.field === "zoneRank") {
                                if (!zoneAsked) {
                                    zone = mat.zoneRankAt(s.code, min);
                                    zoneAsked = true;
                                }
                                usedZone = true;
                            }
                            v = valueOf(p.field, s, i, zone);
                            improveUp = CELL_VALUE_FIELDS[p.field].improve === "up";
                            raw = v !== null && inRanges(v, p.ranges);
                            valueProviders++;
                            condValue = v;
                            condImproveUp = improveUp;
                            break;
                        }
                        case "priorHighBreak": {
                            const bar = pre.priorHighOf(p.days);
                            raw = bar !== null && (s.minuteHigh[i] ?? -Infinity) > bar;
                            break;
                        }
                        case "gridPoint":
                            raw = pre.gridMinutes !== null && pre.gridMinutes.has(min);
                            break;
                        case "time":
                            raw = p.ranges.some((r) => {
                                const t = hm(min);
                                return t >= r.from && t <= r.to;
                            });
                            break;
                        default:
                            unknownCellPredicate(p);
                    }

                    if (!applyTransition(p.transition, st.preds[pi], raw, v, improveUp)) {
                        all = false;
                        // ⚠ 단락 — 나머지 술어는 **평가하지 않는다**(비싼 재료를 안 부르는 것이 요점).
                        // 안 본 술어의 직전 상태는 "미관찰"이라 미참으로 되돌린다(모르는 것을 참으로 세지 않는다).
                        for (let rest = pi + 1; rest < preds.length; rest++) {
                            st.preds[rest].prevTrue = false;
                            st.preds[rest].prevValue = null;
                        }
                        break;
                    }
                }

                // 칸 전이 — 술어 AND 전체를 하나의 f 로 본다. improve 의 밑값은 **값 술어가 정확히 하나일 때**
                // 그 값이고(그래야 술어 하나짜리 칸에서 두 자리가 동치), 아니면 밑값 없이 엣지로 동작한다.
                const fired = applyTransition(c.transition, st.cond, all, valueProviders === 1 ? condValue : null, condImproveUp);
                if (!fired) continue;

                byCondition.set(c.id, (byCondition.get(c.id) ?? 0) + 1);
                const key = `${s.code}|${min}`;
                let hit = byKey.get(key);
                if (!hit) {
                    matched++; // **셀** 수 — 같은 셀에 칸이 여럿 걸려도 하나다(목록 행 수와 같은 단위)
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
                if (!hit.tags.includes(c.id)) hit.tags.push(c.id);
                if (usedZone && zone && (hit.zoneRank === null || zone.rank < hit.zoneRank)) {
                    hit.zoneRank = zone.rank;
                    hit.zoneTheme = zone.theme;
                }

                if (matched > hardCap) {
                    // 그물 — 여기서부터는 비싼 재료도 안 부르고 즉시 접는다(matched 는 확인된 최소치).
                    // 셀 수 기준이라 켜진 칸 수에 따라 그물이 조여지지 않는다(발화 수로 세면 4칸에서 1/4 로 내려간다).
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
    return {
        hits: cut,
        matched,
        limit,
        truncated,
        tooWide,
        byCondition,
    };
}

