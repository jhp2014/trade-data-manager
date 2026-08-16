// 차트 패널 크롬 — 복기(ChartPanel)·실시간(RealtimeChartPanel) 두 패널이 공유하는 껍데기.
// 헤더 줄·본문 2단(일봉/분봉) 레이아웃·토글 버튼이 두 패널에 글자 단위로 같이 있었다. 특히 토글의 긴 title
// 문구는 복사본이 서로 어긋나기 딱 좋은 자리라 문구까지 여기 가둔다. 다른 건 안쪽에 무엇을 끼우느냐뿐이라 슬롯으로.
// 컨트롤은 **선언**으로 내려간다(HeaderControls) — 이 파일은 그 선언을 한자리에 모아 두는 곳이다.
import type { ReactNode } from "react";
import { PanelHeader } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { StockNameCopy } from "../components/StockNameCopy.js";
import { PlaneDot } from "../components/PlaneDot.js";
import { fmtDateKo } from "../lib/date.js";
import type { ChartView, ChartPriceMode } from "../store/workbench.js";
import type { Plane } from "../store/usePlaneBus.js";
import { DRIFT } from "../styles/palette.js";

const ACCENT = "var(--accent-primary)";

// 마커 묶음(연한 배경 + "마커" 라벨)은 사라졌다 — 묶음은 이제 선언의 `group` 이고, 그 이름은
// 헤더가 아니라 더보기 판의 섹션 제목으로 산다(라벨은 헤더에 없다는 규약).

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
    controls,
    storageKey,
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
    /** 이 패널의 컨트롤 선언 — 그리는 일은 HeaderControls 가 한다. */
    controls: readonly ControlSpec[];
    /** 핀(언핀 목록)의 영속 키 — 패널 종류 단위. */
    storageKey: string;
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
            {/* 우상단 컨트롤 — 핀 꽂은 것만 라벨 없이, 나머지는 더보기(⋯) 판에. 오른쪽으로 미는
                marginLeft:auto 는 HeaderControls 가 자기 안에 갖고 있다(패널이 자리를 못 바꾼다). */}
            <HeaderControls controls={controls} storageKey={storageKey} />
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

// ── 컨트롤 선언 ──────────────────────────────────────────────────────────
// 두 차트 패널이 **같은 문구**를 쓰라고 여기 모아 둔다(복사본이 어긋나는 걸 막는 게 이 파일의 목적).
// 그리는 일은 HeaderControls 가 한다 — 라벨 감추기·폭 잠금·순환/팝오버·핀이 전부 거기 규약이다.

/** 영역 전환 — 일봉만 / 분봉만 / 둘 다. 셋이라 순환이다. */
export const viewControl = (view: ChartView, setView: (v: ChartView) => void): ControlSpec => ({
    kind: "choice", id: "view", name: "영역", help: "일봉만 · 분봉만 · 둘 다",
    values: [{ v: "daily", label: "일봉" }, { v: "minute", label: "분봉" }, { v: "both", label: "일봉+분봉" }],
    value: view, set: (v) => setView(v as ChartView),
});

export const pinControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "pinMinute", name: "고정", activeColor: ACCENT,
    help: "분봉을 기준일에 고정(일봉 봉 클릭을 무시한다)",
    on, set: toggle,
});

export const scaleControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "lockScale", name: "스케일", activeColor: ACCENT,
    help: "분봉 시간축 고정 — 종목·날짜를 바꿔도 보던 창을 유지한다",
    on, set: toggle,
});

export const amountMarkerControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "amountMarker", name: "분봉 대금", group: "마커", activeColor: ACCENT,
    help: "분봉 거래대금 마커", on, set: toggle,
});

export const searchLineControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "searchLine", name: "검색 날짜", group: "마커", activeColor: ACCENT,
    help: "검색 날짜 세로선", on, set: toggle,
});

export const guideControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "guide", name: "30%", group: "마커", activeColor: ACCENT,
    help: "+30% 가이드선(검색일 전일종가 기준)", on, set: toggle,
});

/** 기준 시장 — % 의 분모를 KRX↔UN 으로. 값 자체가 표시라 순환이 그대로 맞는다. */
export const marketControl = (mode: ChartPriceMode, setMode: (m: ChartPriceMode) => void): ControlSpec => ({
    kind: "choice", id: "market", name: "기준 시장", help: "% 의 분모가 되는 전일종가를 어느 시장에서 볼까",
    values: [{ v: "krx", label: "KRX" }, { v: "un", label: "UN" }],
    value: mode, set: (v) => setMode(v as ChartPriceMode),
});
