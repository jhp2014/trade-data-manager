// 워크벤치 패널 카탈로그 — 알려진 패널의 id·컴포넌트·제목·플레인 단일 정의.
// 기본 배치(onReady)와 작업표시줄의 "닫힌 창 다시 열기"가 이 목록을 공유한다(제목 등 드리프트 방지).
// plane = 데이터 평면: live(브로커 실시간, 종목만 구동) / eod(DB 복기·분석, 종목+날짜+시간).
export type PanelPlane = "live" | "eod";

export interface PanelEntry {
    id: string;
    component: string;
    title: string;
    plane: PanelPlane;
}

export const PANEL_CATALOG: PanelEntry[] = [
    { id: "live-board-1", component: "liveBoard", title: "실시간 테마", plane: "live" },
    { id: "live-chart-1", component: "liveChart", title: "실시간 차트", plane: "live" },
    { id: "live-chart-2", component: "liveChart", title: "실시간 차트", plane: "live" },
    { id: "live-filter-1", component: "liveFilter", title: "실시간 테마 필터", plane: "live" },
    { id: "live-news-1", component: "liveNews", title: "실시간 뉴스", plane: "live" },
    { id: "live-telegram-1", component: "liveTelegram", title: "실시간 텔레그램", plane: "live" },
    { id: "live-watchlist-1", component: "liveWatchlist", title: "실시간 모니터링", plane: "live" },
    { id: "live-alert-log-1", component: "liveAlertLog", title: "알람 로그", plane: "live" },
    { id: "live-universe-rules-1", component: "liveUniverseRules", title: "유니버스 알람", plane: "live" },
    { id: "telegram-news-1", component: "telegramNews", title: "텔레그램", plane: "eod" },
    { id: "theme-board-1", component: "themeBoard", title: "테마 [장 마감]", plane: "eod" },
    { id: "board-filter-1", component: "boardFilter", title: "테마 [장 마감] 필터", plane: "eod" },
    { id: "replay-board-1", component: "replayBoard", title: "테마 [복기]", plane: "eod" },
    { id: "replay-filter-1", component: "replayFilter", title: "테마 [복기] 필터", plane: "eod" },
    { id: "chart-1", component: "chart", title: "차트", plane: "eod" },
    { id: "chart-2", component: "chart", title: "차트", plane: "eod" },
    { id: "workset-1", component: "workset", title: "작업 대상", plane: "eod" },
    { id: "history-1", component: "recentHistory", title: "최근 탐색", plane: "eod" },
    { id: "hypothesis-1", component: "hypothesis", title: "가설", plane: "eod" },
    { id: "hypothesis-graph-1", component: "hypothesisGraph", title: "가설 그래프", plane: "eod" },
    { id: "hypothesis-filter-1", component: "hypothesisFilter", title: "가설 필터", plane: "eod" },
    { id: "hts-news-1", component: "htsNews", title: "HTS뉴스", plane: "eod" },
];

/** 패널 id 의 플레인(카탈로그 미등록 시 eod 로 폴백). */
export function planeOf(id: string): PanelPlane {
    return PANEL_CATALOG.find((p) => p.id === id)?.plane ?? "eod";
}
