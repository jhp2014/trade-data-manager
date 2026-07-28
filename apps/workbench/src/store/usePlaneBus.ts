// 플레인 포커스 버스 어댑터 — 실시간(liveFocusSlice)·복기(focusSlice) 두 슬라이스를 **같은 모양**으로 보여준다.
//
// 두 버스는 의미가 같고 이름만 다르다(setCode/setLiveCode · search/liveSearch · focus/liveFocus).
// 그래서 양 플레인 공통 패널(뉴스·텔레그램·차트)마다 `live ? s.liveFocus.code : s.focus.code` 같은
// 삼항 셀렉터가 6~7줄씩 반복됐고, 타입이 안 맞는 자리는 `as (v: null) => void` 캐스팅까지 붙었다.
// 슬라이스 구조는 그대로 두고 읽는 모양만 통일한다(스토어 재편은 별건).
//
// 두 버스의 **실제 차이**는 검색 컨텍스트 하나뿐이다:
//   · 복기 search = { code, date } — "(종목, 그 날짜)만 조회". 종목이 바뀌면 transitionFocus 가 해제.
//   · 실시간 liveSearch = { date } — 종목은 항상 liveFocus.code. setLiveCode 가 해제.
// 이 차이는 setSearchDate 안에 가둔다 — 호출자는 "검색 날짜를 이걸로" 만 말한다.
//
// 주의: 반환 객체는 매 렌더 새로 만들어진다(구독은 아래 스칼라 셀렉터들이 건다).
// useMemo/useEffect 의존성에는 객체가 아니라 **분해한 필드**를 넣을 것.
import { useCallback } from "react";
import { useWorkbench } from "./workbench.js";

export type Plane = "live" | "replay";

export interface PlaneBus {
    plane: Plane;
    live: boolean;
    /** 유효 종목 — 복기는 검색 컨텍스트의 종목 우선(search?.code ?? focus.code), 실시간은 항상 liveFocus.code. */
    code: string;
    /** 기준일(앵커) — 검색과 무관. 차트 일봉이 보는 날짜. */
    anchorDate: string;
    /** 실제로 볼 날짜 = 검색날짜 ?? 기준일. 분봉·뉴스·주석이 보는 날짜. */
    viewDate: string;
    /** 분봉 마커 시각(HH:MM:SS). null = 마커 없음. */
    time: string | null;
    /** 검색 컨텍스트 활성(일봉 봉 클릭으로 다른 날짜를 보는 중). */
    inSearch: boolean;
    setTime: (time: string | null, origin?: string) => void;
    /** 검색 날짜 지정(null = 해제 → 기준일 복귀). 복기는 현재 종목을 함께 묶는다. */
    setSearchDate: (date: string | null) => void;
    /** setSearchDate(null) 의 이름 있는 별칭 — 호출부 의도가 "검색 해제" 일 때. */
    clearSearch: () => void;
}

export function usePlaneBus(plane: Plane): PlaneBus {
    const live = plane === "live";
    // 셀렉터는 plane 상수로 갈라진다 → 다른 플레인 상태 변경엔 구독되지 않는다(불필요 렌더 없음).
    const code = useWorkbench((s) => (live ? s.liveFocus.code : (s.search?.code ?? s.focus.code)));
    const anchorDate = useWorkbench((s) => (live ? s.liveFocus.date : s.focus.date));
    const viewDate = useWorkbench((s) => (live ? (s.liveSearch?.date ?? s.liveFocus.date) : (s.search?.date ?? s.focus.date)));
    const time = useWorkbench((s) => (live ? s.liveFocus.time : s.focus.time));
    const inSearch = useWorkbench((s) => (live ? s.liveSearch != null : s.search != null));
    const setTime = useWorkbench((s) => (live ? s.setLiveTime : s.setTime));
    const setSearch = useWorkbench((s) => s.setSearch);
    const setLiveSearch = useWorkbench((s) => s.setLiveSearch);

    const setSearchDate = useCallback(
        (date: string | null): void => {
            if (live) setLiveSearch(date === null ? null : { date });
            else setSearch(date === null || code === "" ? null : { code, date });
        },
        [live, code, setSearch, setLiveSearch],
    );
    const clearSearch = useCallback(() => setSearchDate(null), [setSearchDate]);

    return { plane, live, code, anchorDate, viewDate, time, inSearch, setTime, setSearchDate, clearSearch };
}
