import { create } from "zustand";

// 연동버스 = 2계층(레이아웃 라이브러리보다 이게 설계 본질):
//  - Focus(커서, scalar): date·code·time(+timeLock). 차트·주석 패널이 축별 selector 로 구독.
//  - Scope(렌즈, 집합): issue. 리스트형 패널 필터(차트 안 건드림).
// 무효화규칙: date 최상위. 이 슬라이스는 클라에 유니버스 멤버십이 없어 code 유효성 판정은 보류하고,
// date/code 변경시 time 만 리셋한다(timeLock ON 이면 time 유지 = 같은시각 횡적비교).

export interface Focus {
    date: string; // YYYY-MM-DD
    code: string; // 종목코드
    time: string | null; // HH:MM:SS, 분봉 마커. null = 마커 없음
    timeLock: boolean; // ON: code 바꿔도 time 유지(횡적비교)
}

export interface Scope {
    issue: string | null; // 리스트 필터 렌즈. null = 전체
}

interface WorkbenchState {
    focus: Focus;
    scope: Scope;
    // Focus 액션 — 무효화규칙을 액션 안에 강제한다(패널이 규칙을 재현하지 않게).
    setDate: (date: string) => void;
    setCode: (code: string) => void;
    setTime: (time: string | null) => void;
    setFocus: (next: { date: string; code: string; time: string | null }) => void; // review point 원자적 세팅
    setTimeLock: (on: boolean) => void;
    // Scope 액션
    setIssue: (issue: string | null) => void;
}

const today = new Date().toISOString().slice(0, 10);

export const useWorkbench = create<WorkbenchState>((set) => ({
    focus: { date: today, code: "", time: null, timeLock: false },
    scope: { issue: null },

    setDate: (date) => set((s) => ({ focus: { ...s.focus, date, time: null } })),
    setCode: (code) =>
        set((s) => ({ focus: { ...s.focus, code, time: s.focus.timeLock ? s.focus.time : null } })),
    setTime: (time) => set((s) => ({ focus: { ...s.focus, time } })),
    setFocus: ({ date, code, time }) => set((s) => ({ focus: { ...s.focus, date, code, time } })),
    setTimeLock: (on) => set((s) => ({ focus: { ...s.focus, timeLock: on } })),

    setIssue: (issue) => set(() => ({ scope: { issue } })),
}));
