// 패널이 **보는 집합** — 두 우주를 한 계약(ViewedSet)으로 내는 유일한 자리(2026-09-18 단계 ④).
//
// ## 왜 훅 하나가 독점하나 — 평가 키의 단일 출처
// 하루 우주의 평가는 비싸다(존 순위 조건이면 하루 5.7초 · 재료 15MB). `useCellSet` 의 모듈 메모가
// 같은 **키**의 중복을 접어 주는데, 키에는 조건·날짜·opts 가 전부 실린다 — 즉 소비자가 셋 중 하나만
// 다르게 정하면 그 비용이 통째로 한 벌 더 돈다. 그래서 opts 는 `DAY_SET_OPTS` 고정, 날짜는 전역
// focus 하나로 여기서 못박는다. (작업 대상의 날짜 고정 📌 는 **순회 경계 규칙**이지 평가 날짜 분기가
// 아니다 — 패널별 평가 날짜를 여는 순간 키가 갈려 5.7초가 패널 수만큼 곱해진다.)
//
// ## 종단과 하루는 가는 길이 다르다
//  · 종단 — 지금까지대로 리졸버(`viewOf`). 핀이 없으면 전역 포인터를 따른다.
//  · 하루 — 리졸버를 **안 거친다**: `resolveSetRef` 는 다른 우주의 집합을 빈 집합으로 접고(otherUniverse),
//    `SetRef` 의 `items` 갈래는 캐시 키가 항목 전체라 2,000셀이면 키 하나가 수십 KB 다.
//    조건을 평가기(`useCellSet`)에 바로 태우고 그 산출물(`items`)을 뷰 계약으로 포장한다.
//
// ## 시선(월·존재필터)은 하루 집합에 안 걸린다
// 하루 집합은 **날짜가 곧 시선**이다. 월 시선이 겹쳐 걸리면 focus 날짜의 달이 시선 밖일 때 전량이
// 소멸하는데, 그 빈 화면은 "조건에 다 걸렸다"로 읽힌다(이 코드베이스가 내내 경계하는 그 실패).
import { useCallback, useMemo } from "react";
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { chartKey } from "../../lib/pointKey.js";
import type { SetRef } from "../../lib/setRef.js";
import { selectFilterUniverse, useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { useFunnel } from "./FunnelContext.js";
import { DAY_SET_OPTS, useCellSet } from "./useCellSet.js";
import { canPin, dayExprOf, dayUnsupportedReason, parsePanelBinding, targetUniverseOf } from "./panelSetBinding.js";
import { linkedTargetLabel, setRefLabel } from "./useSetBinding.js";
import { effectiveUniverse, type Universe } from "./universe.js";
import type { ViewedSet } from "./useSetViews.js";


/** 하루 집합일 때만 뜻이 있는 상태 — 화면이 상한·결손·로딩을 말할 재료. */
export interface DaySetState {
    on: boolean;
    isLoading: boolean;
    /** 그물에 걸렸다 — 목록을 세우면 앞 종목에 쏠린 편향 표본이 된다(단계 ③ 과 같은 규칙). */
    tooWide: boolean;
    truncated: boolean;
    matched: number;
    /** 재료 조회 실패 — **"오늘은 후보가 없다"와 정반대의 사실**이라 화면이 갈라 말해야 한다. */
    error: Error | null;
    /** 존 순위 재료(테마 멤버십)가 섰나 — 아니면 그 칸이 조용히 적게 건다. */
    themesReady: boolean;
    /** 이 우주에서 이 바인딩을 못 푸는 이유(풀 수 있으면 null). */
    unsupported: string | null;
}

export interface BoundSet {
    /** 보는 집합 — 우주와 무관하게 같은 계약(구독 패널은 이것만 안다). */
    view: ViewedSet;
    /** 사람이 읽는 이름 — 헤더 라벨이 상시 표시한다. */
    label: string;
    universe: Universe;
    /** null = 연동(전역 포인터를 따른다). */
    pinned: SetRef | null;
    /**
     * 지금 **실제로 따라가는** 참조(`pinned ?? 전역 포인터`) — 소비자가 "조립을 보고 있나" 같은 질문에
     * 전역 포인터를 직접 읽으면 고정한 패널만 딴 것을 그린다(리뷰가 잡은 자리).
     */
    target: SetRef | null;
    /** 지금 보는 것을 이 패널에 고정 / 해제. */
    togglePin: () => void;
    day: DaySetState;
}

/** 쓰이지 않는 갈래(종단일 때의 하루 뷰 등) — 아무것도 안 거른다. */
const EMPTY_VIEW: ViewedSet = { isFiltering: false, broken: false, viewedItems: [], viewedChartKeys: new Set(), viewedPointRefs: [] };
/**
 * **못 푸는 바인딩** — 빈 집합이되 `isFiltering: true`(거르고 있다) · `broken: true`(이유가 있다).
 * `isFiltering: false` 로 두면 계약상 "제한 없음"이라 소비자가 **전 우주**를 그린다: 시트가 라벨 좌표
 * 전량을 세우고 시뮬 모수가 전 시그널이 된다 — "깨진 참조 = 빈 집합 + 라벨" 규칙의 정반대다.
 */
const UNRESOLVED_VIEW: ViewedSet = { isFiltering: true, broken: true, viewedItems: [], viewedChartKeys: new Set(), viewedPointRefs: [] };

export function useBoundSet(panelId: string): BoundSet {
    const [pinRaw, setPinRaw] = usePanelUi<unknown>(panelId, "setPin", null);
    const pinned = useMemo(() => parsePanelBinding(pinRaw), [pinRaw]);

    const funnel = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const workingUniverse = effectiveUniverse(useWorkbench(selectFilterUniverse));
    const workingExpr = useWorkbench((s) => s.filterExpr);
    const focusDate = useWorkbench((s) => s.focus.date);

    /** 지금 따라가는 대상 — 핀이 있으면 그것, 없으면 전역 포인터(연동). */
    const target = pinned ?? selectedSetRef;
    const universe = targetUniverseOf(target, savedSets, workingUniverse);
    const daily = universe === "daily";

    const dayExpr = useMemo(
        () => (daily ? dayExprOf(target, savedSets, workingExpr) : null),
        [daily, target, savedSets, workingExpr],
    );
    // ⚠ 훅은 조건부로 못 부른다 — 종단이면 빈 조건을 넘긴다. 그러면 `useCellSet` 이 **재료조차 안 당긴다**
    //   (조건 0건 = /day-replay 미조회 — 그 성질이 여기서 값을 한다).
    const cellSet = useCellSet(dayExpr, focusDate, DAY_SET_OPTS);

    // 종단 경로 — 핀이 없으면 viewOf(null) 이 전역 포인터를 따른다(기존 계약 그대로).
    const longView = funnel.viewOf(pinned);

    const dayView = useMemo<ViewedSet>(() => {
        if (!daily) return EMPTY_VIEW;
        // tooWide 면 산출물을 안 쓴다 — 중단 시점까지 모인 셀은 "코드 오름차순 앞 종목만"이라
        // 목록·시트로 세우면 조용히 편향된 표본을 진짜 집합처럼 보여 준다(단계 ③ 과 같은 판단).
        const items: FunnelItem[] = cellSet.tooWide ? [] : [...cellSet.items];
        return {
            // 로딩 가드는 **뷰 계약 안에** 있다(useSetViews 와 같은 규칙) — 소비자마다 되풀이하면
            // 하나는 빠뜨리고, 그 화면만 로딩 중을 "조건에 맞는 게 없습니다"로 말한다.
            isFiltering: !cellSet.isLoading,
            broken: false,
            viewedItems: items,
            viewedChartKeys: new Set(items.map((i) => chartKey(i))),
            // 하루 우주의 항목은 **전부 좌표**다(전개할 하루 항목이 없다).
            viewedPointRefs: items.map((i) => ({ stockCode: i.stockCode, date: i.date, time: i.time ?? "" })),
        };
    }, [daily, cellSet.tooWide, cellSet.items, cellSet.isLoading]);

    const unsupported = useMemo(
        () => (daily ? dayUnsupportedReason(target, savedSets) : null),
        [daily, target, savedSets],
    );

    // 이름만 — **우주 뱃지는 라벨 컴포넌트가 따로 그린다**(색·툴팁이 다른 채널이고, 같은 이름의
    // 집합이 두 우주에 있을 수 있다).
    const label = useMemo(
        () => (target === null
            // ⚠ 잎 수가 아니라 **거르고 있나**다 — `OR(참조…)` 작업 식은 잎이 0 이라 "전체"라고
            //   말하는데 실제로는 참조로 좁혀져 있다(useSetViews.isFiltering 과 한 규칙).
            ? linkedTargetLabel(funnel.viewOf(null).isFiltering)
            : setRefLabel(target, savedSets, funnel.labelLook)),
        [target, funnel, savedSets],
    );

    const togglePin = useCallback(() => {
        if (pinned !== null) {
            setPinRaw(null);
            return;
        }
        // 지금 따라가는 것을 그대로 묶는다 — **고르는 손을 늘리지 않는다**(팝오버 없음).
        // 포인터가 없으면(순수 연동) **최종 생존**을 묶는다: 그게 연동이 실제로 풀리는 대상이라
        // 화면이 안 바뀌고, 손잡이가 "눌렀는데 아무 일도 안 나는" 물건이 되지 않는다.
        setPinRaw(canPin(selectedSetRef) ? selectedSetRef : { kind: "survivors" });
    }, [pinned, selectedSetRef, setPinRaw]);

    return {
        view: daily ? (unsupported === null ? dayView : UNRESOLVED_VIEW) : longView,
        label,
        universe,
        pinned,
        target,
        togglePin,
        day: {
            on: daily,
            isLoading: daily && cellSet.isLoading,
            tooWide: daily && cellSet.tooWide,
            truncated: daily && cellSet.truncated,
            matched: daily ? cellSet.matched : 0,
            error: daily ? cellSet.error : null,
            themesReady: !daily || cellSet.themesReady,
            unsupported,
        },
    };
}
