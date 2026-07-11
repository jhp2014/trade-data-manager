// 전역 설정 슬라이스 — 설정 모달(사이드바)이 편집, 각 패널/보드가 구독. 패널별 gear 대신 전역 1개.
import type { StateCreator } from "zustand";
import { loadJson, saveJson } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

export type NewsSearchEngine = "naver" | "google"; // HTS 뉴스 제목 클릭 시 웹 검색 엔진(네이버=제목+날짜, 구글=제목만)

export interface ThemeBoardSettings {
    showIndividuals: boolean;
    showUnclassified: boolean;
    // 종목 배제 필터는 설정이 아니라 별도 "이슈 필터" 패널(boardFilterSlice, DNF·그룹별 dim/hide)로 이관.
}
export interface ReplayBoardSettings {
    amountN: number; // 거래대금 top-N
    rateN: number; // 등락률 top-N
}

export interface SettingsSlice {
    newsSearchEngine: NewsSearchEngine; // HTS 뉴스 제목 검색 엔진(전역 토글)
    themeBoardSettings: ThemeBoardSettings;
    replaySettings: ReplayBoardSettings;
    reviewTypePresets: string[]; // 타점 셋업 유형 프리셋(숫자키 1~9). 클라 config.
    setNewsSearchEngine: (engine: NewsSearchEngine) => void;
    setThemeBoardSettings: (patch: Partial<ThemeBoardSettings>) => void;
    setReplaySettings: (patch: Partial<ReplayBoardSettings>) => void;
    setReviewTypePreset: (index: number, value: string) => void;
}

// 타점 셋업 유형 프리셋 — 숫자키 1~9. 값·의미는 사용자 config → localStorage 영속(outcome 선례).
const PRESETS_KEY = "wb.reviewTypePresets";
function loadReviewTypePresets(): string[] {
    const out = Array<string>(9).fill("");
    const arr = loadJson(PRESETS_KEY, (o) => (Array.isArray(o) ? o : null));
    if (arr) for (let i = 0; i < 9; i++) if (typeof arr[i] === "string") out[i] = arr[i] as string;
    return out;
}

export const createSettingsSlice: StateCreator<WorkbenchState, [], [], SettingsSlice> = (set) => ({
    newsSearchEngine: "naver",
    themeBoardSettings: { showIndividuals: true, showUnclassified: true },
    replaySettings: { amountN: 80, rateN: 40 },
    reviewTypePresets: loadReviewTypePresets(),

    setNewsSearchEngine: (engine) => set(() => ({ newsSearchEngine: engine })),
    setThemeBoardSettings: (patch) => set((s) => ({ themeBoardSettings: { ...s.themeBoardSettings, ...patch } })),
    setReplaySettings: (patch) => set((s) => ({ replaySettings: { ...s.replaySettings, ...patch } })),
    setReviewTypePreset: (index, value) =>
        set((s) => {
            const next = s.reviewTypePresets.slice();
            next[index] = value;
            saveJson(PRESETS_KEY, next);
            return { reviewTypePresets: next };
        }),
});
