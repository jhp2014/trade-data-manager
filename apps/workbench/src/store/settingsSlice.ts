// 전역 설정 슬라이스 — 설정 모달(사이드바)이 편집, 각 패널/보드가 구독. 패널별 gear 대신 전역 1개.
import type { StateCreator } from "zustand";
import { mergeShape, persistedField } from "./persist.js";
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
    themeTrailOffsets: readonly number[]; // 테마 순위 꼬리 오프셋(분, 오름차순·상한 5). 빈 배열 = 꼬리 꺼짐
    setNewsSearchEngine: (engine: NewsSearchEngine) => void;
    setThemeBoardSettings: (patch: Partial<ThemeBoardSettings>) => void;
    setReplaySettings: (patch: Partial<ReplayBoardSettings>) => void;
    setBoardMarket: (board: keyof BoardMarketMap, market: BoardMarket) => void;
    setThemeTrailOffsets: (offsets: readonly number[]) => void;
}

// ── 영속 필드 — 키·로드·저장이 한 자리에 묶인다(persistedField). 설정 모달이 편집하는 것들이
//    전부 여기 있다: 예전엔 setter 가 그냥 set() 만 해서 새로고침마다 기본값으로 돌아갔다.
const NEWS_ENGINE = persistedField<NewsSearchEngine>(
    "wb.newsSearchEngine",
    (o) => (o === "naver" || o === "google" ? o : null),
    "naver",
);

const THEME_BOARD_DEFAULT: ThemeBoardSettings = { showIndividuals: true, showUnclassified: true };
const THEME_BOARD = persistedField<ThemeBoardSettings>(
    "wb.themeBoardSettings",
    (o) => mergeShape(o, THEME_BOARD_DEFAULT),
    THEME_BOARD_DEFAULT,
);

const REPLAY_DEFAULT: ReplayBoardSettings = { amountN: 80, rateN: 40 };
const REPLAY = persistedField<ReplayBoardSettings>(
    "wb.replaySettings",
    (o) => mergeShape(o, REPLAY_DEFAULT),
    REPLAY_DEFAULT,
);

// 보드 기준 시장 — 유니온 문자열이라 mergeShape 로는 못 거른다(typeof 는 string 까지만 본다).
const BOARD_MARKET_DEFAULT: BoardMarketMap = { theme: "un", replay: "un", live: "un" };
const BOARD_MARKET = persistedField<BoardMarketMap>(
    "wb.boardMarket",
    (o) => {
        const isMarket = (v: unknown): v is BoardMarket => v === "krx" || v === "un";
        if (!o || typeof o !== "object") return null;
        const r = o as Partial<BoardMarketMap>;
        return {
            theme: isMarket(r.theme) ? r.theme : BOARD_MARKET_DEFAULT.theme,
            replay: isMarket(r.replay) ? r.replay : BOARD_MARKET_DEFAULT.replay,
            live: isMarket(r.live) ? r.live : BOARD_MARKET_DEFAULT.live,
        };
    },
    BOARD_MARKET_DEFAULT,
);

// 테마 순위 꼬리 오프셋(분) — 편집 손은 설정 모달이 아니라 패널 푸터의 팝오버다(boardMarket 이
// 보드 헤더에서 편집되는 것과 같은 예외). 날짜·종목과 무관한 보기 취향이라 영속.
const TRAIL_CAP = 5; // 흐림 계단이 이보다 많으면 눈으로 구분이 안 된다
/** 정돈 한 곳 — 정수 1..390 만, 중복 제거, 오름차순, 상한 컷. setter 와 로더가 같은 자를 쓴다. */
export const normalizeTrailOffsets = (list: readonly unknown[]): number[] =>
    [...new Set(list.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 390))]
        .sort((a, b) => a - b)
        .slice(0, TRAIL_CAP);
const TRAIL_DEFAULT: number[] = [];
const TRAIL_OFFSETS = persistedField<number[]>(
    "wb.themeTrailOffsets",
    (o) => (Array.isArray(o) ? normalizeTrailOffsets(o) : null),
    TRAIL_DEFAULT,
);

export const createSettingsSlice: StateCreator<WorkbenchState, [], [], SettingsSlice> = (set) => ({
    newsSearchEngine: NEWS_ENGINE.load(),
    themeBoardSettings: THEME_BOARD.load(),
    replaySettings: REPLAY.load(),
    boardMarket: BOARD_MARKET.load(),
    themeTrailOffsets: TRAIL_OFFSETS.load(),

    setNewsSearchEngine: (engine) => set(() => ({ newsSearchEngine: NEWS_ENGINE.save(engine) })),
    setThemeBoardSettings: (patch) =>
        set((s) => ({ themeBoardSettings: THEME_BOARD.save({ ...s.themeBoardSettings, ...patch }) })),
    setReplaySettings: (patch) =>
        set((s) => ({ replaySettings: REPLAY.save({ ...s.replaySettings, ...patch }) })),
    setBoardMarket: (board, market) =>
        set((s) => ({ boardMarket: BOARD_MARKET.save({ ...s.boardMarket, [board]: market }) })),
    setThemeTrailOffsets: (offsets) =>
        set(() => ({ themeTrailOffsets: TRAIL_OFFSETS.save(normalizeTrailOffsets(offsets)) })),
});
