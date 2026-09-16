// 워크벤치 패널 카탈로그 — 알려진 패널 **타입**의 단일 정의: 슬롯 밑동·dockview 컴포넌트 키·제목·플레인·렌더.
// 인스턴스 열거가 아니다: 실존 인스턴스(슬롯) 집합은 dock 스토어의 슬롯 대장이 들고, 여기는
// "어떤 종류의 패널이 있고 어떻게 그리는가"만 선언한다(슬롯 문법은 panelSlots.ts).
// 이 목록을 공유하는 곳: 작업표시줄 칩 · 설정의 화면 편집 · 프리셋 sanitize(dock 스토어) ·
// dockview components 맵 · openAndFocus 리졸버. 예전엔 렌더 배선만 WorkbenchShell 에 따로 있어서
// component 문자열이 두 곳을 잇는 오타-무검사 링크였다(어긋나면 컴파일은 통과하고 패널이 빈칸으로 뜬다).
// plane = 데이터 평면: live(브로커 실시간, 종목만 구동) / eod(DB 복기·분석, 종목+날짜+시간).
import type { FunctionComponent } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { ChartPanel, defaultChartView } from "../panels/ChartPanel.js";
import { useWorkbench } from "../store/workbench.js";
import { ThemeBoardPanel } from "../panels/ThemeBoardPanel.js";
import { LiveBoardPanel } from "../panels/LiveBoardPanel.js";
import { RealtimeChartPanel } from "../panels/RealtimeChartPanel.js";
import { ReplayBoardPanel } from "../panels/ReplayBoardPanel.js";
import { WorksetPanel } from "../panels/WorksetPanel.js";
import { RecentHistoryPanel } from "../panels/RecentHistoryPanel.js";
import { RankSheetPanel } from "../panels/RankSheetPanel.js";
import { FilterFunnelPanel } from "../panels/FilterFunnelPanel.js";
import { RailPanel } from "../panels/filter/RailPanel.js";
import { NormOverlayPanel } from "../panels/norm/NormOverlayPanel.js";
import { PointInfoPanel } from "../panels/PointInfoPanel.js";
import { NewsPanel } from "../panels/NewsPanel.js";
import { TelegramNewsPanel } from "../panels/TelegramNewsPanel.js";
import { WatchlistPanel } from "../panels/WatchlistPanel.js";
import { LiveTapePanel } from "../panels/liveTape/LiveTapePanel.js";
import { ThemeRankPanel } from "../panels/themeRank/ThemeRankPanel.js";
import { OutcomePanel } from "../panels/outcome/OutcomePanel.js";
import { HotPointsPanel } from "../panels/hot/HotPointsPanel.js";
import { PointDefPanel } from "../panels/pointdef/PointDefPanel.js";
import { TradeSimPanel } from "../panels/sim/TradeSimPanel.js";
import { AlertLogPanel } from "../panels/AlertLogPanel.js";
import { UniverseRulesPanel } from "../panels/UniverseRulesPanel.js";
import { parseSlotId, slotIdOf } from "./panelSlots.js";

export type PanelPlane = "live" | "eod";

export interface PanelType {
    /**
     * 슬롯 밑동 — 인스턴스 id = `${idBase}-${n}`. 저장 배치·프리셋 JSON 의 패널 id 가 이 문법이라
     * component 와 같은 급의 불변 계약이다(바꾸면 저장 화면의 그 패널이 미등록으로 읽힌다).
     */
    idBase: string;
    /**
     * dockview 컴포넌트 키. **저장된 프리셋 JSON 에 contentComponent 로 그대로 박히는 값**이라
     * 바꾸면 사용자의 저장 화면이 통째로 무효화된다(sanitizeLayout 이 미등록 컴포넌트를 걷어낸다).
     */
    component: string;
    title: string;
    plane: PanelPlane;
    /** 이 타입의 렌더 — 인스턴스 id 를 받는다(다중 슬롯 패널은 이걸로 제 상태 낟알을 가른다). */
    render: (panelId: string) => JSX.Element;
    /**
     * 복제 가능(순수 시선 패널만 — 편집면은 "편집면은 하나" 원칙으로 금지).
     * 인스턴스-안전화(panelId 수신 + 영속/세션 키 전부 panelId 낟알)가 끝난 타입에만 켠다.
     */
    duplicable?: boolean;
    /**
     * 복제 시 `panelUi` 밖에 사는 설정의 사본(차트의 `wb.chartViews` 등) — 일반 panelUi 복사가
     * 조용히 빠뜨리는 몫만 여기서 진다.
     */
    cloneSettings?: (fromId: string, toId: string) => void;
    /** 슬롯 대장 최초 시딩 개수(기본 1). 옛 카탈로그가 열거하던 chart-1/chart-2 류의 승계 전용. */
    seedSlots?: number;
}

