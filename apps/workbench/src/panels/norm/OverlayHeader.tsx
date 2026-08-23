// 정규화 겹치기의 **컨트롤 바** — 무엇을 어떻게 보여줄지 고르는 자리. 그림은 하나도 안 그린다.
//
// ## 이 파일은 **선언만** 한다
// 컨트롤을 JSX 로 손그리지 않는다 — 배열 하나로 선언하고 HeaderControls 가 그린다. 라벨 감추기,
// 폭 잠금, 순환/팝오버 선택, 핀(더보기 판)이 전부 거기 규약이라 패널마다 갈릴 수가 없다.
//
// ## 남은 두 규약 (전 패널 공통)
// **① 왼쪽은 말, 오른쪽은 손.** 왼쪽은 읽는 것(개수·테마 상태), 오른쪽은 상시 컨트롤이다.
// **② 자리는 안 사라진다.** grain(일봉/분봉)으로 갈리는 것만 예외(available — 패널 정체성).
import { memo, useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { PRICE_LINE } from "../../styles/palette.js";
import type { CandlesView } from "./useCandles.js";
import { AUTO_CANDLE_MAX, type DrawMode, type OverlayToggles } from "./useOverlayToggles.js";

/** 화면에 선 수와 그 분모 — "N개 / M · 결손 K". 셋 다 **같은 단위**여야 뺄셈이 성립한다. */
export interface OverlayCounts {
    /** 실제로 그린 선 수. */
    shown: number;
    /** 등록 항목 전체 수(시선 ∪ 고정). */
    population: number;
    /** 재료 결손으로 못 그린 수. */
    missing: number;
}

/** 테마 칩이 말할 세 가지 상태 — 몇 선인지 / 짚은 게 없는지 / 있는데 비었는지. */
export interface OverlayThemeStatus {
    /** 펼쳐진 테마 선 수. null = 아직 안 펼쳐짐(대상 없음 등). */
    lineCount: number | null;
    /** 테마를 펼칠 대상(시선 타점 하나)이 있나. */
    hasTarget: boolean;
}

function OverlayHeaderImpl({ grain, toggles, candles, counts, theme, locked, onToggleLock, pinCount, onClearPins }: {
    grain: "daily" | "minute";
    toggles: OverlayToggles;
    /** 캔들에서 머리글이 쓰는 건 선명도뿐 — CandlesView 통짜를 받으면 호버마다 갈리는 파생이 memo 를 깬다. */
    candles: Pick<CandlesView, "alpha" | "setAlpha">;
    counts: OverlayCounts;
    theme: OverlayThemeStatus;
    /** 척도 고정 — 지금 범위를 붙들어 항목 전후를 비교한다. */
    locked: boolean;
    onToggleLock: () => void;
    /** 고정 슬롯 수 — 비우기 액션의 활성 근거(고정 자체는 라벨 우클릭의 몫이다). */
    pinCount: number;
    onClearPins: () => void;
}): JSX.Element {
    const isDaily = grain === "daily";
    const t = toggles;

    /**
     * 이 패널의 컨트롤 **선언**. ⚠ `id` 는 핀 설정의 영속 키 — 바꾸면 그 컨트롤이 기본 핀으로 돌아간다.
     * ⚠ `available` 은 **grain 분기 전용**(패널 정체성이라 마운트 후 안 바뀐다).
     */
    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "choice", id: "mode", name: "그리기", group: "기준",
            help: `자동 = ${AUTO_CANDLE_MAX}개 이하 캔들, 넘으면 종가선(사용자 확정 — 기본은 캔들)`,
            values: [{ v: "auto", label: "자동" }, { v: "candles", label: "캔들" }, { v: "lines", label: "선" }],
            value: t.mode,
            set: (v) => t.setMode(v as DrawMode),
        },
        {
            kind: "choice", id: "dailyMarket", name: "시장", group: "기준", available: isDaily,
            help: "봉과 원점(전일 종가)이 함께 갈린다",
            values: [{ v: "un", label: "UN" }, { v: "krx", label: "KRX" }],
            value: t.dailyMarket,
            set: (v) => t.setDailyMarket(v === "krx" ? "krx" : "un"),
        },
        {
            kind: "toggle", id: "future", name: "미래", available: !isDaily,
            help: "타점 이후(점선 구간)까지 기본 창에 담는다",
            on: t.showFuture, set: t.setShowFuture,
        },
        {
            kind: "toggle", id: "levels", name: "기준선", label: "선", activeColor: PRICE_LINE,
            help: "시선 항목의 기준선 후보들을 같은 % 공간에 얹는다(최저가가 기준선)",
            on: t.showLevels, set: t.setShowLevels,
        },
        {
            kind: "toggle", id: "labels", name: "라벨",
            help: "선이 잘리는 자리에 종목·날짜 — 뭉치면 개수 뱃지, 눌러서 목록. 클릭=시선 이동 · 우클릭=고정",
            on: t.showLabels, set: t.setShowLabels,
        },
        {
            kind: "toggle", id: "lockScale", name: "척도 고정",
            help: "지금 범위를 붙든다 — 항목을 넣고 빼도 척도가 안 움직여 전후가 비교된다",
            on: locked, set: onToggleLock,
        },
        {
            kind: "action", id: "clearPins", name: "고정 비우기", label: "비우기", group: "기준",
            help: "고정 슬롯 전부 해제(고정 하나는 라벨 우클릭)",
            disabled: pinCount === 0,
            run: onClearPins,
        },
        {
            kind: "choice", id: "candleAlpha", name: "선명도", group: "캔들",
            help: "배경으로만 ↔ 봉 하나하나를 짚어 볼 만큼",
            values: [{ v: "low", label: "흐리게" }, { v: "mid", label: "보통" }, { v: "high", label: "진하게" }],
            value: candles.alpha,
            set: (v) => candles.setAlpha(v as CandlesView["alpha"]),
        },
        {
            kind: "toggle", id: "amountWidth", name: "굵기", group: "거래대금", available: !isDaily,
            help: "선을 분 단위로 잘라 그 분의 거래대금을 굵기로 싣는다 — 굵은 자리가 터진 자리",
            on: t.showAmount, set: t.setShowAmount,
        },
        {
            kind: "toggle", id: "amountLabels", name: "값", group: "거래대금", available: !isDaily,
            help: "터진 자리에 분당 거래대금 수치. 한 칸에 제일 큰 하나만 남는다(확대하면 드러난다)",
            on: t.showAmountLabels, set: t.setShowAmountLabels,
        },
        {
            kind: "toggle", id: "theme", name: "테마", group: "테마", available: !isDaily,
            help: "시선 타점의 앞뒤 창 동안 같은 테마 종목의 분당 종가 경로를 같이 세운다 · 단축키 T",
            on: t.showTheme, set: t.setShowTheme,
        },
    ], [isDaily, t, candles.alpha, candles.setAlpha, locked, onToggleLock, pinCount, onClearPins]);

    return (
        <PanelHeader chrome={false} gap={8}
            style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
            {/* ── 왼쪽은 **말**(이 화면이 무엇을 담고 있나). */}
            <span style={count} title="시선 1(focus 자동 교체) + 고정 N(라벨 우클릭). 결손 = 재료 부족(전일 종가·원점 분봉 미수집)">
                {counts.shown}개
                {counts.population > counts.shown && <span style={{ color: "var(--text-tertiary)" }}> / {counts.population}</span>}
                {counts.missing > 0 && (
                    <span style={{ color: "var(--text-tertiary)" }}> · 결손 {counts.missing}</span>
                )}
            </span>
            {t.showTheme && !isDaily && (
                <span style={themeStatus} title={themeStatusTitle(theme)}>테마 {themeStatusText(theme)}</span>
            )}
            {/* 오른쪽은 손 — marginLeft:auto 는 HeaderControls 가 자기 안에 갖고 있다. */}
            <HeaderControls controls={controls} storageKey={`wb.headerPins.norm.${grain}`} />
        </PanelHeader>
    );
}

