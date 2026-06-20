import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { WorkingSetMode } from "@/repositories/workingSetSources";

// 브라우저에서만 localStorage 사용. SSR·테스트(node)에선 no-op 으로 경고 회피.
const noopStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};

/** 오늘 기준 YYYY-MM. */
export function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

/** History 작업셋 기본 최대 보관 개수. */
export const DEFAULT_HISTORY_MAX = 50;

/**
 * 작업대가 상단 Case 레일을 채우는 방식.
 * - "workingset": 외부 소스 스코프(월별/시트/연결된것만)를 `mode` 로 로드.
 * - "history": Ctrl+V 로 탐색한 caseId 들(클라 영속 목록)을 레일에 표시.
 * - "boolean": `expr` 불리언식을 snapshot.cases 전체에 평가한 결과를 레일에 표시.
 */
export type FilterMode = "workingset" | "history" | "boolean";

/**
 * 탭별 탐색 위치(선택 케이스)를 저장하는 키.
 * workingset 은 소스 종류별로, history/boolean 은 단일 키로 구분한다.
 */
export function tabKeyOf(filterMode: FilterMode, mode: WorkingSetMode): string {
    if (filterMode === "workingset") return `ws:${mode.kind}`;
    return filterMode;
}

/** 직전 우클릭 삽입 토큰. 같은 노드를 연속 우클릭하면 연산자만 순환 교체한다. */
type LastInsert = {
    code: string;
    /** 토큰이 시작되는 위치(이 앞은 보존, 뒤를 교체). */
    index: number;
    /** 빈 식에서 시작한 첫 토큰이면 연산자 없는 2단계 순환. */
    emptyStart: boolean;
    cycle: number;
    /** 삽입 직후의 expr. 현재 expr 과 다르면(사용자 편집) 순환을 끊는다. */
    exprAfter: string;
};

// 마지막 단계는 "취소"(빈 문자열) — 토큰이 없던 것처럼 사라진다.
// 빈 식 첫 토큰: (없음) → ! → 취소  3단계.
// 그 외: & → | → &! → |! → 취소  5단계.
const CONNECTORS = [" & ", " | ", " & !", " | !"];
function suffixFor(code: string, emptyStart: boolean, cycle: number): string {
    if (emptyStart) {
        const m = ((cycle % 3) + 3) % 3;
        return m === 0 ? code : m === 1 ? `!${code}` : "";
    }
    const m = ((cycle % 5) + 5) % 5;
    return m < 4 ? CONNECTORS[m] + code : "";
}

/**
 * 작업대 설정 상태(클라이언트). 레일 채우기 방식·작업셋 모드·식·설정 모달 열림.
 */
type WorkbenchState = {
    filterMode: FilterMode;
    mode: WorkingSetMode;
    /** 월별 탭 설정값(YYYY-MM). 설정 모달에서 변경. */
    month: string;
    /** 시트 탭 설정값. 미설정 시 .env 기본 탭. 설정 모달에서 변경. */
    sheetTab: string | undefined;
    expr: string;
    settingsOpen: boolean;
    /** History 목록 관리 모달. */
    historyModalOpen: boolean;
    /** 저장/불러오기 모달. null 이면 닫힘. */
    savedFilterModal: "save" | "load" | null;
    /** Ctrl+V 로 탐색한 caseId 목록(최신순). */
    history: string[];
    /** History 최대 보관 개수. */
    historyMax: number;
    /** 탭(작업셋 모드)별 마지막 선택 caseId. */
    positions: Record<string, string>;
    _lastInsert: LastInsert | null;
    setFilterMode: (filterMode: FilterMode) => void;
    setMode: (mode: WorkingSetMode) => void;
    /** 워크셋 탭 전환(filterMode=workingset + mode 동시 설정). */
    selectWorkingSet: (mode: WorkingSetMode) => void;
    /** 월별 탭 설정값 변경(월별 탭이 활성이면 active mode 도 갱신). */
    setMonth: (month: string) => void;
    /** 시트 탭 설정값 변경(시트 탭이 활성이면 active mode 도 갱신). */
    setSheetTab: (tab: string | undefined) => void;
    setExpr: (expr: string) => void;
    /** caseId 를 History 앞에 추가(중복은 앞으로 이동, historyMax 로 캡). */
    addHistory: (caseId: string) => void;
    removeHistory: (caseId: string) => void;
    clearHistory: () => void;
    setHistoryMax: (max: number) => void;
    /** 탭 키에 현재 선택 위치 저장. */
    setPosition: (key: string, caseId: string) => void;
    /**
     * 가설 코드를 불리언식에 추가한다(우클릭 편의). 불리언 모드로 전환하고,
     * 같은 코드를 연속 호출하면 연산자만 순환 교체한다(&→|→&!→|!, 빈 식이면 없음↔!).
     */
    appendOrCycleRef: (code: string) => void;
    openSettings: () => void;
    closeSettings: () => void;
    openHistoryModal: () => void;
    closeHistoryModal: () => void;
    openSavedFilter: (kind: "save" | "load") => void;
    closeSavedFilter: () => void;
};