export const PANEL_TYPES: PanelType[] = [
    { idBase: "live-board", component: "liveBoard", title: "실시간 테마", plane: "live", render: (id) => <LiveBoardPanel panelId={id} /> },
    { idBase: "live-chart", component: "liveChart", title: "실시간 차트", plane: "live", seedSlots: 2, render: (id) => <RealtimeChartPanel panelId={id} /> },
    { idBase: "live-news", component: "liveNews", title: "실시간 뉴스", plane: "live", render: () => <NewsPanel plane="live" /> },
    { idBase: "live-telegram", component: "liveTelegram", title: "실시간 텔레그램", plane: "live", render: () => <TelegramNewsPanel plane="live" /> },
    { idBase: "live-watchlist", component: "liveWatchlist", title: "실시간 모니터링", plane: "live", render: () => <WatchlistPanel /> },
    { idBase: "live-tape", component: "liveTape", title: "테마 궤적 [실시간]", plane: "live", render: (id) => <LiveTapePanel panelId={id} /> },
    { idBase: "live-alert-log", component: "liveAlertLog", title: "알람 로그", plane: "live", render: () => <AlertLogPanel /> },
    { idBase: "live-universe-rules", component: "liveUniverseRules", title: "유니버스 알람", plane: "live", render: () => <UniverseRulesPanel /> },
    { idBase: "telegram-news", component: "telegramNews", title: "텔레그램", plane: "eod", render: () => <TelegramNewsPanel plane="replay" /> },
    { idBase: "theme-board", component: "themeBoard", title: "테마 [장 마감]", plane: "eod", render: (id) => <ThemeBoardPanel panelId={id} /> },
    { idBase: "replay-board", component: "replayBoard", title: "테마 [복기]", plane: "eod", render: (id) => <ReplayBoardPanel panelId={id} /> },
    {
        idBase: "chart",
        component: "chart",
        title: "차트",
        plane: "eod",
        seedSlots: 2,
        duplicable: true,
        // 차트 뷰(일봉/분봉/둘다)는 panelUi 밖(wb.chartViews)에 산다 — 일반 복사가 못 챙기는 몫.
        // 미저장이면 id 기본값(chart-1=일봉…)이 곧 "보던 그대로"라 그걸 새 슬롯에 각인한다.
        cloneSettings: (fromId, toId) => {
            const st = useWorkbench.getState();
            st.setChartView(toId, st.chartViews[fromId] ?? defaultChartView(fromId));
        },
        render: (id) => <ChartPanel panelId={id} />,
    },
    { idBase: "workset", component: "workset", title: "작업 대상", plane: "eod", render: () => <WorksetPanel /> },
    { idBase: "history", component: "recentHistory", title: "최근 탐색", plane: "eod", render: () => <RecentHistoryPanel /> },
    { idBase: "rank-sheet", component: "rankSheet", title: "시트", plane: "eod", render: () => <RankSheetPanel /> },
    // 집합 편성 — 조건을 걸어 집합을 만드는 자리(다른 패널은 그 집합을 구독만 한다).
    // component 키는 "filterFunnel" 그대로 — 저장 프리셋에 박히는 값이라 이름이 바뀌어도 못 건드린다.
    { idBase: "filter-funnel", component: "filterFunnel", title: "집합 편성", plane: "eod", render: (id) => <FilterFunnelPanel panelId={id} /> },
    // 필터 레일 — 1차원 조건(축·날짜·시간)을 분포 보며 긋는 자리. 편성 보드와 **같은 조건**을 다른
    // 렌즈로 본다(사본 없음) — 그어진 컷이 곧 보드의 행이다.
    { idBase: "filter-rails", component: "filterRails", title: "필터 레일", plane: "eod", render: (id) => <RailPanel panelId={id} /> },
    // 시그널 결과 — 시그널 **이후**(미래) 값의 분포·조건(과거/미래 패널 경계 — 필터 레일의 형제).
    // 결과 시트 패널(outcomeSheet)은 2026-09-04 폐지 — 결과 열이 기존 시트(rankSheet)의 열 프리셋으로 들어갔다.
    // 옛 배치에 남은 id 는 sanitizeLayout 자가치유가 걷어낸다(옛 map·rankSkeleton* 과 같은 길).
    { idBase: "outcome-rails", component: "outcomeRails", title: "시그널 결과", plane: "eod", render: () => <OutcomePanel /> },
    // 급타점 — 창 W 안 급한 재돌파의 개수(시그널 **이전**의 특징이라 필터 레일의 형제다). 전제가 쌍
    // (W,r) 이라 1차원 레일에 안 앉아 전용 판을 둔다 — 편집면이 여기 하나여야 값의 경로가 닫힌다.
    { idBase: "hot-points", component: "hotPoints", title: "급타점", plane: "eod", render: () => <HotPointsPanel /> },
    // 트레이드 시뮬 — 노브 7(정의 payload 동승) + 체결률 곡선·분류·도달 분포. 깔때기 거울이 아니라
    // 모수(보는 집합)로만 이어진다(decisions.md 「시그널 결과」 트레이드 시뮬 항목).
    { idBase: "trade-sim", component: "tradeSim", title: "트레이드 시뮬", plane: "eod", render: () => <TradeSimPanel /> },
    // 타점 정의 — 판정 노브를 분포 보며 긋는 자리(모수 선언층, POINT_DEF teal). 필터 레일의 형제이되
    // 깔때기 단이 아니다: 여기 컷은 행을 지우는 게 아니라 시그널의 존재·위치를 바꾼다.
    { idBase: "point-def", component: "pointDef", title: "타점 정의", plane: "eod", render: () => <PointDefPanel /> },
    // 정규화 두 판 — 골격 패널의 후신(골격의 실가치 = 정규화, 2026-08-23 은퇴). 실물 캔들/종가선을 원점으로 접어 겹친다.
    // 옛 골격 컴포넌트("rankSkeleton"/"rankSkeletonMinute")는 저장 프리셋에서 sanitizeLayout 이 걷어낸다(맵 패널과 같은 길).
    { idBase: "norm-daily", component: "normDaily", title: "정규화 [일봉]", plane: "eod", render: () => <NormOverlayPanel grain="daily" /> },
    { idBase: "norm-point", component: "normPoint", title: "정규화 [타점]", plane: "eod", render: () => <NormOverlayPanel grain="minute" /> },
    // ⚠ duplicable 아님 — 순서·숨김(wb.pointInfoOrder/Hidden)이 usePointInfoPrefs 의 **전역 단일 소유 키**라
    //   인스턴스-안전화 조건("영속 키 전부 panelId 낟알")을 못 지킨다. 복제하려면 그 저장물 모양부터.
    { idBase: "rank-point", component: "rankPoint", title: "타점 정보", plane: "eod", render: (id) => <PointInfoPanel panelId={id} /> },
    // 테마 순위 — 순위 평면(등락×대금 서수)에 테마 동료를 세우는 순수 시선. 조건화(스냅샷)는 집합 편성 보드의 몫.
    { idBase: "theme-rank", component: "themeRank", title: "테마 순위 [복기]", plane: "eod", duplicable: true, render: (id) => <ThemeRankPanel panelId={id} baseTitle={slotTitleOf(id)} /> },
    // (옛 그룹 목록 패널("groupList")은 2026-09-10 은퇴 — 그룹 편집은 배정 팝오버가 유일 표면.
    //  옛 맵 패널("map")과 같은 길: 저장 프리셋의 그 칸은 sanitizeLayout 이 걷어낸다.)
    { idBase: "hts-news", component: "htsNews", title: "HTS뉴스", plane: "eod", render: () => <NewsPanel plane="replay" /> },
];

