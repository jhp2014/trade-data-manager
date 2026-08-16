// 골격 겹쳐 그리기의 **컨트롤 바** — 무엇을 보여줄지 고르는 자리. 그림은 하나도 안 그린다.
//
// SVG 밖이라 **그리는 순서 규약이 없다** — 이 층이 그림 층들보다 먼저 떨어져 나온 이유다(순서가
// 동작인 층은 옮기는 값이 비싸고, 여기는 0이다).
//
// 프롭이 묶음으로 오는 건 우연이 아니다: 흩어진 채로 받으면 스물다섯 개였다. 토글 일곱 개를 한 벌로
// 접고(useOverlayToggles) 나머지도 성격끼리 묶어 줄였다 — 묶음 하나가 곧 "이 바가 말하는 한 가지"다
// (표시 · 캔들 · 집계 · 척도 · 테마 상태).
//
// ## 이 줄의 두 규약 (맵 헤더에서 온 것 — 전 패널 공통으로 가려는 것)
// **① 왼쪽은 손, 오른쪽은 말.** `marginLeft:auto` 앞은 누르는 것(토글)만, 뒤는 읽는 것(선택 배지·개수)만.
//    말이 길어지면 왼쪽이 아니라 **가운데를 먹으며** 자라므로 토글 자리가 안 움직인다.
// **② 자리는 안 사라진다.** 상태에 따라 뜨고 지는 칩을 컨트롤 사이에 두지 않는다 — 하나 뜰 때마다
//    뒤엣것이 통째로 밀려 눈이 줄을 다시 훑는다. 값이 바뀌는 표시는 **자리를 비워 둔 채**(minWidth)
//    글자만 갈고, 개수에 따라 생겼다 없어지는 손잡이는 아예 이 줄에 안 산다(OverlaySelectionBar).
//    grain(일봉/분봉)으로 갈리는 묶음은 예외다 — 패널 정체성이라 마운트 후 안 바뀐다.
import { TextToggle, Dot, ControlBox, PanelHeader } from "../../components/ControlChrome.js";
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

    return (
        <PanelHeader gap={9}>
            {/* 기준 토글은 일봉 전용 — 분봉은 타점 단위(원점=자기 시각 피벗)라 앵커 선택이 소멸했다. */}
            {isDaily && (
                <ControlBox label="기준">
                    <TextToggle active={t.anchor === "last"} onClick={() => t.setAnchor("last")} title="마지막 피벗을 원점으로 — 끝이 한 점으로 정렬(뒤로 퍼짐)">마지막 점</TextToggle>
                    <Dot />
                    <TextToggle active={t.anchor === "first"} onClick={() => t.setAnchor("first")} title="첫 피벗을 원점으로 — 시작점에서 앞으로 퍼짐">첫 점</TextToggle>
                </ControlBox>
            )}
            <ControlBox>
                {!isDaily && (
                    <TextToggle active={onlySelected} onClick={() => setOnlySelected(!onlySelected)}
                        title="골격 패널의 차트 선택만 남긴다 — 일봉에서 무리를 만들고 여기서 분봉 경로를 확인. 선택이 비면 전체">
                        선택만
                    </TextToggle>
                )}
                {isPointUnit && (
                    <TextToggle active={t.showFuture} onClick={() => t.setShowFuture(!t.showFuture)}
                        title="타점 이후(점선 구간)까지 기본 창에 담는다 — 끄면 타점 이전이 화면을 차지한다">
                        미래
                    </TextToggle>
                )}
                <TextToggle active={t.showLevels} onClick={() => t.setShowLevels(!t.showLevels)} title="조사 중인 골격의 기준선·D선을 같은 % 공간에 얹는다" activeColor={PRICE_LINE}>선</TextToggle>
                <TextToggle active={t.showLabels} onClick={() => t.setShowLabels(!t.showLabels)} title="앵커 반대쪽 끝에 종목·날짜 — 뭉치면 개수 뱃지, 눌러서 목록">라벨</TextToggle>
                <TextToggle active={locked} onClick={onToggleLock} title="지금 척도를 붙든다 — 필터를 좁혀도 척도가 안 움직여 전후가 비교된다">척도 고정</TextToggle>
            </ControlBox>
            {/* 캔들 선명도 — **늘 떠 있다**(사용자 확정). 켜져 있을 때만 띄웠더니 캔들을 켜고 끌 때마다
                헤더 폭이 튀었다. 조절할 게 없는 순간이 있어도 자리가 안 움직이는 편이 낫다.
                다른 라벨을 짚는 동안 캔들이 사라지는 건 규칙이라 손잡이를 안 준다. */}
            <ControlBox label="캔들">
                {(["low", "mid", "high"] as const).map((a, i) => (
                    <span key={a} style={{ display: "inline-flex", alignItems: "center" }}>
                        {i > 0 && <Dot />}
                        <TextToggle active={candles.alpha === a} onClick={() => candles.setAlpha(a)}
                            title={a === "low" ? "배경으로만 — 형태 비교가 주인공일 때"
                                : a === "mid" ? "기본"
                                    : "골격선과 같이 읽을 만큼 진하게 — 봉 하나하나를 짚어 볼 때"}>
                            {a === "low" ? "흐리게" : a === "mid" ? "보통" : "진하게"}
                        </TextToggle>
                    </span>
                ))}
            </ControlBox>
            {/* 거래대금은 **하나를 선택했을 때만** — 재료가 그날치 한 벌이라 호버로 끌면 스칠 때마다 왕복이다. */}
            {!isDaily && (
                <ControlBox label="거래대금">
                    <TextToggle active={t.showAmount} onClick={() => t.setShowAmount(!t.showAmount)}
                        title="선을 분 단위로 잘라 그 분의 거래대금을 **굵기**로 싣는다 — 굵은 자리가 터진 자리(전 종목·전 시각 상시)">
                        굵기
                    </TextToggle>
                    <TextToggle active={t.showAmountLabels} onClick={() => t.setShowAmountLabels(!t.showAmountLabels)}
                        title="터진 자리에 분당 거래대금 수치. 전 선이 한 격자에서 겨뤄 한 칸에 제일 큰 하나만 남는다 — 확대하면 작은 것들이 드러나고 축소하면 사라진다">
                        값
                    </TextToggle>
                </ControlBox>
            )}
            {!isDaily && (
                <ControlBox>
                    {/* 캔들은 토글도 표시도 여기 없다 — **선/라벨 클릭**으로 켜고, 상태는 푸터가 말한다.
                        헤더에 두면 켤 때마다 칩이 늘었다 줄었다 해 컨트롤 줄을 매번 다시 훑어야 했다
                        (그때는 줄바꿈까지 나 그림 상자 높이가 튀었다 — 그 절반은 PanelHeader 가 없앴다).
                        푸터는 nowrap+ellipsis 라 무엇을 켜도 자리가 안 움직인다. */}
                    <TextToggle active={t.showTheme} onClick={() => t.setShowTheme(!t.showTheme)}
                        title="선택한 타점의 앞뒤 창 동안 같은 테마 종목들의 분당 종가 경로를 같이 세운다(그 구간에 보드에 떴던 것만, 세로 간격 = 등락률 %p 차이 그대로) — 굵기가 각 종목의 분당 거래대금이다 · 단축키 T">
                        테마
                    </TextToggle>
                    {/* 테마 상태 — 뜨고 지는 대신 **자리를 잡아 두고 글자만** 간다(규약 ②). 셋 중 하나만
                        말하므로 칩도 하나다: 옛 코드는 "3"과 "없음"이 같이 뜰 수 있었다. */}
                    <span style={{ ...themeStatus, minWidth: THEME_STATUS_W }} title={themeStatusTitle(t.showTheme, theme)}>
                        {themeStatusText(t.showTheme, theme)}
                    </span>
                </ControlBox>
            )}
            {/* ── 여기부터 오른쪽은 **말**(규약 ①): 누를 것은 없고, 길어져도 왼쪽 토글을 안 민다. */}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {subjectBadge}
                <span style={count}>
                    {counts.shown}개
                    {counts.population > counts.shown && <span style={{ color: "var(--text-tertiary)" }}> / {counts.population}</span>}
                    {/* 결손은 필터와 별도 표기 — "N/M 차이 = 필터"라는 읽기가 거짓이 되지 않게. */}
                    {counts.missing > 0 && (
                        <span style={{ color: "var(--text-tertiary)" }} title="전일 종가 미수집 — %p 공간의 분모가 없어 그릴 수 없는 타점(필터로 빠진 게 아님)"> · 결손 {counts.missing}</span>
                    )}
                </span>
            </span>
        </PanelHeader>
    );
}

/** 테마 상태 칸의 고정 폭 — 제일 긴 문구("선 하나 선택")가 들어가는 값. 자리가 안 움직이는 게 이 폭의 일이다. */
const THEME_STATUS_W = 62;

function themeStatusText(on: boolean, theme: OverlayThemeStatus): string {
    if (!on) return "";
    if (!theme.hasTarget) return "선 하나 선택";
    if (theme.lineCount === null) return "…";
    return theme.lineCount === 0 ? "없음" : `${theme.lineCount}선`;
}

function themeStatusTitle(on: boolean, theme: OverlayThemeStatus): string {
    if (!on) return "테마를 켜면 여기에 펼쳐진 선 수가 뜬다";
    if (!theme.hasTarget) return "테마는 짚은 하나에만 펼친다 — 여러 날을 겹치면 '이 종목이 혼자 튄 건가'가 흐려진다";
    if (theme.lineCount === 0) return "그 구간에 보드에 뜬 같은 테마 종목이 없거나, 이 종목이 그날 유니버스 밖입니다";
    return "같은 테마 종목의 분당 종가 경로 수";
}

const themeStatus: React.CSSProperties = {
    fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums",
    marginLeft: 2, whiteSpace: "nowrap", flexShrink: 0,
};
const count: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