export const useWorkbench = create<WorkbenchState>()(
    persist(
        (set) => ({
    filterMode: "workingset",
    mode: { kind: "review-month", month: currentMonth() },
    month: currentMonth(),
    sheetTab: undefined,
    expr: "",
    settingsOpen: false,
    historyModalOpen: false,
    savedFilterModal: null,
    history: [],
    historyMax: DEFAULT_HISTORY_MAX,
    positions: {},
    _lastInsert: null,
    setFilterMode: (filterMode) => set({ filterMode }),
    setMode: (mode) => set({ mode }),
    selectWorkingSet: (mode) => set({ filterMode: "workingset", mode }),
    setMonth: (month) =>
        set((s) => ({
            month,
            mode:
                s.filterMode === "workingset" && s.mode.kind === "review-month"
                    ? { kind: "review-month", month }
                    : s.mode,
        })),
    setSheetTab: (tab) =>
        set((s) => ({
            sheetTab: tab,
            mode:
                s.filterMode === "workingset" && s.mode.kind === "sheet"
                    ? { kind: "sheet", tab }
                    : s.mode,
        })),
    // 수동 편집은 순환 상태를 무효화한다.
    setExpr: (expr) => set({ expr, _lastInsert: null }),
    addHistory: (caseId) =>
        set((state) => {
            const next = [caseId, ...state.history.filter((id) => id !== caseId)];
            return { history: next.slice(0, Math.max(1, state.historyMax)) };
        }),
    removeHistory: (caseId) =>
        set((state) => ({ history: state.history.filter((id) => id !== caseId) })),
    clearHistory: () => set({ history: [] }),
    setHistoryMax: (max) =>
        set((state) => {
            const m = Math.max(1, Math.floor(max) || 1);
            return { historyMax: m, history: state.history.slice(0, m) };
        }),
    setPosition: (key, caseId) =>
        set((state) => ({ positions: { ...state.positions, [key]: caseId } })),
    appendOrCycleRef: (code) =>
        set((state) => {
            const cur = state.expr;
            const last = state._lastInsert;
            const continuing = !!last && last.code === code && last.exprAfter === cur;

            const emptyStart = continuing ? last!.emptyStart : cur.trim() === "";
            const index = continuing ? last!.index : emptyStart ? 0 : cur.length;
            const cycle = continuing ? last!.cycle + 1 : 0;
            const base = continuing ? cur.slice(0, index) : emptyStart ? "" : cur;
            const expr = base + suffixFor(code, emptyStart, cycle);

            return {
                filterMode: "boolean",
                expr,
                _lastInsert: { code, index, emptyStart, cycle, exprAfter: expr },
            };
        }),
    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),
    openHistoryModal: () => set({ historyModalOpen: true }),
    closeHistoryModal: () => set({ historyModalOpen: false }),
    openSavedFilter: (kind) => set({ savedFilterModal: kind }),
    closeSavedFilter: () => set({ savedFilterModal: null }),
        }),
        {
            name: "hypothesis-lab-workbench",
            storage: createJSONStorage(() =>
                typeof window !== "undefined" ? window.localStorage : noopStorage,
            ),
            // 레일 채우기 방식·작업셋 모드·History·탭별 위치를 유지.
            // 식·모달 상태는 새로고침 시 초기화.
            partialize: (s) => ({
                filterMode: s.filterMode,
                mode: s.mode,
                month: s.month,
                sheetTab: s.sheetTab,
                history: s.history,
                historyMax: s.historyMax,
                positions: s.positions,
            }),
        },
    ),
);
