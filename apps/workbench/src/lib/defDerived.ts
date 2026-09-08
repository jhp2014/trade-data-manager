// 정의별 파생 캐시 — 격자 번들 × 타점 정의의 파생물(자동 Point·격자 특징 축·걷기·T 단면·시뮬)을
// **키드 캐시 한 곳**에서 준다. 규칙: .claude/decisions.md 「집합 조립 (OR)」.
//
// 층 3개 — 키가 곧 층의 의존성 계약이다(키 생성은 lib/pointDef.ts 한 곳):
//   · judge(판정 6노브) : 자동 Point + 격자 특징 축 + 모수 키 집합 + 걷기 — T·시뮬을 원리적으로 못 본다
//     ("T 드래그가 1만 시그널을 안 헛돌린다"는 기존 계약이 키 구조로 보존된다).
//   · +T(t1·t2)        : 결과 단면(OutcomesView)
//   · +시뮬 7노브       : 체결 basis(취소 둘만) · 시뮬 결과
// 걷기 이하는 **게으르다** — 부품이 결과 술어를 안 쓰면 걷기 비용 0(outcomeInUse 게이트의 부품별 일반화).
//
// 무효화 = 번들 객체 WeakMap: 격자 refetch 가 byDate 맵을 갈아 끼우면 캐시가 통째로 떨어져 나간다
// (세대 토큰 불필요). 안쪽은 LRU 상한 — 정의 1벌당 자동 Point ~1만 + 걷기 ~1만이라 무한히 쌓이면 안 된다.
import {
    chartKeyOf, minuteToHms, pointKeyOf, pointsOf,
    type DerivedPoint, type PointGrid, type PointJudgeDef, type ReviewPointKey, type TradeSimParams,
} from "@trade-data-manager/market/domain";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { gridFeatureFeeds } from "./gridFeatures.js";
import { cancelKeyOf, judgeKeyOf, simKeyOf } from "./pointDef.js";
import type { AutoPoint, AutoPointsView, PointGridsView } from "./usePointGrids.js";
import { buildOutcomesView, buildWalksView, type OutcomesView, type OutcomeWalksView } from "./useOutcomes.js";
import { buildSimBasisView, buildSimView, type SimBasisView, type SimView } from "./useTradeSim.js";

type ByDate = ReadonlyMap<string, ReadonlyMap<string, PointGrid>>;

/** 한 정의의 파생물 묶음 — 같은 (번들 × judge 키)면 **같은 객체**가 돌아온다(참조 동일성 = 하류 memo 의 자). */
export interface DefDerived {
    /** 자동 Point 파생(즉시) — isLoading/error 는 항상 false/null(번들이 손에 있다는 전제의 산출물). */
    auto: AutoPointsView;
    /** 격자 특징 축 피드 7개(값 재료) — 게으름. */
    feeds: () => ComputedAxisFeed[];
    /** 이 정의의 모수에 이 타점(pointKey)이 있나 — 조립 시트의 "모수 밖" 판정. */
    hasPoint: (pointKey: string) => boolean;
    /** 결과 걷기(T 무관) — 게으름. */
    walks: () => OutcomeWalksView;
    /** T 단면 — (t1, t2) 별 LRU. */
    outcomes: (t1: number, t2: number) => OutcomesView;
    /** 체결 basis — 취소 노브 둘 별 LRU. */
    simBasis: (cancel: Pick<TradeSimParams, "cancelRisePct" | "cancelAfterMin">) => SimBasisView;
    /** 시뮬 결과 — 노브 7 별 LRU. */
    sim: (params: TradeSimParams) => SimView;
}

/** 동시 활성 정의 상한 — 조립 부품 수의 실질 상한(초과분은 가장 오래된 정의부터 재계산으로 대체). */
const CAP_DEFS = 4;
/** 정의 하나 안의 단면(T·시뮬) 상한 — 드래그 왕복이 무한히 쌓이지 않게. */
const CAP_SLICES = 4;

const cacheByBundle = new WeakMap<ByDate, Map<string, DefDerived>>();
/** 파생 산출물(auto) → 그 정의의 묶음 — 소비자(useRankAxes 등)가 auto 참조만 들고 묶음에 닿는 길. */
const byAutoView = new WeakMap<AutoPointsView, DefDerived>();