/**
 * memo — 이 패널은 호버·팬마다 통째로 다시 렌더되는데 머리글은 그때 바뀌는 게 없다. 프롭이 전부
 * 안정(패널 쪽 useMemo·안정 세터)이라는 전제 위의 최적화다 — 새 프롭을 들일 땐 그쪽도 memo 로.
 */
export const OverlayHeader = memo(OverlayHeaderImpl);

/** 테마가 켜졌을 때 한 마디 — 셋 중 하나만 말한다. */
function themeStatusText(theme: OverlayThemeStatus): string {
    if (!theme.hasTarget) return "타점 하나 선택";
    if (theme.lineCount === null) return "…";
    return theme.lineCount === 0 ? "없음" : `${theme.lineCount}선`;
}

function themeStatusTitle(theme: OverlayThemeStatus): string {
    if (!theme.hasTarget) return "테마는 시선 타점 하나에만 펼친다 — 여러 날을 겹치면 '이 종목이 혼자 튄 건가'가 흐려진다";
    if (theme.lineCount === 0) return "그 구간에 보드에 뜬 같은 테마 종목이 없거나, 이 종목이 그날 유니버스 밖입니다";
    return "같은 테마 종목의 분당 종가 경로 수";
}

const themeStatus: React.CSSProperties = {
    fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap", flexShrink: 0,
};
const count: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
