// Focus/Scope 연동버스 슬라이스 — 2계층(레이아웃 라이브러리보다 이게 설계 본질):
//  - Focus(커서, scalar): date·code·time. 차트·주석 패널이 축별 selector 로 구독.
//  - Scope(렌즈, 집합): theme. 리스트형 패널 필터(차트 안 건드림).
// 무효화 규칙은 transitionFocus 단일 진실 — 액션은 next focus 조립 + chartZoom 의도(점프=해제/드리프트=유지)만 명시.
import type { StateCreator } from "zustand";
import { transitionFocus, type ActivePoint } from "./focusTransition.js";
import { kstToday } from "../lib/date.js";
import type { WorkbenchState } from "./workbench.js";

export interface Focus {
    date: string; // YYYY-MM-DD
    code: string; // 종목코드
    time: string | null; // HH:MM:SS, 분봉 마커. null = 마커 없음
}

export interface Scope {
    // 리스트 필터 렌즈(방송축). null = 미적용. theme 은 시트 멤버십(현재 rich).
    theme: string | null;
}

// 검색 컨텍스트(Focus와 독립된 2번째 스칼라 축). 일봉 봉 클릭 = "작업공간(Focus)을 안 옮기고
// (종목, 그 날짜)만 뉴스에서 조회". null = 검색 모드 아님(뉴스 패널이 Focus 를 따라감).
// 종목이 바뀌면(setCode/setFocus 로 code 변경) 자동 해제 → Focus 복귀. 나중에 N개 명명 컨텍스트로 일반화될 씨앗.
export interface Search {
    code: string;
    date: string; // YYYY-MM-DD
}

export type { ActivePoint };

export interface FocusSlice {
    focus: Focus;
    scope: Scope;
    search: Search | null; // 검색 모드 컨텍스트(null = Focus 따라감)
    // 선택된 복기 타점 — (A) "현재 타점에 연결된 가설" 판정 기준. focus.time(리플레이/차트 드리프트로 휘발)과 분리한다.
    // goToPoint(타점 클릭)에서만 세팅 → 시간만 움직이면 유지, 다른 타점으로 이동해야 바뀜. 종목/날짜 바뀌면 해제.
    activePoint: ActivePoint | null;
    // 마지막 Focus 변경의 출처(패널 id). 패널이 "내가 바꿨나(self) vs 남이 바꿨나(external)"를 구분해
    // 자기 자신은 제자리, 남에 의한 변경은 스크롤/동기화하는 데 쓴다. origin 미전달 = null(= 외부 취급).
    lastFocusOrigin: string | null;
    // Focus 액션 — 무효화규칙을 transitionFocus 에 강제한다(패널이 규칙을 재현하지 않게). origin 은 선택적 출처 태그.
    setDate: (date: string, origin?: string) => void;
    setCode: (code: string, origin?: string) => void;
    setTime: (time: string | null, origin?: string) => void;
    setFocus: (next: { date: string; code: string; time: string | null }, origin?: string) => void; // review point 원자적 세팅
    goToPoint: (point: { date: string; code: string; time: string }, origin?: string) => void; // 타점 이동 = focus + activePoint 원자 세팅
    // Scope 액션 — 각 축 독립 토글(차트 안 건드림).
    setTheme: (theme: string | null) => void;
    clearScope: () => void;
    // 검색 모드 — 봉 클릭이 세팅, ✕ 로 해제(null). 종목 바뀌면 setCode/setFocus 가 자동 해제.
    setSearch: (search: Search | null) => void;
}

export const createFocusSlice: StateCreator<WorkbenchState, [], [], FocusSlice> = (set) => ({
    focus: { date: kstToday(), code: "", time: null },
    scope: { theme: null },
    search: null,
    activePoint: null,
    lastFocusOrigin: null,

    // 모든 Focus 액션은 무효화규칙을 transitionFocus 단일 진실에 위임한다(각 액션이 규칙을 재현하지 않게).
    // chartZoom 만 액션 의도로 남긴다: 점프·종목전환(setDate/setCode/setFocus/goToPoint)=해제(전환은 항상 세션 기본 뷰,
    // 뷰 유지는 차트 패널의 "스케일 고정" 토글이 담당), 시간 드리프트(setTime)=유지.
    setDate: (date, origin) =>
        set((s) => ({ ...transitionFocus(s, { ...s.focus, date, time: null }, origin), chartZoom: null })),
    // code 변경 시 time 유지(같은시각 횡적비교). zoom 은 해제 — 안 그러면 anchor 없는 확대가 마지막 봉(시간외)에 붙는다.
    setCode: (code, origin) => set((s) => ({ ...transitionFocus(s, { ...s.focus, code }, origin), chartZoom: null })),
    // 시간만 이동(리플레이/차트 드리프트) = 파생축 전부 유지 → 연결 표시(A) 안 흔들림.
    setTime: (time, origin) => set((s) => transitionFocus(s, { ...s.focus, time }, origin)),
    setFocus: ({ date, code, time }, origin) =>
        set((s) => ({ ...transitionFocus(s, { ...s.focus, date, code, time }, origin), chartZoom: null })),
    // 타점 이동 = focus 전이 + activePoint 명시 override(다른 타점 선택 시에만 A 바뀜).
    goToPoint: ({ date, code, time }, origin) =>
        set((s) => ({ ...transitionFocus(s, { ...s.focus, date, code, time }, origin), activePoint: { code, date, time }, chartZoom: null })),

    setTheme: (theme) => set((s) => ({ scope: { ...s.scope, theme } })),
    clearScope: () => set(() => ({ scope: { theme: null } })),
    setSearch: (search) => set(() => ({ search })),
});