/** auto 뷰가 캐시 산출물이면 그 정의의 파생 묶음 — 아니면(로딩 중 빈 뷰 등) undefined. */
export const derivedOfAuto = (auto: AutoPointsView): DefDerived | undefined => byAutoView.get(auto);

export function defDerivedFor(byDate: ByDate, def: PointJudgeDef): DefDerived {
    let byKey = cacheByBundle.get(byDate);
    if (!byKey) cacheByBundle.set(byDate, (byKey = new Map()));
    const key = judgeKeyOf(def);
    const hit = byKey.get(key);
    if (hit) {
        byKey.delete(key); // LRU 갱신 — Map 삽입 순서가 곧 나이
        byKey.set(key, hit);
        return hit;
    }
    const made = makeDerived(byDate, def);
    byKey.set(key, made);
    if (byKey.size > CAP_DEFS) byKey.delete(byKey.keys().next().value!);
    byAutoView.set(made.auto, made);
    return made;
}

/** LRU 한 칸 — 접근이 곧 갱신, 넘치면 가장 오래된 것부터. */
function lru<V>(m: Map<string, V>, k: string, make: () => V): V {
    const hit = m.get(k);
    if (hit !== undefined) {
        m.delete(k);
        m.set(k, hit);
        return hit;
    }
    const v = make();
    m.set(k, v);
    if (m.size > CAP_SLICES) m.delete(m.keys().next().value!);
    return v;
}

function makeDerived(byDate: ByDate, def: PointJudgeDef): DefDerived {
    const gridOf = (code: string, date: string): PointGrid | undefined => byDate.get(date)?.get(code);
    // 순수 빌더들이 뷰 모양(PointGridsView)을 받으므로 여기서 한 벌 지어 공유한다 — version 은 파생에 안 쓰인다.
    const gridsView: PointGridsView = { isLoading: false, error: null, gridOf, byDate, version: null };
    const auto = buildAutoView(byDate, def);
    let feeds: ComputedAxisFeed[] | null = null;
    let pointKeys: Set<string> | null = null;
    let walks: OutcomeWalksView | null = null;
    const outcomes = new Map<string, OutcomesView>();
    const basis = new Map<string, SimBasisView>();
    const sims = new Map<string, SimView>();
    const walksOf = (): OutcomeWalksView => (walks ??= buildWalksView(auto, gridsView));
    return {
        auto,
        feeds: () => (feeds ??= gridFeatureFeeds(auto, gridOf)),
        hasPoint: (k) => (pointKeys ??= new Set(auto.points.map((a) => pointKeyOf(a)))).has(k),
        walks: walksOf,
        outcomes: (t1, t2) => lru(outcomes, `${t1}|${t2}`, () => buildOutcomesView(walksOf(), t1, t2)),
        simBasis: (cancel) => lru(basis, cancelKeyOf(cancel), () => buildSimBasisView(auto, gridsView, cancel)),
        sim: (params) => lru(sims, simKeyOf(params), () => buildSimView(auto, gridsView, params)),
    };
}

/**
 * 자동 Point 파생(순수) — 번들 하나 × 판정 정의 하나. **호출자는 이 캐시뿐**이어야 한다:
 * 루프가 1만 객체를 만들므로 직접 부르면 같은 정의의 파생이 화면 수만큼 복제된다.
 */
function buildAutoView(byDate: ByDate, def: PointJudgeDef): AutoPointsView {
    const points: AutoPoint[] = [];
    const byChart = new Map<string, DerivedPoint[]>();
    for (const [date, byCode] of byDate) {
        for (const [stockCode, grid] of byCode) {
            const derived = pointsOf(grid, def);
            if (derived.length === 0) continue;
            byChart.set(chartKeyOf({ stockCode, date }), derived);
            for (const p of derived) points.push({ stockCode, date, time: minuteToHms(p.min), point: p });
        }
    }
    const rows: ReviewPointKey[] = points
        .map((a) => ({ stockCode: a.stockCode, date: a.date, time: a.time }))
        .sort((x, y) => (x.date !== y.date ? (x.date < y.date ? 1 : -1) : x.time < y.time ? -1 : x.time > y.time ? 1 : 0));
    return { isLoading: false, error: null, points, byChart, rows };
}
