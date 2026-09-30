// 차트 패널 크롬 — 복기(ChartPanel)·실시간(RealtimeChartPanel) 두 패널이 공유하는 껍데기.
// 본문 2단(일봉/분봉) 레이아웃과 **헤더 선언 공장**이 여기다. 토글의 긴 title 문구는 복사본이
// 서로 어긋나기 딱 좋은 자리라 문구까지 여기 가둔다. 그리는 일은 셸(PanelFrame·탭 칩·모음 판)이 한다.
import type { ReactNode } from "react";
import { usePanelHeader } from "../components/header/registry.js";
import type { ControlSpec, InfoSpec } from "../components/header/spec.js";
import { StockNameCopy } from "../components/StockNameCopy.js";
import { PlaneDot } from "../components/PlaneDot.js";
import { fmtDateKo } from "../lib/date.js";
import type { ChartView, ChartPriceMode } from "../store/workbench.js";
import type { Plane } from "../store/usePlaneBus.js";

const ACCENT = "var(--accent-primary)";

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

// ── 헤더 선언 ────────────────────────────────────────────────────────────
/**
 * 차트 헤더 등록 — 종목(신원)·기준일은 정보, 드리프트·기준가 폴백은 일시 알림(오버레이 칩),
 * 원위치는 항해형 컨트롤(드리프트 아니면 흐림 — 자리 고정). 두 플레인이 같은 선언을 쓰고,
 * 플레인 고유 정보(복기 = 큐레이션 배지·그룹 칩 / 실시간 = ● LIVE)는 `extraInfo` 로 끼운다.
 */
export function useChartHeader({
    panelId,
    plane,
    code,
    name,
    anchorDate,
    viewDate,
    drifted,
    baseFallback,
    extraInfo = [],
    controls,
}: {
    panelId: string;
    plane: Plane;
    code: string;
    name: string | null;
    anchorDate: string;
    viewDate: string;
    drifted: boolean;
    /** % 기준가를 못 구해 당일 첫 시가로 폴백(상장일 등) — 두 플레인 공통 경고. */
    baseFallback?: boolean;
    /** 플레인 고유 정보 조각 — 신원(종목·기준일) 뒤에 선다. */
    extraInfo?: readonly InfoSpec[];
    controls: readonly ControlSpec[];
}): void {
    usePanelHeader(panelId, {
        info: [
            {
                id: "stock", name: "종목", help: "지금 보는 종목 — 클릭 = 이름 복사",
                text: () => (code ? (name !== null ? `${name} ${code}` : code) : null),
                renderLine: () => (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {plane === "live" && <PlaneDot plane={plane} />}
                        <StockNameCopy code={code} name={name} style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", flexShrink: 0 }} />
                    </span>
                ),
            },
            {
                id: "anchorDate", name: "기준일", tabular: true,
                help: "이 차트의 기준일 — 전역 시선(보드·탐색판과 같은 날)",
                text: () => (code ? fmtDateKo(anchorDate) : null),
            },
            {
                // 드리프트는 알림, 복귀는 컨트롤(「원위치」) — 알림 칩은 읽는 것이지 손잡이가 아니다.
                id: "drift", name: "검색일 드리프트", transient: true, tabular: true,
                help: "기준일과 다른 날을 보는 중 — 복귀는 「원위치」(모음 판·단축키)",
                text: () => (drifted ? `→ ${fmtDateKo(viewDate)} 보는 중` : null),
            },
            {
                id: "baseFallback", name: "기준가 폴백", transient: true,
                help: "직전 종가 없음 → 당일 첫 시가 기준(% 의 분모)",
                text: () => (baseFallback === true ? "상장일 기준" : null),
            },
            ...extraInfo,
        ],
        controls,
    });
}

/** 옛 badges 슬롯의 승계 — 플레인 고유 JSX 한 덩이를 정보 조각으로. 값 렌더는 첫 줄에서만 쓴다. */
export const badgeInfo = (id: string, name: string, help: string, render: () => ReactNode): InfoSpec => ({
    id, name, help, text: () => null, renderLine: render,
});

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
// 그리는 일은 셸의 위젯 한 벌이 한다 — 폭 잠금·순환/판 갈림·단축키 배지가 전부 거기 규약이다.

/** 영역 전환 — 일봉만 / 분봉만 / 둘 다. 셋이라 순환이다. */
export const viewControl = (view: ChartView, setView: (v: ChartView) => void): ControlSpec => ({
    kind: "choice", id: "view", name: "영역", help: "일봉만 · 분봉만 · 둘 다",
    values: [{ v: "daily", label: "일봉" }, { v: "minute", label: "분봉" }, { v: "both", label: "일봉+분봉" }],
    value: view, set: (v) => setView(v as ChartView),
});

/** 원위치 — 검색일 드리프트 복귀. 항해형(첫 줄 자격) · 드리프트 아니면 사라지지 않고 흐려진다. */
export const resetSearchControl = (drifted: boolean, reset: () => void): ControlSpec => ({
    kind: "action", id: "resetSearch", name: "원위치", nav: true, disabled: !drifted,
    help: "기준일로 복귀 — 검색 날짜 드리프트를 접는다(알림 칩이 그 상태를 말한다)",
    run: () => { reset(); return "기준일로 복귀"; },
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
    kind: "toggle", id: "amountMarker", name: "분봉 대금", activeColor: ACCENT,
    help: "분봉 거래대금 마커", on, set: toggle,
});

/** 상단 앵커 표식(칩 + 봉당 드롭선) — 끄면 칩과 선이 함께 사라진다(무시 칩도 그 안에 있다). */
export const anchorMarkControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "anchorMark", name: "앵커 표식", activeColor: ACCENT,
    help: "기준선·무시 캔들이 어느 봉인지 (상단 칩 + 드롭선)", on, set: toggle,
});

export const searchLineControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "searchLine", name: "검색 날짜", activeColor: ACCENT,
    help: "검색 날짜 세로선", on, set: toggle,
});

export const guideControl = (on: boolean, toggle: () => void): ControlSpec => ({
    kind: "toggle", id: "guide", name: "30%", activeColor: ACCENT,
    help: "+30% 가이드선(검색일 전일종가 기준)", on, set: toggle,
});

/** 기준 시장 — % 의 분모를 KRX↔UN 으로. 값 자체가 표시라 순환이 그대로 맞는다. */
export const marketControl = (mode: ChartPriceMode, setMode: (m: ChartPriceMode) => void): ControlSpec => ({
    kind: "choice", id: "market", name: "기준 시장", help: "% 의 분모가 되는 전일종가를 어느 시장에서 볼까",
    values: [{ v: "krx", label: "KRX" }, { v: "un", label: "UN" }],
    value: mode, set: (v) => setMode(v as ChartPriceMode),
});
