// 골격 겹쳐 그리기의 **컨트롤 바** — 무엇을 보여줄지 고르는 자리. 그림은 하나도 안 그린다.
//
// SVG 밖이라 **그리는 순서 규약이 없다** — 이 층이 그림 층들보다 먼저 떨어져 나온 이유다(순서가
// 동작인 층은 옮기는 값이 비싸고, 여기는 0이다).
//
// 프롭이 묶음으로 오는 건 우연이 아니다: 흩어진 채로 받으면 스물다섯 개였다. 토글 일곱 개를 한 벌로
// 접고(useOverlayToggles) 나머지도 성격끼리 묶어 줄였다.
//
// ## 이 파일은 이제 **선언만** 한다
// 컨트롤을 JSX 로 손그리지 않는다 — 배열 하나로 선언하고 HeaderControls 가 그린다. 라벨 감추기,
// 폭 잠금, 순환/팝오버 선택, 핀(더보기 판)이 전부 거기 규약이라 패널마다 갈릴 수가 없다.
//
// ## 남은 두 규약 (맵 헤더에서 온 것 — 전 패널 공통으로 가려는 것)
// **① 왼쪽은 손, 오른쪽은 말.** `marginLeft:auto` 앞은 누르는 것만, 뒤는 읽는 것(테마 상태·선택
//    배지·개수)만. 말이 길어지면 왼쪽이 아니라 **가운데를 먹으며** 자라므로 컨트롤 자리가 안 움직인다.
// **② 자리는 안 사라진다.** 개수에 따라 생겼다 없어지는 손잡이는 이 줄에 안 산다(OverlaySelectionBar).
//    grain(일봉/분봉)으로 갈리는 것은 예외 — 패널 정체성이라 마운트 후 안 바뀐다(`available`).
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import type { SkeletonAnchor } from "./skeletonOverlay.js";
import { PRICE_LINE } from "../../styles/palette.js";
import type { CandlesView } from "./useCandles.js";
import type { OverlayToggles } from "./useOverlayToggles.js";

/** 화면에 선 수와 그 분모 — "N개 / M · 결손 K". 셋 다 **같은 단위**여야 뺄셈이 성립한다. */
export interface OverlayCounts {
    /** 실제로 그린 선 수. */
    shown: number;
    /** 필터 전 모집단. */
    population: number;
    /** 재료 결손으로 못 그린 수(필터로 빠진 것과 구분해 표기). */
    missing: number;
}

/** 테마 칩이 말할 세 가지 상태 — 몇 선인지 / 짚은 게 없는지 / 있는데 비었는지. */
export interface OverlayThemeStatus {
    /** 펼쳐진 테마 선 수. null = 아직 안 펼쳐짐(대상 없음 등). */
    lineCount: number | null;
    /** 테마를 펼칠 대상(짚은 선 하나)이 있나. */
    hasTarget: boolean;
}

