// 차트 패널 크롬 — 복기(ChartPanel)·실시간(RealtimeChartPanel) 두 패널이 공유하는 껍데기.
// 헤더 줄·본문 2단(일봉/분봉) 레이아웃·토글 버튼이 두 패널에 글자 단위로 같이 있었다. 특히 토글의 긴 title
// 문구는 복사본이 서로 어긋나기 딱 좋은 자리라 문구까지 여기 가둔다. 다른 건 안쪽에 무엇을 끼우느냐뿐이라 슬롯으로.
// 헤더 컨트롤 원자(TextToggle·Dot·Sep·ControlGroup·ControlBar)는 components/ControlChrome — 보드 헤더와 공유.
import type { ReactNode } from "react";
import { TextToggle, Dot, ControlGroup, ControlBar, PanelHeader } from "../components/ControlChrome.js";
import { StockNameCopy } from "../components/StockNameCopy.js";
import { PlaneDot } from "../components/PlaneDot.js";
import { fmtDateKo } from "../lib/date.js";
import type { ChartView, ChartPriceMode } from "../store/workbench.js";
import type { Plane } from "../store/usePlaneBus.js";
import { DRIFT } from "../styles/palette.js";

const ACCENT = "var(--accent-primary)";

// 마커 묶음 — 마커 토글들을 연한 배경 한 덩어리로. "마커" 라벨은 그룹에 1회(칩마다 접두 반복 대신).
export function MarkerGroup({ children }: { children: ReactNode }): JSX.Element {
    return (
        <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, background: "var(--bg-tertiary)", borderRadius: 5, padding: "2px 7px" }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>마커</span>
            {children}
        </span>
    );
}

export function PaneLabel({ text }: { text: string }): JSX.Element {
    return (
        <span style={{ position: "absolute", top: 4, left: 8, zIndex: 5, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", background: "var(--bg-primary)", padding: "0 4px", borderRadius: 4, pointerEvents: "none" }}>
            {text}
        </span>
    );
}

export function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13, pointerEvents: "none" }}>
            {text}
        </div>
    );
}

// ── 헤더 ────────────────────────────────────────────────────────────────
/**
 * 종목명 · 기준일 · (드리프트 시) 검색날짜+↺ · 뱃지 · 우측 컨트롤 바.
 * `badges` = 플레인 고유 뱃지 슬롯(복기=타점 유형 / 실시간=● LIVE), `children` = ControlBar 안쪽.
 */
