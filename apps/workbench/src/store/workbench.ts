import { create } from "zustand";

// 연동버스 = 2계층(레이아웃 라이브러리보다 이게 설계 본질):
//  - Focus(커서, scalar): date·code·time(+timeLock). 차트·주석 패널이 축별 selector 로 구독.
//  - Scope(렌즈, 집합): issue. 리스트형 패널 필터(차트 안 건드림).
// 무효화규칙: date 최상위. 이 슬라이스는 클라에 유니버스 멤버십이 없어 code 유효성 판정은 보류하고,
// date/code 변경시 time 만 리셋한다(timeLock ON 이면 time 유지 = 같은시각 횡적비교).

export type ChartPriceMode = "krx" | "un"; // 분봉 등락률 기준 시장(UN=통합, KRX)

export interface Focus {
    date: string; // YYYY-MM-DD
    code: string; // 종목코드
    time: string | null; // HH:MM:SS, 분봉 마커. null = 마커 없음
    timeLock: boolean; // ON: code 바꿔도 time 유지(횡적비교)
}

export interface Scope {
    // 리스트 필터 렌즈(방송축). 둘 다 nullable·독립 → 동시 활성시 교집합으로 합성("scope.theme 추가" = additional axis).
    // null = 그 축 미적용. issue 는 daily_issues 큐레이션(현재 sparse), theme 은 시트 멤버십(현재 rich).
    issue: string | null;
    theme: string | null;
}

// 보드 설정 — 전역 설정 모달(사이드바)이 편집, 각 보드가 구독. 패널별 gear 대신 전역 1개.
export interface IssueBoardSettings {
    showIndividuals: boolean;
    showUnclassified: boolean;
    filterOn: boolean;
    filterHighGte: number; // 고가 등락률 %
    filterAmountEok: number; // 거래대금 억
    filterCombine: "and" | "or";
    filterMode: "dim" | "hide";
}
export interface ReplayBoardSettings {
    amountN: number; // 거래대금 top-N
    rateN: number; // 등락률 top-N
    // 분봉 거래대금 필터: "구간 ≥ filterBucketEok 억 인 분봉 개수 ≥ filterMinCount" 종목만.
    filterOn: boolean;
    filterBucketEok: number; // 구간 하한(억) — AMOUNT_BUCKETS_EOK 중 하나
    filterMinCount: number; // 최소 분봉 개수
    filterMode: "dim" | "hide";
}

interface WorkbenchState {
    focus: Focus;
    scope: Scope;
    chartPriceMode: ChartPriceMode; // 뷰 설정(축 아님) — 분봉 % 기준 시장
    issueSettings: IssueBoardSettings;
    replaySettings: ReplayBoardSettings;
    // Focus 액션 — 무효화규칙을 액션 안에 강제한다(패널이 규칙을 재현하지 않게).
    setDate: (date: string) => void;
    setCode: (code: string) => void;
    setTime: (time: string | null) => void;
    setFocus: (next: { date: string; code: string; time: string | null }) => void; // review point 원자적 세팅
    setTimeLock: (on: boolean) => void;
    // Scope 액션 — 각 축 독립 토글(차트 안 건드림).
    setIssue: (issue: string | null) => void;
    setTheme: (theme: string | null) => void;
    clearScope: () => void;
    // 뷰 설정
    setChartPriceMode: (mode: ChartPriceMode) => void;
    // 보드 설정(전역 모달이 편집)
    setIssueSettings: (patch: Partial<IssueBoardSettings>) => void;
    setReplaySettings: (patch: Partial<ReplayBoardSettings>) => void;
}

const today = new Date().toISOString().slice(0, 10);

export const useWorkbench = create<WorkbenchState>((set) => ({
    focus: { date: today, code: "", time: null, timeLock: false },
    scope: { issue: null, theme: null },
    chartPriceMode: "un",
    issueSettings: { showIndividuals: true, showUnclassified: false, filterOn: false, filterHighGte: 10, filterAmountEok: 100, filterCombine: "and", filterMode: "dim" },
    replaySettings: { amountN: 80, rateN: 40, filterOn: false, filterBucketEok: 50, filterMinCount: 5, filterMode: "dim" },

    // date 최상위 무효화: time 리셋 + scope 전체 리셋(이슈·테마 모두 그날 것이라 날짜 넘어가면 stale).
    setDate: (date) =>
        set((s) => ({ focus: { ...s.focus, date, time: null }, scope: { issue: null, theme: null } })),
    setCode: (code) =>
        set((s) => ({ focus: { ...s.focus, code, time: s.focus.timeLock ? s.focus.time : null } })),
    setTime: (time) => set((s) => ({ focus: { ...s.focus, time } })),
    setFocus: ({ date, code, time }) => set((s) => ({ focus: { ...s.focus, date, code, time } })),
    setTimeLock: (on) => set((s) => ({ focus: { ...s.focus, timeLock: on } })),

    setIssue: (issue) => set((s) => ({ scope: { ...s.scope, issue } })),
    setTheme: (theme) => set((s) => ({ scope: { ...s.scope, theme } })),
    clearScope: () => set(() => ({ scope: { issue: null, theme: null } })),
    setChartPriceMode: (mode) => set(() => ({ chartPriceMode: mode })),
    setIssueSettings: (patch) => set((s) => ({ issueSettings: { ...s.issueSettings, ...patch } })),
    setReplaySettings: (patch) => set((s) => ({ replaySettings: { ...s.replaySettings, ...patch } })),
}));
