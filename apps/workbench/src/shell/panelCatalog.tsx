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
import { RecentHistoryPanel } from "../panels/RecentHistoryPanel.js";
import { DailyGenPanel } from "../panels/dailyGen/DailyGenPanel.js";
import { DailyExplorePanel } from "../panels/dailyExplore/DailyExplorePanel.js";
import { LabelExplorePanel } from "../panels/labelExplore/LabelExplorePanel.js";
import { NewsPanel } from "../panels/NewsPanel.js";
import { TelegramNewsPanel } from "../panels/TelegramNewsPanel.js";
import { WatchlistPanel } from "../panels/WatchlistPanel.js";
import { LiveTapePanel } from "../panels/liveTape/LiveTapePanel.js";
import { ThemeScopePanel } from "../panels/themeRank/ThemeScopePanel.js";
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
    // (옛 "탐색 후보"(probe, 2026-09-18 작업 대상에 흡수)와 「작업 대상」(workset, 2026-09-27 은퇴 — 탐색판이
    //  접기·우클릭 배정을, 라벨 조건이 라벨 층을 승계)은 없다. 저장 레이아웃의 그 칸은 sanitizeLayout 이
    //  미등록으로 걷어낸다 — 사용자 화면의 그 탭은 다음 로드에 사라진다.)
    { idBase: "history", component: "recentHistory", title: "최근 탐색", plane: "eod", render: () => <RecentHistoryPanel /> },
    // 일별 타점 [생성] — 하루 조건 묶음(집합)이 태어나는 자리(다른 패널은 그 집합을 구독만 한다).
    // 옛 「집합 편성」(2026-09-24 은퇴)의 idBase·component 를 **승계**한다 — 저장 배치·프리셋의 자리가 그대로
    // 새 패널이 되고(테마 [조건]판 선례), 두 패널 공존이 원리적으로 불가능하다. 옛 제목은 패널이 정규화한다.
    { idBase: "filter-funnel", component: "filterFunnel", title: "일별 타점 [생성]", plane: "eod", render: (id) => <DailyGenPanel panelId={id} baseTitle={slotTitleOf(id)} /> },
    // (격자판 「일별 타점[조건: 격자]」은 2026-09-26 은퇴 — 돌파 편집은 조건판 팝오버.
    //  저장 배치·프리셋의 daily-grid 칸은 sanitizeLayout 이 걷는다 — 테마 [조건]판 선례.)
    // 일별 타점 [탐색] — 하루 후보를 날짜 단위로 걷는 뷰(행 = 그날 후보, 열 = 조건 그룹 ●/·).
    // ⚠ duplicable 아님 — w/s 순회(usePublishRowNav)가 **후보 패널 각 1개** 전제의 모듈 전역 단일 소유다
    //   (rowNav 머리 주석). 복제가 필요해지면 rowNav 소유를 인스턴스 낟알로 바꾸는 일이 먼저다.
    { idBase: "daily-explore", component: "dailyExplore", title: "일별 타점 [탐색]", plane: "eod", render: (id) => <DailyExplorePanel panelId={id} baseTitle={slotTitleOf(id)} /> },
    // 라벨 타점 [탐색] — 붙인 라벨을 전 기간 한 목록으로(탐색판의 짝, 2026-09-28). ⚠ duplicable 아님 — w/s 소유(rowNav)가
    // 모듈 전역 단일이고, 열 선택 저장물의 개명 승계가 단일 주소(LABEL_EXPLORE_PANEL_ID)로 쓴다.
    { idBase: "label-explore", component: "labelExplore", title: "라벨 타점 [탐색]", plane: "eod", render: (id) => <LabelExplorePanel panelId={id} baseTitle={slotTitleOf(id)} /> },
    // (종단 트랙 전면 폐기, 2026-09-26 — 시트(rankSheet)·시그널 결과(outcomeRails)·급타점(hotPoints)·
    //  트레이드 시뮬(tradeSim)·타점 정의(pointDef)·정규화 [타점](normPoint) 여섯 판 은퇴. 통계는 나중에
    //  "그룹 → 서버 리포트"로 재설계(decisions 「종단 트랙 전면 폐기」). 저장 배치의 그 칸들은 sanitizeLayout 이 걷는다.)
    // (2026-09-28 — 정규화 [일봉](normDaily)·타점 정보(rankPoint) 은퇴(사용자 판단: 불필요). 저장 배치의 그 칸은 sanitizeLayout 이
    //  걷는다. 남은 설정 키 wb.norm*·wb.pointInfo* 는 읽는 코드가 없어 그대로 둔다 — 청소 장치를 새로 짓지 않는다.)
    // 시장 단면(옛 테마 순위 — 2026-09-26 개명: 실체 = 어느 분의 전 종목 단면 산점 + 테마 동료 강조. id 불변)
    // — 판 하나(옛 조건판/관찰판 이원화 개정): View 전용, 깔때기 테마 조건은 읽기
    // 전용 겹침. 옛 [조건]판(component "themeRank")은 은퇴 — sanitizeLayout 이 저장 배치에서 걷어낸다.
    { idBase: "theme-scope", component: "themeScope", title: "시장 단면", plane: "eod", duplicable: true, render: (id) => <ThemeScopePanel panelId={id} baseTitle={slotTitleOf(id)} /> },
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