export function ChartHeader({
    plane,
    code,
    name,
    anchorDate,
    viewDate,
    drifted,
    onResetSearch,
    baseFallback,
    badges,
    collapsed,
    onToggleControls,
    children,
}: {
    plane: Plane;
    code: string;
    name: string | null;
    anchorDate: string;
    viewDate: string;
    drifted: boolean;
    onResetSearch: () => void;
    /** % 기준가를 못 구해 당일 첫 시가로 폴백(상장일 등) — 두 플레인 공통 경고. */
    baseFallback?: boolean;
    badges?: ReactNode;
    collapsed: boolean;
    onToggleControls: () => void;
    children: ReactNode;
}): JSX.Element {
    return (
        <PanelHeader style={{ fontSize: 12 }}>
            {plane === "live" && <PlaneDot plane={plane} />}
            <StockNameCopy code={code} name={name} style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", flexShrink: 0 }} />
            <span className="tabular" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDateKo(anchorDate)}</span>
            {drifted && (
                <>
                    <span className="tabular" style={{ color: DRIFT, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>→ {fmtDateKo(viewDate)}</span>
                    <button onClick={onResetSearch} title="기준일로 복귀" aria-label="기준일로 복귀" style={{ border: "none", background: "none", color: DRIFT, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>↺</button>
                </>
            )}
            {badges}
            {baseFallback && <span style={{ color: "var(--warning)", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
            {/* 우상단 경량 컨트롤 — 통째로 접힘(패널별), 폭 부족 시 가로 휠. */}
            <ControlBar collapsed={collapsed} onToggle={onToggleControls}>{children}</ControlBar>
        </PanelHeader>
    );
}

// ── 본문 2단 ─────────────────────────────────────────────────────────────
/**
 * 일봉(상) + 분봉(하). `expanded` 가 null 이면 둘 다(사이 구분선), 아니면 그 하나만.
 * 각 pane 은 차트 노드를 받고 null 이면 빈 안내를 대신 그린다(로딩/데이터없음 판단은 호출자 몫).
 */
export function ChartPanes({
    expanded,
    viewDate,
    dailyTitle,
    minuteTitle,
    daily,
    minute,
    emptyDaily = "일봉 없음",
    emptyMinute = "분봉 없음",
}: {
    expanded: "daily" | "minute" | null;
    viewDate: string;
    dailyTitle: string;
    minuteTitle: string;
    daily: ReactNode | null;
    minute: ReactNode | null;
    emptyDaily?: string;
    emptyMinute?: string;
}): JSX.Element {
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {expanded !== "minute" && (
                <div style={{ flex: 1, minHeight: 0, position: "relative" }} title={dailyTitle}>
                    {daily ?? <Center text={emptyDaily} />}
                </div>
            )}
            {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
            {expanded !== "daily" && (
                <div style={{ flex: 1, minHeight: 0, position: "relative" }} title={minuteTitle}>
                    <PaneLabel text={fmtDateKo(viewDate)} />
                    {minute ?? <Center text={emptyMinute} />}
                </div>
            )}
        </div>
    );
}

// ── 컨트롤 토글 ──────────────────────────────────────────────────────────
interface Toggle {
    on: boolean;
    toggle: () => void;
}

/** 영역 전환 — 일봉만 / 분봉만 / 둘 다(상호배타). */
export function ViewToggles({ view, setView }: { view: ChartView; setView: (v: ChartView) => void }): JSX.Element {
    return (
        <ControlGroup gap={1}>
            <TextToggle active={view === "daily"} onClick={() => setView("daily")} title="일봉만">일봉</TextToggle>
            <Dot />
            <TextToggle active={view === "minute"} onClick={() => setView("minute")} title="분봉만">분봉</TextToggle>
            <Dot />
            <TextToggle active={view === "both"} onClick={() => setView("both")} title="일봉+분봉 둘 다">일봉+분봉</TextToggle>
        </ControlGroup>
    );
}

/** 분봉을 기준일에 고정(일봉 봉 클릭 무시). */
export function PinToggle({ on, toggle }: Toggle): JSX.Element {
    return <TextToggle active={on} activeColor={ACCENT} onClick={toggle} title={on ? "분봉 고정 해제(일봉 클릭 추종)" : "분봉을 기준일에 고정(일봉 클릭 무시)"}>고정</TextToggle>;
}

/** 분봉 시간축 스케일 고정 — 종목/날짜 전환에도 보던 창 유지. */
export function ScaleToggle({ on, toggle }: Toggle): JSX.Element {
    return <TextToggle active={on} activeColor={ACCENT} onClick={toggle} title={on ? "스케일 고정 해제(전환 시 세션 뷰로 리프레임)" : "분봉 시간축 스케일 고정(종목/날짜 전환에도 보던 창 유지)"}>스케일</TextToggle>;
}

export function AmountMarkerToggle({ on, toggle }: Toggle): JSX.Element {
    return <TextToggle active={on} activeColor={ACCENT} onClick={toggle} title={on ? "분봉 거래대금 마커 끄기" : "분봉 거래대금 마커 켜기"}>분봉 대금</TextToggle>;
}

export function SearchLineToggle({ on, toggle }: Toggle): JSX.Element {
    return <TextToggle active={on} activeColor={ACCENT} onClick={toggle} title={on ? "검색 날짜 세로선 숨기기" : "검색 날짜 세로선 표시"}>검색 날짜</TextToggle>;
}

export function GuideToggle({ on, toggle }: Toggle): JSX.Element {
    return <TextToggle active={on} activeColor={ACCENT} onClick={toggle} title={on ? "+30% 가이드선 숨기기" : "+30% 가이드선 표시(검색일 전일종가 기준)"}>30%</TextToggle>;
}

/** 기준 시장 — % 분모를 KRX↔UN 으로. 항상 활성(값 자체가 표시). */
export function MarketToggle({ mode, setMode }: { mode: ChartPriceMode; setMode: (m: ChartPriceMode) => void }): JSX.Element {
    return (
        <TextToggle active activeColor={ACCENT} onClick={() => setMode(mode === "un" ? "krx" : "un")} title={`클릭: 시장 전환 (현재 ${mode.toUpperCase()})`}>
            <span style={{ display: "inline-block", minWidth: 28, textAlign: "center" }}>{mode.toUpperCase()}</span>
        </TextToggle>
    );
}
