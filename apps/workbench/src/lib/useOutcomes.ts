// 시그널 결과 파생 한 벌 — 결과 걷기(T 무관)와 T 단면(T 의존)을 **두 층으로 갈라 memo** 한다.
// 규칙: .claude/decisions.md "시그널 결과" 절.
//
// 걷기 층은 시그널·격자에만 의존한다 — T 레일을 문지르는 드래그가 수천 시그널 × 피벗 순회를 다시
// 돌리면 안 되고, 그 계약이 이 파일의 존재 이유다(합치면 어기기 쉬워 함수 경계로 못 박는다).
// 소비자(결과 패널·결과 시트·깔때기 평가)는 전부 PointGridsContext 의 useOutcomeSlices 를 본다(파생 1벌).
//
// 값은 **전부 정확하다**(2026-09-04 세션 최고가 굽기 이후 — 하한(≥)·표시/술어 분리 기계는 철거됐다).
// 낙폭·회복은 무눌림(none)에서만 null = 무사건이지 결손이 아니다.
// 예외 하나(v9 밴드 Point, approachPct>0): 시그널이 세션 최고가 봉 뒤일 때의 연장 고점은 p 이후
// 경로 뷰 좌표라 격자 해상도(2%)의 근사다 — outcome.ts 머리 주석 참조. 깊이·회복·저가는 여전히 정확.
import { useMemo } from "react";
import { pointKeyOf, sliceOutcome, walkOutcome, type OutcomeSlice, type OutcomeWalk } from "@trade-data-manager/market/domain";
import { OUTCOME_METRICS, type OutcomeMetric } from "./outcomeMetric.js";
import type { AutoPointsView, PointGridsView } from "./usePointGrids.js";

export type { OutcomeMetric } from "./outcomeMetric.js";

/** 시그널 하나의 걷기 + 단면에 필요한 재료(Point 봉 종가). */
interface OutcomeWalkRec {
    walk: OutcomeWalk;
    close: number;
}

export interface OutcomeWalksView {
    /** pointKey → 걷기. 키가 없는 건 격자 미도착뿐(걷기는 세션 최고가 덕에 항상 선다). */
    byKey: ReadonlyMap<string, OutcomeWalkRec>;
    total: number;
    /**
     * T 레일 분포 스트립 재료 — **모든 breakpoint 깊이**(%, 시그널당 여러 개: 눌림이 흡수될 때마다
     * 고점이 한 단계 연장되므로 그 깊이마다 사건 하나). **T 와 무관한 고정 그림이라 걷기 층 소유다** —
     * 단면 층에 두면 T 인스턴스마다 같은 배열이 새로 수집된다(2026-09-09 이관).
     */
    breakDepths: readonly number[];
}

/** 걷기 조립(순수) — 시그널·격자에만 의존한다(T 무관 계약의 실물). 호출자는 아래 훅과 defDerived 캐시. */
export function buildWalksView(auto: AutoPointsView, grids: PointGridsView): OutcomeWalksView {
    const byKey = new Map<string, OutcomeWalkRec>();
    const breakDepths: number[] = [];
    for (const a of auto.points) {
        const grid = grids.gridOf(a.stockCode, a.date);
        if (!grid) continue;
        const walk = walkOutcome(grid, a.point);
        for (const b of walk.breaks) breakDepths.push(b.depth);
        byKey.set(pointKeyOf({ stockCode: a.stockCode, date: a.date, time: a.time }), { walk, close: a.point.close });
    }
    return { byKey, total: auto.points.length, breakDepths };
}

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(걷기가 인스턴스마다 복제된다). */
export function useOutcomeWalksValue(auto: AutoPointsView, grids: PointGridsView): OutcomeWalksView {
    return useMemo<OutcomeWalksView>(() => buildWalksView(auto, grids), [auto, grids]);
}

/** 시그널 하나의 결과 레코드 — 기준은 이 단면의 허용 폭 T 하나다. */
export interface OutcomeRecord {
    /** 이 T 의 단면 — 술어·레일·차트 표식·시트 결과 열·상태의 기준. */
    slice: OutcomeSlice;
    /** 술어값(전부 정확). T 비교는 **인스턴스 둘**이 지고, 그 차이는 시트 차이 열이 낸다(Δ 지표 폐지). */
    eval: Partial<Record<OutcomeMetric, number>>;
}

