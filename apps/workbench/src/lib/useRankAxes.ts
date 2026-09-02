// 축 목록 + 축별 줄 — 시트·필터·작업셋·차트가 공유하는 한 벌. 축은 전부 **계산 축**이다
// (판단축은 2026-08-25 폐지 — 값은 서버 피드, 줄(orderKey)은 여기서 값으로 조립한다: computedAxisView).
// 파생 모양은 소비자마다 다르므로(순위 인덱스 / raw) **raw 라인까지만** 여기서 준다.
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlacedPoint } from "@trade-data-manager/wire";
import { computedAxesQuery } from "../api/queries.js";
import { computedAxisView, type AxisRef } from "./computedAxis.js";
import { gridFeatureFeeds } from "./gridFeatures.js";
import { useAutoPoints, usePointGrids } from "./PointGridsContext.js";
import { useWorkbench } from "../store/workbench.js";

/** 계산 축의 화면용 메타 — 값 자체가 아니라 값을 어떻게 놓고 어떻게 읽는지. */
export interface ComputedAxisMeta {
    strongerWhen: "higher" | "lower";
    /** 레일 좌표 척도(축 정의 선언) — "log" 면 valueToFrac 이 십진 로그로 접는다(시총). */
    scale?: "log";
    /** 값 → 라벨. 단위가 축마다 다르다(%·일…) — 축 정의가 규격을 주고 여기선 함수로만 다닌다. */
    fmt: (v: number) => string;
}

export interface RankAxesView {
    /**
     * 시트 축 서열(store rankAxisOrder) 적용. pref 에 없는 새 축은 뒤로, 동률은 키 안정 정렬.
     * ⚠ 집합 편성 보드는 이 순서 **위에** 제 순서를 한 겹 더 입힌다(패널 로컬 — panels/filter/axisOrder.ts).
     */
    axes: AxisRef[];
    axisIds: string[];
    /** 축 키 → 그 축의 줄(orderKey 오름차). 모든 축이 키를 가짐(값 없는 축 = 빈 배열). */
    linesByAxis: Map<string, PlacedPoint[]>;
    /** 축 키 → (타점키 → 원시 수치). 값 구간 필터·레일 라벨이 쓴다. */
    computedValues: Map<string, Map<string, number>>;
    /** 축 키 → 강한 방향(레일 좌표 매핑) + 값 표시 함수(단위가 축마다 다르다 — %·일…). */
    computedMeta: Map<string, ComputedAxisMeta>;
    isLoading: boolean;
    /** dragged 축을 target 축 자리로 옮긴다 — **시트 서열**을 만진다(집합 편성 보드는 제 순서를 따로 든다). */
    reorder: (draggedId: string, targetId: string) => void;
}

/**
 * ⚠ **직접 부르지 말 것** — RankAxesProvider 가 유일한 호출자다(소비는 RankAxesContext 의 useRankAxes).
 * 인스턴스마다 계산 축의 `타점키 → 수치` 맵을 축별로 새로 만드는데, 타점이 수천이면 그 비용이
 * 부르는 화면 수만큼 그대로 는다.
 */
export function useRankAxesValue(): RankAxesView {
    const orderPref = useWorkbench((s) => s.rankAxisOrder);
    const setRankAxisOrder = useWorkbench((s) => s.setRankAxisOrder);

    const computedQ = useQuery(computedAxesQuery());
    // 격자 특징(클라 파생) — 서버 피드 뒤에 같은 모양으로 이어 붙인다(축 종류를 하류가 구분하지 않게).
    // 피드 4개 중 둘(`baseline-position`·`daily-change-un`)은 **옛 서버 축에서 승계한 키**다(서버는 그
    // 키를 더 이상 서빙하지 않는다 — 되살리면 여기 concat 이 같은 키를 둘로 만들어 시트 열이 겹친다).
    // **모수가 있을 때만 선다**: 자동 Point 가 0 이면 값이 전부 결손이라 "값 없음" 레일 넷이 상시 소음이
    // 된다 — 축 자체를 안 만든다(새 축 기본 "보임" 규칙과 충돌하지 않게).
    // ⚠ 그래서 **격자 로딩 중엔 이 축들이 잠깐 없다** — 서버가 공급하던 시절엔 없던 성질이고, 저장된
    //   열 설정·필터는 그동안 유령 주소를 든다(로드되면 되살아난다 — 청소는 축 목록이 온 뒤에만 돈다).
    const autoView = useAutoPoints();
    const gridsView = usePointGrids();
    // 렌즈(정의 노브)에 따라 축 **목록**이 는다/준다 — 고점 렌즈에서만 고점·다리 축이 선다(누출 게이트).
    // 갱신으로 되돌리면 그 축들이 목록에서 사라지므로 서랍 청소가 보호 목록(HIGH_LENS_AXIS_KEYS)을 봐야 한다.
    const lens = useWorkbench((s) => s.pointDef.lens);
    const computed = useMemo(() => {
        const server = computedQ.data ?? [];
        const synth = autoView.points.length > 0 ? gridFeatureFeeds(autoView, gridsView.gridOf, lens) : [];
        // 키 충돌 가드 — 서버가 승계 키를 다시 서빙하면 `axes` 엔 둘, `linesByAxis`(Map)엔 하나가 되어
        // **시트 열이 겹치고 그중 하나는 값이 어긋난다**(조용한 사고). 타입은 못 잡으니 여기서 짖는다.
        if (import.meta.env.DEV) {
            const serverKeys = new Set(server.map((f) => f.key));
            const dup = synth.filter((f) => serverKeys.has(f.key)).map((f) => f.key);
            if (dup.length > 0) console.error(`[rank-axes] 축 키 충돌 — 서버와 클라 파생이 같은 키를 낸다: ${dup.join(", ")}`);
        }
        return [...server, ...synth].map(computedAxisView);
    }, [computedQ.data, autoView, gridsView, lens]);

    const axes = useMemo<AxisRef[]>(() => {
        const idx = new Map(orderPref.map((k, i) => [k, i]));
        return computed
            .map((c) => c.axis)
            .sort((a, b) => (idx.get(a.key) ?? Infinity) - (idx.get(b.key) ?? Infinity) || (a.key < b.key ? -1 : 1));
    }, [computed, orderPref]);
    const axisIds = useMemo(() => axes.map((a) => a.key), [axes]);

    const linesByAxis = useMemo(() => {
        const feed = new Map(computed.map((c) => [c.axis.key, c.line]));
        return new Map(axes.map((a) => [a.key, feed.get(a.key) ?? []]));
    }, [axes, computed]);

    const reorder = useCallback((draggedId: string, targetId: string): void => {
        if (draggedId === targetId) return;
        const ids = axes.map((a) => a.key);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setRankAxisOrder(ids);
    }, [axes, setRankAxisOrder]);

    const computedValues = useMemo(() => new Map(computed.map((c) => [c.axis.key, c.values])), [computed]);
    const computedMeta = useMemo(() => new Map(computed.map((c) => [c.axis.key, { strongerWhen: c.strongerWhen, scale: c.scale, fmt: c.fmt }])), [computed]);

    const isLoading = computedQ.isLoading;
    // 반환 객체도 참조를 고정한다(useGroups 와 같은 이유) — Provider 가 이걸 context value 로 그대로 넘기므로,
    // 매 렌더 새 객체면 셸이 렌더될 때마다 **구독자 전원**이 따라 렌더된다.
    return useMemo(
        () => ({ axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading, reorder }),
        [axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading, reorder],
    );
}
