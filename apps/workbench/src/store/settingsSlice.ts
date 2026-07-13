// 전역 설정 슬라이스 — 설정 모달(사이드바)이 편집, 각 패널/보드가 구독. 패널별 gear 대신 전역 1개.
import type { StateCreator } from "zustand";
import { loadJson, saveJson } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

export type NewsSearchEngine = "naver" | "google"; // HTS 뉴스 제목 클릭 시 웹 검색 엔진(네이버=제목+날짜, 구글=제목만)

// 보드 기준 시장(전일종가 base) — 보드별 독립 토글(차트 chartPriceMode 와 비공유). % 표시·weakHigh 술어 기준.
export type BoardMarket = "krx" | "un";
export interface BoardMarketMap {
    theme: BoardMarket; // 이슈정리(EOD)
    replay: BoardMarket; // 복기
    live: BoardMarket; // 실시간
}

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
    boardMarket: BoardMarketMap; // 보드별 기준 시장(영속)
    reviewTypePresets: string[]; // 타점 셋업 유형 프리셋(숫자키 1~9). 클라 config.
    setNewsSearchEngine: (engine: NewsSearchEngine) => void;
    setThemeBoardSettings: (patch: Partial<ThemeBoardSettings>) => void;
    setReplaySettings: (patch: Partial<ReplayBoardSettings>) => void;
    setBoardMarket: (board: keyof BoardMarketMap, market: BoardMarket) => void;
    setReviewTypePreset: (index: number, value: string) => void;
}

// 보드 기준 시장 — localStorage 영속. 기본 UN(통합, 기존 동작).
const BOARD_MARKET_KEY = "wb.boardMarket";
function loadBoardMarket(): BoardMarketMap {
    const isMarket = (v: unknown): v is BoardMarket => v === "krx" || v === "un";
    const raw = loadJson(BOARD_MARKET_KEY, (o) => (o && typeof o === "object" ? (o as Partial<BoardMarketMap>) : null));
    return {
        theme: isMarket(raw?.theme) ? raw.theme : "un",
        replay: isMarket(raw?.replay) ? raw.replay : "un",
        live: isMarket(raw?.live) ? raw.live : "un",
    };
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
    boardMarket: loadBoardMarket(),
    reviewTypePresets: loadReviewTypePresets(),

    setNewsSearchEngine: (engine) => set(() => ({ newsSearchEngine: engine })),
    setThemeBoardSettings: (patch) => set((s) => ({ themeBoardSettings: { ...s.themeBoardSettings, ...patch } })),
    setReplaySettings: (patch) => set((s) => ({ replaySettings: { ...s.replaySettings, ...patch } })),
    setBoardMarket: (board, market) =>
        set((s) => {
            const next: BoardMarketMap = { ...s.boardMarket, [board]: market };
            saveJson(BOARD_MARKET_KEY, next);
            return { boardMarket: next };
        }),
    setReviewTypePreset: (index, value) =>
        set((s) => {
            const next = s.reviewTypePresets.slice();
            next[index] = value;
            saveJson(PRESETS_KEY, next);
            return { reviewTypePresets: next };
        }),
});
