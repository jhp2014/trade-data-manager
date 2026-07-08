// 워크벤치 패널 카탈로그 — 알려진 패널의 id·컴포넌트·제목 단일 정의.
// 기본 배치(onReady)와 작업표시줄의 "닫힌 창 다시 열기"가 이 목록을 공유한다(제목 등 드리프트 방지).
export interface PanelEntry {
    id: string;
    component: string;
    title: string;
}

export const PANEL_CATALOG: PanelEntry[] = [
    { id: "theme-board-1", component: "themeBoard", title: "이슈정리" },
    { id: "board-filter-1", component: "boardFilter", title: "이슈 필터" },
    { id: "chart-1", component: "chart", title: "차트" },
    { id: "replay-board-1", component: "replayBoard", title: "복기" },
    { id: "workset-1", component: "workset", title: "작업셋" },
    { id: "hypothesis-1", component: "hypothesis", title: "가설" },
    { id: "hypothesis-graph-1", component: "hypothesisGraph", title: "가설 그래프" },
    { id: "hypothesis-filter-1", component: "hypothesisFilter", title: "가설 필터" },
    { id: "hts-news-1", component: "htsNews", title: "HTS뉴스" },
    { id: "telegram-news-1", component: "telegramNews", title: "텔레그램" },
];
