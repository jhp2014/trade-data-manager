// 실시간 플레인 포커스 버스 — 복기 버스(focusSlice)와 독립. 실시간 패널끼리 code·date·time·searchDate 공유.
// 복기보다 단순: scope(테마필터)·activePoint(타점) 없음(라이브엔 무관). 소스는 항상 REST(apps/live).
// 검색날짜(searchDate)=탐색 커서(null=기준일 따라감), 일봉 봉클릭이 세팅. [[two-plane-focus-data-routing]]
import type { StateCreator } from "zustand";
import { kstToday } from "../lib/date.js";
import type { WorkbenchState } from "./workbench.js";

export interface LiveFocus {
    code: string;
    date: string; // YYYY-MM-DD, 기준일(실시간=오늘 기본)
    time: string | null; // HH:MM:SS 분봉 마커. null = 없음
}

export interface LiveFocusSlice {
    liveFocus: LiveFocus;
    liveSearch: { date: string } | null; // 검색날짜(null = liveFocus.date 따라감). 일봉 봉 클릭이 세팅.
    liveOrigin: string | null; // 마지막 변경 출처(패널 id) — self/external 판정
    setLiveCode: (code: string, origin?: string) => void;
    setLiveDate: (date: string, origin?: string) => void;
    setLiveTime: (time: string | null, origin?: string) => void;
    setLiveSearch: (search: { date: string } | null) => void;
}

export const createLiveFocusSlice: StateCreator<WorkbenchState, [], [], LiveFocusSlice> = (set) => ({
    liveFocus: { code: "", date: kstToday(), time: null },
    liveSearch: null,
    liveOrigin: null,
    // code/date 변경 = 새 종목·새 앵커 → 검색날짜 해제. time 이동은 파생축 유지(드리프트).
    setLiveCode: (code, origin) => set((s) => ({ liveFocus: { ...s.liveFocus, code }, liveSearch: null, liveOrigin: origin ?? null })),
    setLiveDate: (date, origin) => set((s) => ({ liveFocus: { ...s.liveFocus, date, time: null }, liveSearch: null, liveOrigin: origin ?? null })),
    setLiveTime: (time, origin) => set((s) => ({ liveFocus: { ...s.liveFocus, time }, liveOrigin: origin ?? null })),
    setLiveSearch: (search) => set(() => ({ liveSearch: search })),
});
