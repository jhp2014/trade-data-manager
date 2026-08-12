// 워크벤치 패널 카탈로그 — 알려진 패널의 **단일 정의**: id·dockview 컴포넌트 키·제목·플레인·렌더.
// 이 목록을 공유하는 곳: 기본 배치(onReady) · 작업표시줄 "닫힌 창 다시 열기" · 설정의 화면 편집 ·
// 프리셋 sanitize(dock 스토어) · dockview components 맵. 예전엔 렌더 배선만 WorkbenchShell 에 따로 있어서
// component 문자열이 두 곳을 잇는 오타-무검사 링크였다(어긋나면 컴파일은 통과하고 패널이 빈칸으로 뜬다).
// plane = 데이터 평면: live(브로커 실시간, 종목만 구동) / eod(DB 복기·분석, 종목+날짜+시간).
import type { FunctionComponent } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { ChartPanel } from "../panels/ChartPanel.js";
import { ThemeBoardPanel } from "../panels/ThemeBoardPanel.js";
import { LiveBoardPanel } from "../panels/LiveBoardPanel.js";
import { RealtimeChartPanel } from "../panels/RealtimeChartPanel.js";
import { ReplayBoardPanel } from "../panels/ReplayBoardPanel.js";
import { WorksetPanel } from "../panels/WorksetPanel.js";
import { RecentHistoryPanel } from "../panels/RecentHistoryPanel.js";
import { RankPanel } from "../panels/RankPanel.js";
import { RankFilterPanel } from "../panels/RankFilterPanel.js";
import { RankSheetPanel } from "../panels/RankSheetPanel.js";
import { FilterFunnelPanel } from "../panels/FilterFunnelPanel.js";
import { SkeletonOverlayPanel } from "../panels/SkeletonOverlayPanel.js";
import { PointInfoPanel } from "../panels/PointInfoPanel.js";
import { MapPanel } from "../panels/MapPanel.js";
import { BoardFilterPanel, ReplayFilterPanel, LiveFilterPanel } from "../panels/BoardFilterPanel.js";
import { NewsPanel } from "../panels/NewsPanel.js";
import { TelegramNewsPanel } from "../panels/TelegramNewsPanel.js";
import { WatchlistPanel } from "../panels/WatchlistPanel.js";
import { AlertLogPanel } from "../panels/AlertLogPanel.js";
import { UniverseRulesPanel } from "../panels/UniverseRulesPanel.js";

export type PanelPlane = "live" | "eod";

export interface PanelEntry {
    id: string;
    /**
     * dockview 컴포넌트 키. **저장된 프리셋 JSON 에 contentComponent 로 그대로 박히는 값**이라
     * 바꾸면 사용자의 저장 화면이 통째로 무효화된다(sanitizeLayout 이 미등록 컴포넌트를 걷어낸다).
     * 여러 패널이 같은 키를 공유할 수 있다(chart-1·chart-2 → "chart").
     */
    component: string;
    title: string;
    plane: PanelPlane;
    /** 이 패널의 렌더. 같은 component 를 쓰는 항목끼리는 같은 렌더이어야 한다(맵은 첫 항목을 쓴다). */
    render: (panelId: string) => JSX.Element;
}

