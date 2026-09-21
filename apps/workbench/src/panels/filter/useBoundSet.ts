// 패널이 **보는 집합** — 두 우주를 한 계약(ViewedSet)으로 내는 유일한 자리(2026-09-18 단계 ④).
//
// ## 고를 것이 없다 (2026-09-22)
// 집합을 가리키는 주소가 **편집 경로 하나**가 되면서 이 훅에서 핀(`setPin`)과 전역 선택 포인터가
// 같이 죽었다. 모든 패널이 **관측 집합(경로의 뿌리)** 하나를 본다 — 다른 집합을 보려면 그 집합을
// 열면(`editSet`) 되고, 그러면 모든 패널이 같이 따라온다.
// 패널 인자(`panelId`)는 남는다: 패널별 화면 상태(날짜 고정 📌 등)가 여전히 그 주소를 쓴다.
//
// ## 우주는 **모드**가 정한다 — 파생이 아니다
// ⚠ `universeOfExpr` 은 조건이 없으면 `null` → 종단으로 떨어진다. 하루 모드에서 갓 만든 **빈 집합**이
// 상시 그 상태라, 파생으로 라우팅하면 하루 모드인데 구독 패널 전부가 **종단 기계**로 간다(타입으로
// 안 잡히고 화면은 그냥 종단 전량이 된다). 파생은 참조 해결·`refUniverse` 의 자로만 남는다.
//
// ## 평가의 박자는 깔때기가 쥔다
// 하루와 종단이 **같은 늦은 식·저장물**(`funnel.slowExpr`/`slowSets`)을 본다. 여기서 따로 늦추면
// 두 우주의 수가 서로 다른 순간의 조건에서 나온다.
//
// ## 시선(월·존재필터)은 하루 집합에 안 걸린다
// 하루 집합은 **날짜가 곧 시선**이다. 월 시선이 겹쳐 걸리면 focus 날짜의 달이 시선 밖일 때 전량이
// 소멸하는데, 그 빈 화면은 "조건에 다 걸렸다"로 읽힌다(이 코드베이스가 내내 경계하는 그 실패).
import { useMemo } from "react";
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { chartKey } from "../../lib/pointKey.js";
import { selectObservedSetId, useWorkbench } from "../../store/workbench.js";
import { useFunnel } from "./FunnelContext.js";
import { setDisplayName } from "./label.js";
import { DAY_SET_OPTS, useCellSet } from "./useCellSet.js";
import type { Universe } from "./universe.js";
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
    /** 이 우주에서 이 집합을 못 푸는 이유(풀 수 있으면 null). */
    unsupported: string | null;
}

export interface BoundSet {
    /** 보는 집합 — 우주와 무관하게 같은 계약(구독 패널은 이것만 안다). */
    view: ViewedSet;
    /** 사람이 읽는 이름 — 헤더 라벨이 상시 표시한다. */
    label: string;
    universe: Universe;
    day: DaySetState;
}

/** 쓰이지 않는 갈래(종단일 때의 하루 뷰 등) — 아무것도 안 거른다. */
const EMPTY_VIEW: ViewedSet = { isFiltering: false, broken: false, viewedItems: [], viewedChartKeys: new Set(), viewedPointRefs: [] };
/**
 * **아직 값을 모르는 하루** — 빈 집합이되 `isFiltering: true`(거르고 있다) · `broken: true`(이유가 있다).
 *
 * ⚠ `isFiltering: false` 로 두면 계약상 "제한 없음"이라 소비자가 **전 우주**를 그린다: 시트가 라벨
 * 좌표 전량을 세우고 시뮬 모수가 전 시그널이 된다. 2026-09-22 에 「계산」 관문이 걷히면서 이 자리가
 * **넓어졌다** — 예전엔 `computed` 가 막던 구간(재료 로딩·조건 0개)이 이제 모드 전환·날짜 이동·
 * 조건 편집마다 생긴다. 그래서 하루는 **재료가 없는 동안 여기로 떨어진다**.
 */
const UNRESOLVED_VIEW: ViewedSet = { isFiltering: true, broken: true, viewedItems: [], viewedChartKeys: new Set(), viewedPointRefs: [] };

const NO_CONDITION = "하루 우주에는 조건이 있어야 합니다 — 집합 편성에서 조건을 거세요";

export function useBoundSet(_panelId: string): BoundSet {
    const funnel = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const observedId = useWorkbench(selectObservedSetId);
    // ⚠ 라우팅의 자는 **모드**다(머리 주석) — 파생(`universeOfExpr`)이 아니다.
    const universe = useWorkbench((s) => s.filterMode);
    const focusDate = useWorkbench((s) => s.focus.date);
    const daily = universe === "daily";

    // 하루가 아니면 빈 식을 넘긴다 — `useCellSet` 이 **재료조차 안 당긴다**(조건 0건 = /day-replay
    // 미조회). 훅은 조건부로 못 부르므로 이 형태가 유일한 길이다.
    const cellSet = useCellSet(daily ? funnel.slowExpr : null, funnel.slowSets, focusDate, DAY_SET_OPTS);

    const dayView = useMemo<ViewedSet>(() => {
        if (!daily) return EMPTY_VIEW;
        // 조건이 없거나 재료가 아직 없다 = **값을 모른다**(0건이 아니다). 빈 결과를 그대로 흘리면
        // 이 코드베이스에서 언제나 "조건에 다 걸렸다"로 읽힌다.
        if (!cellSet.evaluable || cellSet.isLoading || cellSet.error !== null) return UNRESOLVED_VIEW;
        // tooWide 면 산출물을 안 쓴다 — 중단 시점까지 모인 셀은 "코드 오름차순 앞 종목만"이라
        // 목록·시트로 세우면 조용히 편향된 표본을 진짜 집합처럼 보여 준다(단계 ③ 과 같은 판단).
        const items: FunnelItem[] = cellSet.tooWide ? [] : [...cellSet.items];
        return {
            isFiltering: true,
            broken: false,
            viewedItems: items,
            viewedChartKeys: new Set(items.map((i) => chartKey(i))),
            // 하루 우주의 항목은 **전부 좌표**다(전개할 하루 항목이 없다).
            viewedPointRefs: items.map((i) => ({ stockCode: i.stockCode, date: i.date, time: i.time ?? "" })),
        };
    }, [daily, cellSet.evaluable, cellSet.isLoading, cellSet.error, cellSet.tooWide, cellSet.items]);

    // 이름만 — **우주 뱃지는 라벨 컴포넌트가 따로 그린다**(색·툴팁이 다른 채널이고, 같은 이름의
    // 집합이 두 우주에 있을 수 있다).
    const label = useMemo(() => {
        const f = savedSets.find((x) => x.id === observedId);
        return f
            ? setDisplayName(f, funnel.labelLook, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)")
            : "(지워진 집합)";
    }, [savedSets, observedId, funnel.labelLook]);

    return {
        view: daily ? dayView : funnel.view,
        label,
        universe,
        day: {
            on: daily,
            isLoading: daily && cellSet.isLoading,
            tooWide: daily && cellSet.tooWide,
            truncated: daily && cellSet.truncated,
            matched: daily ? cellSet.matched : 0,
            error: daily ? cellSet.error : null,
            themesReady: !daily || cellSet.themesReady,
            unsupported: daily && !cellSet.evaluable ? NO_CONDITION : null,
        },
    };
}
