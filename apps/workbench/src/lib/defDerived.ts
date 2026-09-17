// 정의별 파생 캐시 — 격자 번들 × 타점 정의의 파생물(자동 Point·격자 특징 축·급타점)을
// **키드 캐시 한 곳**에서 준다. 규칙: .claude/decisions.md 「집합 조립 (OR)」·「구조 개편」.
//
// ⚠ 걷기·T 단면·시뮬은 2026-09-18 B 에서 **이 캐시를 떠났다** — 시그널이 라벨 좌표(정의 무관)가 되면서
//   judge 키에 걸면 같은 걷기가 정의 수만큼 복제된다. 그 층은 PointGridsProvider 전역 한 벌이다
//   (useOutcomeSlices·useSimAt). `hasPoint`("모수 밖" 판정)도 함께 소멸 — 모수가 라벨이라 정의가 못 가른다.
//
// 남은 층(정의 종속): judge(판정 6노브) → 자동 Point + 격자 특징 축 + 급타점 단면.
// 무효화 = 번들 객체 WeakMap: 격자 refetch 가 byDate 맵을 갈아 끼우면 캐시가 통째로 떨어져 나간다
// (세대 토큰 불필요). 안쪽은 LRU 상한 — 정의 1벌당 자동 Point ~1만이라 무한히 쌓이면 안 된다.
import {
    chartKeyOf, minuteToHms, pointsOf,
    type DerivedPoint, type PointGrid, type PointJudgeDef, type ReviewPointKey,
} from "@trade-data-manager/market/domain";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { gridFeatureFeeds } from "./gridFeatures.js";
import { hotKeyOf, judgeKeyOf } from "./pointDef.js";
import { hotCountsOf, hotPairsOf, type HotCounts, type HotPairs } from "./hotPoints.js";
import type { AutoPoint, AutoPointsView } from "./usePointGrids.js";

type ByDate = ReadonlyMap<string, ReadonlyMap<string, PointGrid>>;

/** 한 정의의 파생물 묶음 — 같은 (번들 × judge 키)면 **같은 객체**가 돌아온다(참조 동일성 = 하류 memo 의 자). */
export interface DefDerived {
    /** 자동 Point 파생(즉시) — isLoading/error 는 항상 false/null(번들이 손에 있다는 전제의 산출물). */
    auto: AutoPointsView;
    /** 격자 특징 축 피드(값 재료) — 게으름. */
    feeds: () => ComputedAxisFeed[];
    /**
     * 급타점 수 단면 — **(W,r) 별 LRU**다. 인스턴스 목록을 통째로 키에 넣지 않는 이유: 그러면
     * 인스턴스 하나를 만질 때마다 나머지 둘의 값까지 재계산된다.
     */
    hot: (w: number, r: number) => HotCounts;
    /** 연속 타점 쌍의 간격·상승률 — W·r 레일의 과녁. **노브 무관**이라 judge 층에 산다(게으름). */
    hotPairs: () => HotPairs;
}

/** 동시 활성 정의 상한 — 조립 부품 수의 실질 상한(초과분은 가장 오래된 정의부터 재계산으로 대체). */
const CAP_DEFS = 4;
/** 급타점 단면 상한 — 동시 필요 = 인스턴스 3 + 표시 (W,r) + 드래그 전이값. */
const CAP_HOT_SLICES = 8;

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
function lru<V>(m: Map<string, V>, k: string, make: () => V, cap: number): V {
    const hit = m.get(k);
    if (hit !== undefined) {
        m.delete(k);
        m.set(k, hit);
        return hit;
    }
    const v = make();
    m.set(k, v);
    if (m.size > cap) m.delete(m.keys().next().value!);
    return v;
}

function makeDerived(byDate: ByDate, def: PointJudgeDef): DefDerived {
    const gridOf = (code: string, date: string): PointGrid | undefined => byDate.get(date)?.get(code);
    const auto = buildAutoView(byDate, def);
    let feeds: ComputedAxisFeed[] | null = null;
    const hots = new Map<string, HotCounts>();
    let hotPairs: HotPairs | null = null;
    return {
        auto,
        feeds: () => (feeds ??= gridFeatureFeeds(auto, gridOf)),
        hot: (w, r) => lru(hots, hotKeyOf(w, r), () => hotCountsOf(auto.points, w, r), CAP_HOT_SLICES),
        hotPairs: () => (hotPairs ??= hotPairsOf(auto.points)),
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
