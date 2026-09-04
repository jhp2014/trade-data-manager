// 시그널 결과 파생 한 벌 — 결과 걷기(T 무관)와 T 단면(T 의존)을 **두 층으로 갈라 memo** 한다.
// 규칙: .claude/decisions.md "시그널 결과" 절.
//
// 걷기 층은 시그널·격자에만 의존한다 — T 레일을 문지르는 드래그가 수천 시그널 × 피벗 순회를 다시
// 돌리면 안 되고, 그 계약이 이 파일의 존재 이유다(합치면 어기기 쉬워 함수 경계로 못 박는다).
// 소비자(결과 패널·결과 시트·깔때기 평가)는 전부 PointGridsContext 의 useOutcomes 를 본다(파생 1벌).
//
// 값은 **전부 정확하다**(2026-09-04 세션 최고가 굽기 이후 — 하한(≥)·표시/술어 분리 기계는 철거됐다).
// 낙폭·회복은 무눌림(none)에서만 null = 무사건이지 결손이 아니다.
import { useMemo } from "react";
import { pointKeyOf, sliceOutcome, walkOutcome, type OutcomeSlice, type OutcomeWalk } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
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
}

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(걷기가 인스턴스마다 복제된다). */
export function useOutcomeWalksValue(auto: AutoPointsView, grids: PointGridsView): OutcomeWalksView {
    return useMemo<OutcomeWalksView>(() => {
        const byKey = new Map<string, OutcomeWalkRec>();
        for (const a of auto.points) {
            const grid = grids.gridOf(a.stockCode, a.date);
            if (!grid) continue;
            byKey.set(pointKeyOf({ stockCode: a.stockCode, date: a.date, time: a.time }), { walk: walkOutcome(grid, a.point.min), close: a.point.close });
        }
        return { byKey, total: auto.points.length };
    }, [auto, grids]);
}

/** 시그널 하나의 결과 레코드 — 기준은 전부 T1(기본 허용) 단면(2026-09-04 T2→T1 뒤집음). */
export interface OutcomeRecord {
    /** T1 단면 — 술어·레일·차트 표식·시트 결과 열·상태의 기준. */
    slice: OutcomeSlice;
    /** 술어값(전부 정확) — T2 는 Δ(deltaExt) 재료로만 녹아 있다(@T2 열은 결과 시트 폐지와 함께 은퇴). */
    eval: Partial<Record<OutcomeMetric, number>>;
}

export interface OutcomesView {
    t1: number;
    t2: number;
    /** pointKey → 레코드. 키가 없는 건 격자 미도착뿐. */
    byKey: ReadonlyMap<string, OutcomeRecord>;
    /** 상태 3분류(T1 기준, 데이터 서술) — 초과(T1 보다 깊은 눌림)/이내(전부 T1 이내)/무눌림(2% 이상 눌림 없음). */
    counts: { total: number; exceeded: number; contained: number; none: number };
    /** 보고 저가의 회복 여부 카운트(무눌림 제외) — 머리글 회복/미회복 칩의 숫자. */
    recovery: { recovered: number; unrecovered: number };
    /** T1→T2 에서 연장된 시그널 수(Δ > 0 — 종목 수, 중복 제거). */
    extendedCount: number;
    /** 레일 분포·틱·경계 해석용 값 맵 — 전부 정확값. 낙폭 2종만 무눌림 행이 빠진다(무사건). */
    railValues: ReadonlyMap<OutcomeMetric, Map<string, number>>;
    /**
     * T 레일 분포 스트립 재료 — **모든 breakpoint 깊이**(%, 시그널당 여러 개 — 눌림이 흡수될 때마다
     * 고점이 한 단계 연장되므로 그 깊이마다 사건 하나로 센다, 2026-09-04 사용자 확정: 첫 눌림만 세는
     * 안 기각). T 와 무관한 고정 분포라 미리 그려 두고, 누적 곡선 = "T=x 일 때의 연장 **사건** 수"가
     * 된다(헤더의 "연장 N"은 종목 수(중복 제거) — 사건 ≥ 종목, 서로 보완).
     */
    breakDepths: readonly number[];
}

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(소비는 PointGridsContext 의 useOutcomes). */
export function useOutcomesValue(walks: OutcomeWalksView): OutcomesView {
    // T 원시값 둘만 구독 — pointDef 통째를 물면 판정 노브 편집에도 단면 전체가 재계산된다(반대 방향의 같은 함정).
    const t1 = useWorkbench((s) => s.pointDef.toleranceT1Pct);
    const t2 = useWorkbench((s) => s.pointDef.toleranceT2Pct);
    return useMemo<OutcomesView>(() => buildOutcomesView(walks, t1, t2), [walks, t1, t2]);
}

/** 단면 조립(순수) — 상태 3분류·회복 카운트·값 맵이 여기 있고, 테스트가 이 함수를 직접 잰다. */
export function buildOutcomesView(walks: OutcomeWalksView, t1: number, t2: number): OutcomesView {
    const byKey = new Map<string, OutcomeRecord>();
    const railValues = new Map<OutcomeMetric, Map<string, number>>(OUTCOME_METRICS.map((m) => [m, new Map()]));
    const breakDepths: number[] = [];
    const counts = { total: walks.total, exceeded: 0, contained: 0, none: 0 };
    const recovery = { recovered: 0, unrecovered: 0 };
    let extendedCount = 0;
    for (const [key, rec] of walks.byKey) {
        // 기준 = T1(기본 허용 — "T1 까지의 눌림은 연속 상승으로 흡수") · T2 는 Δ 관찰 전용.
        const s1 = sliceOutcome(rec.walk, t1, rec.close);
        const s2 = sliceOutcome(rec.walk, t2, rec.close);
        for (const b of rec.walk.breaks) breakDepths.push(b.depth);
        const delta = s2.extPct - s1.extPct;
        const ev: OutcomeRecord["eval"] = { extHigh: s1.extPct, deltaExt: delta };
        railValues.get("extHigh")!.set(key, s1.extPct);
        railValues.get("deltaExt")!.set(key, delta);
        if (s1.dropFromHighPct !== null && s1.dropFromClosePct !== null) {
            ev.dropFromHigh = s1.dropFromHighPct;
            ev.dropFromClose = s1.dropFromClosePct;
            railValues.get("dropFromHigh")!.set(key, s1.dropFromHighPct);
            railValues.get("dropFromClose")!.set(key, s1.dropFromClosePct);
        }
        counts[s1.status] += 1;
        if (s1.recovered !== null) recovery[s1.recovered ? "recovered" : "unrecovered"] += 1;
        if (delta > 0) extendedCount += 1;
        byKey.set(key, { slice: s1, eval: ev });
    }
    return { t1, t2, byKey, counts, recovery, extendedCount, railValues, breakDepths };
}