export function OverlayHeader({ grain, toggles, candles, counts, theme, subjectBadge, onlySelected, setOnlySelected, locked, onToggleLock }: {
    grain: "daily" | "minute";
    toggles: OverlayToggles;
    candles: CandlesView;
    counts: OverlayCounts;
    theme: OverlayThemeStatus;
    /** 선택이 이 패널에 안 보일 때 이유를 말하는 배지(SubjectBadge) — 보이면 null 이 온다. */
    subjectBadge?: React.ReactNode;
    /** "선택만 보기"(분봉 전용) — 패널 로컬 시야라 영속 토글에 안 든다. */
    onlySelected: boolean;
    setOnlySelected: (on: boolean) => void;
    /** 척도 고정 — 지금 범위를 붙들어 필터 전후를 비교한다. */
    locked: boolean;
    onToggleLock: () => void;
}): JSX.Element {
    const isDaily = grain === "daily";
    const isPointUnit = !isDaily;
    const t = toggles;

    /**
     * 이 패널의 컨트롤 **선언**. 그리는 일은 HeaderControls 가 한다 — 순환/팝오버 선택도, 폭 잠금도,
     * 핀도 거기 규약이라 여기서 손댈 게 없다. 여기서 정하는 건 넷뿐이다: 무엇이 있나(id·이름·설명),
     * 어느 묶음인가, 어떤 패널에 있나(available), 그리고 값을 어떻게 읽고 쓰나.
     *
     * ⚠ `id` 는 핀 설정의 영속 키다 — 바꾸면 그 컨트롤이 기본 핀으로 돌아간다.
     * ⚠ `available` 은 **grain 분기 전용**이다(패널 정체성이라 마운트 후 안 바뀐다). 값에 따라 껐다
     *    켰다 하는 데 쓰면 컨트롤 줄이 상태에 따라 출렁인다 — 그걸 없애려고 만든 층이다.
     */
    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "choice", id: "anchor", name: "원점", group: "기준", available: isDaily,
            help: "끝을 맞출까(뒤로 퍼짐) 시작을 맞출까(앞으로 퍼짐)",
            values: [{ v: "last", label: "마지막 점" }, { v: "first", label: "첫 점" }],
            value: t.anchor,
            set: (v) => t.setAnchor(v as SkeletonAnchor),
        },
        {
            kind: "toggle", id: "onlySelected", name: "선택만", available: !isDaily,
            help: "골격 패널의 차트 선택만 남긴다 — 선택이 비면 전체",
            on: onlySelected, set: setOnlySelected,
        },
        {
            kind: "toggle", id: "future", name: "미래", available: isPointUnit,
            help: "타점 이후(점선 구간)까지 기본 창에 담는다",
            on: t.showFuture, set: t.setShowFuture,
        },
        {
            kind: "toggle", id: "levels", name: "기준선·D선", label: "선", activeColor: PRICE_LINE,
            help: "조사 중인 골격의 기준선·D선을 같은 % 공간에 얹는다",
            on: t.showLevels, set: t.setShowLevels,
        },
        {
            kind: "toggle", id: "labels", name: "라벨",
            help: "끝에 종목·날짜 — 뭉치면 개수 뱃지, 눌러서 목록",
            on: t.showLabels, set: t.setShowLabels,
        },
        {
            kind: "toggle", id: "lockScale", name: "척도 고정",
            help: "지금 범위를 붙든다 — 필터를 좁혀도 척도가 안 움직여 전후가 비교된다",
            on: locked, set: onToggleLock,
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
            help: "짚은 타점의 앞뒤 창 동안 같은 테마 종목의 분당 종가 경로를 같이 세운다 · 단축키 T",
            on: t.showTheme, set: t.setShowTheme,
        },
    ], [isDaily, isPointUnit, t, candles.alpha, candles.setAlpha, onlySelected, setOnlySelected, locked, onToggleLock]);

    return (
        <PanelHeader chrome={false} gap={8}
            style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
            {/* ── 왼쪽은 **말**(이 화면이 무엇을 담고 있나). 좁아지면 오른쪽부터 밀려나므로 여기 있는 것이 남는다. */}
            <span style={count}>
                {counts.shown}개
                {counts.population > counts.shown && <span style={{ color: "var(--text-tertiary)" }}> / {counts.population}</span>}
                {/* 결손은 필터와 별도 표기 — "N/M 차이 = 필터"라는 읽기가 거짓이 되지 않게. */}
                {counts.missing > 0 && (
                    <span style={{ color: "var(--text-tertiary)" }} title="전일 종가 미수집 — %p 공간의 분모가 없어 그릴 수 없는 타점(필터로 빠진 게 아님)"> · 결손 {counts.missing}</span>
                )}
            </span>
            {t.showTheme && (
                <span style={themeStatus} title={themeStatusTitle(theme)}>테마 {themeStatusText(theme)}</span>
            )}
            {subjectBadge}
            {/* 오른쪽은 손 — marginLeft:auto 는 HeaderControls 가 자기 안에 갖고 있다. */}
            <HeaderControls controls={controls} storageKey={`wb.headerPins.skeleton.${grain}`} />
        </PanelHeader>
    );
}

/** 테마가 켜졌을 때 한 마디 — 셋 중 하나만 말한다(옛 코드는 "3"과 "없음"이 같이 뜰 수 있었다). */
function themeStatusText(theme: OverlayThemeStatus): string {
    if (!theme.hasTarget) return "선 하나 선택";
    if (theme.lineCount === null) return "…";
    return theme.lineCount === 0 ? "없음" : `${theme.lineCount}선`;
}

function themeStatusTitle(theme: OverlayThemeStatus): string {
    if (!theme.hasTarget) return "테마는 짚은 하나에만 펼친다 — 여러 날을 겹치면 '이 종목이 혼자 튄 건가'가 흐려진다";
    if (theme.lineCount === 0) return "그 구간에 보드에 뜬 같은 테마 종목이 없거나, 이 종목이 그날 유니버스 밖입니다";
    return "같은 테마 종목의 분당 종가 경로 수";
}

const themeStatus: React.CSSProperties = {
    fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap", flexShrink: 0,
};
const count: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