export interface OutcomesView {
    /** 이 단면의 허용 폭 T(%). */
    t: number;
    /** pointKey → 레코드. 키가 없는 건 격자 미도착뿐. */
    byKey: ReadonlyMap<string, OutcomeRecord>;
    /** 상태 3분류(이 T 기준, 데이터 서술) — 초과(T 보다 깊은 눌림)/이내(전부 T 이내)/무눌림(2% 이상 눌림 없음). */
    counts: { total: number; exceeded: number; contained: number; none: number };
    /** 보고 저가의 회복 여부 카운트(무눌림 제외) — 머리글 회복/미회복 칩의 숫자. */
    recovery: { recovered: number; unrecovered: number };
    /** 레일 분포·틱·경계 해석용 값 맵 — 전부 정확값. 낙폭 2종만 무눌림 행이 빠진다(무사건). */
    railValues: ReadonlyMap<OutcomeMetric, Map<string, number>>;
}

/** 한 걷기 층에서 동시에 살려 두는 T 단면 수 — 조건 인스턴스 수 + 표시 T + 드래그 전이값. */
const MAX_SLICES = 8;

/**
 * ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(소비는 PointGridsContext 의 useOutcomeSlices).
 *
 * **T 별 단면 접근자**를 준다(2026-09-09 인스턴스화 — 조건마다 T 가 달라 단면이 여럿이다).
 * 신원은 걷기 층에만 매인다 — T 를 아무리 문질러도 이 함수는 안 갈리므로 깔때기의 `materialsEpoch`,
 * 즉 저장 집합 정산 캐시가 T 드래그로 통째 무효화되지 않는다(옛 단일 단면이 못 지키던 계약).
 */
export function useOutcomeSlicesValue(walks: OutcomeWalksView): (t: number) => OutcomesView {
    return useMemo(() => {
        const cache = new Map<number, OutcomesView>();
        return (t: number): OutcomesView => {
            const hit = cache.get(t);
            if (hit !== undefined) {
                cache.delete(t); // LRU 갱신 — Map 삽입 순서가 곧 나이
                cache.set(t, hit);
                return hit;
            }
            const made = buildOutcomesView(walks, t);
            cache.set(t, made);
            if (cache.size > MAX_SLICES) cache.delete(cache.keys().next().value!);
            return made;
        };
    }, [walks]);
}

/** 단면 조립(순수) — 상태 3분류·회복 카운트·값 맵이 여기 있고, 테스트가 이 함수를 직접 잰다. */
export function buildOutcomesView(walks: OutcomeWalksView, t: number): OutcomesView {
    const byKey = new Map<string, OutcomeRecord>();
    const railValues = new Map<OutcomeMetric, Map<string, number>>(OUTCOME_METRICS.map((m) => [m, new Map()]));
    const counts = { total: walks.total, exceeded: 0, contained: 0, none: 0 };
    const recovery = { recovered: 0, unrecovered: 0 };
    for (const [key, rec] of walks.byKey) {
        // 기준 = 이 단면의 T("T 까지의 눌림은 연속 상승으로 흡수").
        const s = sliceOutcome(rec.walk, t, rec.close);
        const ev: OutcomeRecord["eval"] = { extHigh: s.extPct };
        railValues.get("extHigh")!.set(key, s.extPct);
        if (s.dropFromHighPct !== null && s.dropFromClosePct !== null) {
            ev.dropFromHigh = s.dropFromHighPct;
            ev.dropFromClose = s.dropFromClosePct;
            railValues.get("dropFromHigh")!.set(key, s.dropFromHighPct);
            railValues.get("dropFromClose")!.set(key, s.dropFromClosePct);
        }
        counts[s.status] += 1;
        if (s.recovered !== null) recovery[s.recovered ? "recovered" : "unrecovered"] += 1;
        byKey.set(key, { slice: s, eval: ev });
    }
    return { t, byKey, counts, recovery, railValues };
}