const TYPE_BY_BASE = new Map(PANEL_TYPES.map((t) => [t.idBase, t]));

/** 인스턴스 id → 타입. 슬롯 문법이 아니거나 미등록 밑동이면 undefined. */
export function panelTypeOf(id: string): PanelType | undefined {
    const s = parseSlotId(id);
    return s ? TYPE_BY_BASE.get(s.base) : undefined;
}

/** id → 타입. 없으면 던진다 — 코드에 박힌 패널 id 오타를 그 자리에서 드러낸다(옛 panelEntry 의 승계). */
export function requirePanelType(id: string): PanelType {
    const t = panelTypeOf(id);
    if (!t) throw new Error(`unknown panel: ${id}`);
    return t;
}

/** 패널 id 의 플레인(미등록 시 eod 로 폴백). */
export function planeOf(id: string): PanelPlane {
    return panelTypeOf(id)?.plane ?? "eod";
}

/** 인스턴스 라벨 — 슬롯 1 은 타입 제목 그대로, 2+ 는 번호를 단다("차트 2"). 미등록 id 는 id 그대로. */
export function slotTitleOf(id: string): string {
    const s = parseSlotId(id);
    const t = s && TYPE_BY_BASE.get(s.base);
    if (!s || !t) return id;
    return s.n <= 1 ? t.title : `${t.title} ${s.n}`;
}

/**
 * 슬롯 대장 최초 시딩 — 옛 카탈로그(인스턴스 열거)가 늘어놓던 id 전부. 순서가 곧 작업표시줄
 * 칩의 기본 순서다(개편 전과 동일해야 사용자가 쓰던 창이 안 사라진다).
 */
export const SEED_SLOT_IDS: string[] = PANEL_TYPES.flatMap((t) =>
    Array.from({ length: t.seedSlots ?? 1 }, (_, i) => slotIdOf(t.idBase, i + 1)),
);

/** dockview 에 넘길 components 맵 — 카탈로그에서 파생한다(별도 맵을 손으로 유지하지 않는다). */
export function panelComponents(): Record<string, FunctionComponent<IDockviewPanelProps>> {
    const out: Record<string, FunctionComponent<IDockviewPanelProps>> = {};
    for (const t of PANEL_TYPES) out[t.component] ??= (props) => t.render(props.api.id);
    return out;
}