export const PANEL_CATALOG: PanelEntry[] = [
    { id: "live-board-1", component: "liveBoard", title: "실시간 테마", plane: "live", render: (id) => <LiveBoardPanel panelId={id} /> },
    { id: "live-chart-1", component: "liveChart", title: "실시간 차트", plane: "live", render: (id) => <RealtimeChartPanel panelId={id} /> },
    { id: "live-chart-2", component: "liveChart", title: "실시간 차트", plane: "live", render: (id) => <RealtimeChartPanel panelId={id} /> },
    { id: "live-filter-1", component: "liveFilter", title: "실시간 테마 필터", plane: "live", render: () => <LiveFilterPanel /> },
    { id: "live-news-1", component: "liveNews", title: "실시간 뉴스", plane: "live", render: () => <NewsPanel plane="live" /> },
    { id: "live-telegram-1", component: "liveTelegram", title: "실시간 텔레그램", plane: "live", render: () => <TelegramNewsPanel plane="live" /> },
    { id: "live-watchlist-1", component: "liveWatchlist", title: "실시간 모니터링", plane: "live", render: () => <WatchlistPanel /> },
    { id: "live-alert-log-1", component: "liveAlertLog", title: "알람 로그", plane: "live", render: () => <AlertLogPanel /> },
    { id: "live-universe-rules-1", component: "liveUniverseRules", title: "유니버스 알람", plane: "live", render: () => <UniverseRulesPanel /> },
    { id: "telegram-news-1", component: "telegramNews", title: "텔레그램", plane: "eod", render: () => <TelegramNewsPanel plane="replay" /> },
    { id: "theme-board-1", component: "themeBoard", title: "테마 [장 마감]", plane: "eod", render: (id) => <ThemeBoardPanel panelId={id} /> },
    { id: "board-filter-1", component: "boardFilter", title: "테마 [장 마감] 필터", plane: "eod", render: () => <BoardFilterPanel /> },
    { id: "replay-board-1", component: "replayBoard", title: "테마 [복기]", plane: "eod", render: (id) => <ReplayBoardPanel panelId={id} /> },
    { id: "replay-filter-1", component: "replayFilter", title: "테마 [복기] 필터", plane: "eod", render: () => <ReplayFilterPanel /> },
    { id: "chart-1", component: "chart", title: "차트", plane: "eod", render: (id) => <ChartPanel panelId={id} /> },
    { id: "chart-2", component: "chart", title: "차트", plane: "eod", render: (id) => <ChartPanel panelId={id} /> },
    { id: "workset-1", component: "workset", title: "작업 대상", plane: "eod", render: () => <WorksetPanel /> },
    { id: "history-1", component: "recentHistory", title: "최근 탐색", plane: "eod", render: () => <RecentHistoryPanel /> },
    { id: "rank-1", component: "rank", title: "배치", plane: "eod", render: () => <RankPanel /> },
    { id: "rank-filter-1", component: "rankFilter", title: "분석", plane: "eod", render: (id) => <RankFilterPanel panelId={id} /> },
    { id: "rank-sheet-1", component: "rankSheet", title: "시트", plane: "eod", render: () => <RankSheetPanel /> },
    // 필터 깔때기 — 조건의 목록과 집계. 옛 rankFilter("분석")는 결과 대시보드라 다른 패널이다.
    { id: "filter-funnel-1", component: "filterFunnel", title: "필터", plane: "eod", render: () => <FilterFunnelPanel /> },
    { id: "rank-skeleton-1", component: "rankSkeleton", title: "골격 [일봉]", plane: "eod", render: () => <SkeletonOverlayPanel grain="daily" /> },
    { id: "rank-skeleton-minute-1", component: "rankSkeletonMinute", title: "골격 [분봉]", plane: "eod", render: () => <SkeletonOverlayPanel grain="minute" /> },
    { id: "rank-point-1", component: "rankPoint", title: "타점 정보", plane: "eod", render: (id) => <PointInfoPanel panelId={id} /> },
    { id: "map-1", component: "map", title: "맵", plane: "eod", render: () => <MapPanel /> },
    { id: "hts-news-1", component: "htsNews", title: "HTS뉴스", plane: "eod", render: () => <NewsPanel plane="replay" /> },
];

/** 패널 id 의 플레인(카탈로그 미등록 시 eod 로 폴백). */
export function planeOf(id: string): PanelPlane {
    return PANEL_CATALOG.find((p) => p.id === id)?.plane ?? "eod";
}

/** id → 카탈로그 항목. 없으면 던진다 — 기본 배치의 id 오타를 부팅 때 바로 드러낸다. */
export function panelEntry(id: string): PanelEntry {
    const found = PANEL_CATALOG.find((p) => p.id === id);
    if (!found) throw new Error(`unknown panel: ${id}`);
    return found;
}

/** dockview 에 넘길 components 맵 — 카탈로그에서 파생한다(별도 맵을 손으로 유지하지 않는다). */
export function panelComponents(): Record<string, FunctionComponent<IDockviewPanelProps>> {
    const out: Record<string, FunctionComponent<IDockviewPanelProps>> = {};
    for (const e of PANEL_CATALOG) out[e.component] ??= (props) => e.render(props.api.id);
    return out;
}
