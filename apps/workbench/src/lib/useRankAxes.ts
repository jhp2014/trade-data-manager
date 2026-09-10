// 축 목록 + 축별 줄 — 시트·필터·작업셋·차트가 공유하는 한 벌. 축은 전부 **계산 축**이다
// (판단축은 2026-08-25 폐지 — 값은 서버 피드, 줄(orderKey)은 여기서 값으로 조립한다: computedAxisView).
// 파생 모양은 소비자마다 다르므로(순위 인덱스 / raw) **raw 라인까지만** 여기서 준다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlacedPoint } from "@trade-data-manager/wire";
import { computedAxesQuery } from "../api/queries.js";
import { computedAxisView, type AxisRef } from "./computedAxis.js";
import { derivedOfAuto } from "./defDerived.js";
import { gridFeatureFeeds } from "./gridFeatures.js";
import { useAutoPoints, usePointGrids } from "./PointGridsContext.js";
import { selectFilterStages, useWorkbench } from "../store/workbench.js";
import { hotAxisFeeds, hotInstancesKeyOf, hotInstancesOf } from "./hotAxis.js";

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
     * 축 목록 — **키 안정 정렬**(전역 순서 pref 는 없다). 보는 순서는 화면의 것이라 각 화면이 제 저장물을
     * 위에 입힌다: 시트는 열 순서(`wb.rankSheetColOrder` — 축만이 아니라 결과·차이 열까지 한 벌),
     * 집합 편성 보드는 레일 순서(`wb.filterAxisOrder`). 옛 store `rankAxisOrder` 는 2026-09-10 폐지.
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
}

/**
 * ⚠ **직접 부르지 말 것** — RankAxesProvider 가 유일한 호출자다(소비는 RankAxesContext 의 useRankAxes).
 * 인스턴스마다 계산 축의 `타점키 → 수치` 맵을 축별로 새로 만드는데, 타점이 수천이면 그 비용이
 * 부르는 화면 수만큼 그대로 는다.
 */
export function useRankAxesValue(): RankAxesView {
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
    // 급타점 축 인스턴스 — 조건 하나가 축 하나다(런타임 등록의 유일한 예외, hotAxis.ts).
    // ⚠ 항등 셀렉터로 구독하고 useMemo 로 접는다 — 셀렉터 안에서 배열을 만들면 얕은 비교가 늘 실패해
    //   스토어의 모든 갱신이 이 훅을 깨운다(decisions.md 2026-09-09).
    const stages = useWorkbench(selectFilterStages);
    const hotInstances = useMemo(() => hotInstancesOf(stages), [stages]);
    const hotKey = hotInstancesKeyOf(hotInstances);
    const computed = useMemo(() => {
        const server = computedQ.data ?? [];
        // 정의별 캐시 산출물이면 피드도 캐시(정의를 오가도 재계산 없음) — 아니면(테스트 주입 등) 직접 계산.
        const synth = autoView.points.length > 0
            ? (derivedOfAuto(autoView)?.feeds() ?? gridFeatureFeeds(autoView, gridsView.gridOf))
            : [];
        // 키 충돌 가드 — 서버가 승계 키를 다시 서빙하면 `axes` 엔 둘, `linesByAxis`(Map)엔 하나가 되어
        // **시트 열이 겹치고 그중 하나는 값이 어긋난다**(조용한 사고). 타입은 못 잡으니 여기서 짖는다.
        if (import.meta.env.DEV) {
            const serverKeys = new Set(server.map((f) => f.key));
            const dup = synth.filter((f) => serverKeys.has(f.key)).map((f) => f.key);
            if (dup.length > 0) console.error(`[rank-axes] 축 키 충돌 — 서버와 클라 파생이 같은 키를 낸다: ${dup.join(", ")}`);
        }
        const hot = autoView.points.length > 0 ? hotAxisFeeds(autoView, hotInstances) : [];
        return [...server, ...synth, ...hot].map(computedAxisView);
        // ⚠ 인스턴스 목록은 **내용 키**로 문다(hotKey) — 배열 신원으로 물면 무관한 조건을 만질 때마다
        //   이 memo 가 갈리고, 그 참조가 computedValues → evalLook → 저장 집합 정산 캐시까지 흘러간다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [computedQ.data, autoView, gridsView, hotKey]);

    // 키 안정 정렬 하나 — 화면 순서는 각 화면의 저장물이 입힌다(위 axes 주석).
    const axes = useMemo<AxisRef[]>(
        () => computed.map((c) => c.axis).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
        [computed],
    );
    const axisIds = useMemo(() => axes.map((a) => a.key), [axes]);

    const linesByAxis = useMemo(() => {
        const feed = new Map(computed.map((c) => [c.axis.key, c.line]));
        return new Map(axes.map((a) => [a.key, feed.get(a.key) ?? []]));
    }, [axes, computed]);

    const computedValues = useMemo(() => new Map(computed.map((c) => [c.axis.key, c.values])), [computed]);
    const computedMeta = useMemo(() => new Map(computed.map((c) => [c.axis.key, { strongerWhen: c.strongerWhen, scale: c.scale, fmt: c.fmt }])), [computed]);

    const isLoading = computedQ.isLoading;
    // 반환 객체도 참조를 고정한다(useGroups 와 같은 이유) — Provider 가 이걸 context value 로 그대로 넘기므로,
    // 매 렌더 새 객체면 셸이 렌더될 때마다 **구독자 전원**이 따라 렌더된다.
    return useMemo(
        () => ({ axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading }),
        [axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading],
    );
}
