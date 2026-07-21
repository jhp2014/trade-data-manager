// 탐색 history 슬라이스 — 세션 방문기록(EOD focus). 워크셋·가설·차트·보드 어디서 이동하든 focus 초크포인트에서 기록.
// 단위 = (날짜,종목) 1행 + 마지막 방문 시각(dedup: 재방문 시 맨 위로 올리고 time 갱신). "빠르게 되돌아가기"용.
import type { StateCreator } from "zustand";
import { loadJson, saveJson } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

export interface HistoryEntry {
    date: string; // YYYY-MM-DD
    code: string; // 종목코드
    time: string | null; // HH:MM:SS, 마지막 방문 타점 시각. null = 종목-날 단위 방문(타점 아님)
    at: number; // 마지막 방문 시각(정렬용, epoch ms)
}

export interface HistorySlice {
    history: HistoryEntry[];
    // 순환 커서(Alt+W/S) — history 배열의 현재 위치. -1 = 미순환(top 기준). 순환 이동은 재정렬을 유발하지 않아야
    // 순차 탐색이 유지되므로, 커서로 이동한 focus 는 recordVisit 를 건너뛴다(focusSlice 가 origin "history" 로 skip).
    historyCursor: number;
    // 방문 기록 — focus 액션(goToPoint/setFocus/setCode/setDate)이 code 변경 시 호출. setTime(시간 드리프트)은 호출 안 함.
    recordVisit: (v: { date: string; code: string; time: string | null }) => void;
    // 최근 탐색 순환 — dir = 인덱스 증분(+1=아래·더 과거, -1=위·더 최근). 끝에서 반대 끝으로 wrap. 커서 이동은 기록 안 함.
    stepHistory: (dir: 1 | -1) => void;
    clearHistory: () => void;
}

const HISTORY_KEY = "wb.history";
const HISTORY_CAP = 30;

const loadHistory = (): HistoryEntry[] =>
    loadJson(HISTORY_KEY, (o) =>
        Array.isArray(o)
            ? (o.filter((e) => e && typeof e === "object" && typeof (e as HistoryEntry).code === "string" && typeof (e as HistoryEntry).date === "string") as HistoryEntry[])
            : null,
    ) ?? [];

export const createHistorySlice: StateCreator<WorkbenchState, [], [], HistorySlice> = (set, get) => ({
    history: loadHistory(),
    historyCursor: -1,

    recordVisit: ({ date, code, time }) =>
        set((s) => {
            if (!code) return {}; // 빈 종목(초기 focus)은 기록 안 함
            // (날짜,종목) dedup — 기존 항목 제거 후 맨 앞에 최신값으로. time 은 이번 방문값으로 갱신(마지막 방문 우선).
            const rest = s.history.filter((e) => !(e.date === date && e.code === code));
            const next: HistoryEntry[] = [{ date, code, time, at: Date.now() }, ...rest].slice(0, HISTORY_CAP);
            saveJson(HISTORY_KEY, next);
            // 새 방문 = top 에 쌓임 → 커서를 top(0)으로 리셋(다음 Alt+W 는 여기서 과거로).
            return { history: next, historyCursor: 0 };
        }),

    stepHistory: (dir) => {
        const { history, historyCursor } = get();
        const len = history.length;
        if (len === 0) return;
        const base = historyCursor < 0 ? 0 : historyCursor;
        const nextIdx = (base + dir + len) % len; // 끝에서 반대 끝으로 wrap(가장 위↔가장 아래).
        const e = history[nextIdx];
        set({ historyCursor: nextIdx });
        // origin "history" → focusSlice 가 recordVisit 를 건너뛴다(재정렬 방지, 커서만 유지).
        if (e.time) get().goToPoint({ date: e.date, code: e.code, time: e.time }, "history");
        else get().setFocus({ date: e.date, code: e.code, time: null }, "history");
    },

    clearHistory: () =>
        set(() => {
            saveJson(HISTORY_KEY, []);
            return { history: [], historyCursor: -1 };
        }),
});
