// 골격 겹쳐 그리기의 **그림판** — 층을 쌓는 순서 규약이 이 파일의 본론이다.
//
// ## 그림판은 **세 겹**이다. 층 순서가 뜻을 지므로 캔버스를 그 사이에 끼워야 한다:
//    ① SVG(아래) — 눈금·지시선·좌표축. 그림보다 아래에 깔린다.
//    ② canvas    — 캔들·테마 선·골격선(PAINT_ORDER). 노드 0개.
//    ③ SVG(위)   — 손짓(히트라인·손잡이)과 값(거래대금·기준선). 줌도 여기 붙는다.
// 한 SVG 안에 캔버스를 넣을 수가 없어서(foreignObject 는 위험을 안 살 이유가 없다)
// 셋을 겹쳐 쌓는다 — 문서 순서가 그대로 그리는 순서라 규약이 안 바뀐다.
//
// 그 위로 HTML 층(핀 판독·거터·라벨·마퀴 상자·크로스헤어·선택 작업줄)이 문서 순서대로 겹친다 —
// 역시 문서 순서가 곧 겹침 순서다(크로스헤어 뒤에 작업줄이 오는 이유가 그것이다).
import { useId, type ComponentProps, type CSSProperties } from "react";
import { polylinePoints, type LabelHandle, type LineVisual, type OverlayLine } from "./skeletonOverlay.js";
import { OverlaySelectionBar } from "./OverlaySelectionBar.js";
import { LabelLayer } from "./LabelLayer.js";
import { AmountLabels, type AmountLabel } from "./AmountLabels.js";
import { useThemeLabels, type ThemeView } from "./useThemeOverlay.js";
import { PinReadout, PinVerticals, PivotHandles } from "./PinLayer.js";
import { CrosshairLayer } from "./CrosshairLayer.js";
import { LevelsLayer, type LevelOwner } from "./LevelsLayer.js";
import { AxisLayer } from "./AxisLayer.js";
import { ThemeGutter, ThemeLeaders, ThemeHit } from "./ThemeLayer.js";
import { CanvasLayers } from "./CanvasPainter.js";
import type { DrawLayer } from "./drawList.js";
import type { PlacedRow, ReadoutCandidate } from "./readout.js";
import type { OverlayViewport } from "./useOverlayViewport.js";
import type { CandlesView } from "./useCandles.js";
import type { PivotPins } from "./usePivotPins.js";
import type { Inspection } from "./useInspection.js";
import { mutedNote } from "../../components/ControlChrome.js";

export type XUnit = "day" | "min";
export const fmtX = (x: number, unit: XUnit): string => `${Math.round(x)}${unit === "day" ? "일" : "분"}`;

export interface OverlayPlotProps {
    isDaily: boolean;
    xUnit: XUnit;
    feedLoading: boolean;
    /** 그릴 선이 하나도 없나 — 안내 문구가 뜬다(로딩과 구분). */
    linesEmpty: boolean;
    showLabels: boolean;
    labelAtStart: boolean;
    viewport: OverlayViewport;
    /** 그림 세 층의 표시목록 — 조립(무엇을 넣나)은 패널의 몫, 펴기(캔버스)는 여기의 몫. */
    paintLayers: DrawLayer[];
    theme: ThemeView;
    themeLabels: ReturnType<typeof useThemeLabels>;
    candles: CandlesView;
    pins: PivotPins;
    inspection: Inspection;
    byKey: ReadonlyMap<string, OverlayLine>;
    setHovered: (key: string | null) => void;
    handles: readonly LabelHandle[];
    visualOf: (key: string) => { v: LineVisual; color: string };
    nameOf: (code: string) => string;
    effSelected: ReadonlySet<string>;
    onLabelClick: (s: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    onLabelContext: (s: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    onBadgeOpen: (at: { x: number; y: number }, members: string[]) => void;
    onBadgeHover: (id: string | null) => void;
    /** 패널 안 단축키(t)의 근거 — 포인터가 이 그림판 안에 있나. */
    onHoverPanel: (inside: boolean) => void;
    readoutAt: ((x: number) => ReadoutCandidate[]) | null;
    themeReadingSlots: PlacedRow<ReadoutCandidate>[];
    amountLabels: AmountLabel[];
    levelOwners: LevelOwner[];
    levelsOf: ComponentProps<typeof LevelsLayer>["levelsOf"];
    /** 선택 작업줄의 내용 — 두 채널의 개수·핸들러는 선택 훅에서 온다. */
    selection: ComponentProps<typeof OverlaySelectionBar>["selection"];
}

export function OverlayPlot(p: OverlayPlotProps): JSX.Element {
    const { viewport, theme, candles, pins, inspection, byKey } = p;
    const { size, box, bounds, scales, dragging } = viewport;
    const themeOverlay = theme.overlay;
    const { singleTarget, inspectKey } = inspection;
    const fmtXAxis = (v: number): string => fmtX(v, p.xUnit);

    /**
     * clipPath id — **인스턴스별**(useId). 일봉·분봉 패널이 한 문서에 같이 떠 있는데 문자열 상수를 쓰면
     * `url(#…)` 이 문서의 **첫** clipPath 로 풀려, 한 패널의 손짓 층(테마 히트·피벗 손잡이·기준선·축)이
     * 다른 패널의 상자 사각형으로 잘렸다. useId 의 구분 문자(:, «»)는 CSS url() 에서 못 쓰니 걸러낸다.
     */
    const clipId = `skeleton-overlay-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    // data-plot — 그림판을 찾는 **이름표**. 테스트가 "첫 번째 svg 의 부모"로 찾고 있었는데,
    // 머리글에 아이콘 하나(⋯)가 들어오자 통째로 엉뚱한 곳을 짚었다. 손짓(마퀴·단축키 창)이
    // 걸린 상자라 이름으로 잡는 게 맞다.
    return (
        <div ref={viewport.wrapRef} data-plot
            onMouseEnter={() => p.onHoverPanel(true)} onMouseLeave={() => p.onHoverPanel(false)}
            style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
            {p.feedLoading && <div style={muted}>불러오는 중…</div>}
            {!p.feedLoading && p.linesEmpty && (
                <div style={muted}>
                    {p.isDaily ? "일봉 골격이 그려진 차트가 없습니다." : "분봉 골격 위 타점이 없습니다(필터·선택만 보기·전일 종가 결손에 걸렸을 수도)."}
                </div>
            )}
            {/* ── ① SVG(아래) — 눈금·지시선·좌표축(머리 주석의 세 겹 규약). */}
            <svg width={size.w} height={size.h}
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                <defs>
                    <clipPath id={clipId}><rect x={box.left} y={box.top} width={box.width} height={box.height} /></clipPath>
                </defs>
                {scales && bounds && (
                    <>
                        {/* 테마 라벨의 지시선 — 클립 밖(거터는 그림 상자 바깥이라 클립하면 사라진다).
                            ⚠ **눈금보다 먼저** 그린다 — 눈금 숫자 칸을 가로지르므로 나중에 그리면
                            점선이 숫자 위에 얹혀 둘 다 못 읽는다(층 순서 테스트가 잡는다). */}
                        {!theme.swapped && themeOverlay && (
                            <ThemeLeaders labels={p.themeLabels.named} scales={scales} box={box}
                                colorOf={theme.colorOf} hovered={theme.hovered} />
                        )}

                        {/* 눈금·원점 좌표축 — 표기 규칙 전부 AxisLayer 가 소유(절대값 아랫줄 포함). */}
                        <AxisLayer scales={scales} box={box} sizeH={size.h}
                            fmtX={fmtXAxis} abs={inspection.axisAbs} clipId={clipId} />
                    </>
                )}
            </svg>

            {/* ── ② 그림 세 층 — DOM 노드 0개. 무엇을 몇 개 그렸는지는 canvas 의 data-* 로 남는다
                (캔버스는 devtools 로 안을 못 본다 — 화면 테스트도 그 값으로 빈 화면을 가려낸다). */}
            <CanvasLayers layers={p.paintLayers} width={size.w} height={size.h}
                clip={scales && bounds ? box : null} />

            {/* ── ③ SVG(위) — 손짓과 값. 줌 제스처(svgRef)도 여기 붙는다. */}
            <svg ref={viewport.svgRef} width={size.w} height={size.h} onDoubleClick={viewport.onDoubleClick}
                style={{ position: "absolute", inset: 0, cursor: dragging ? "grabbing" : "default", touchAction: "none" }}>
                {scales && bounds && (
                    <>
                        <g clipPath={`url(#${clipId})`}>

                            {/* 테마 히트라인 — 그림 뭉치 **뒤**에 선다. 그림 층은 포인터를 안 받으므로
                                손짓끼리의 우선순위(핀 세로선 < 이것 < 골격 히트 < 피벗 손잡이)는 그대로다. */}
                            {themeOverlay && !theme.swapped ? (
                                <ThemeHit overlay={themeOverlay} hitStep={viewport.hitStep}
                                    pathOf={(pts, step) => polylinePoints(viewport.themePath(pts, step), scales.x, scales.y)}
                                    onHover={theme.setHovered} onToggleCandle={candles.toggle} />
                            ) : (
                                <g data-layer="theme-hit" />
                            )}

                            {/* 붙잡은 피벗의 세로선 — 테마 값을 펼치는 손잡이.
                                ⚠ **피벗 손잡이보다 먼저** 그린다(PinLayer 머리 주석 — 겪은 버그). */}
                            <PinVerticals xs={themeOverlay ? pins.pinnedXs : []} openX={pins.openReadingX}
                                scales={scales} box={box} onHover={pins.setHoveredPinLine} />

                            {/* 짚은 골격선의 히트라인 — 테마 선과 같은 손짓(선 위에서 값을 읽는다).
                                **선택된 것 하나만** 포인터를 받는다: 전체 골격선을 열면 많아질수록 손이 걸리고,
                                그때는 라벨만 손잡이로 남긴다는 게 이 패널의 규약이다(사용자 확정). */}
                            <g data-layer="line-hit">
                            {singleTarget && (
                                <polyline points={polylinePoints(singleTarget.points, scales.x, scales.y)}
                                    fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round"
                                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                    onClick={() => candles.toggle(singleTarget.stockCode)}
                                    onMouseEnter={() => p.setHovered(singleTarget.key)}
                                    onMouseLeave={() => p.setHovered(null)} />
                            )}
                            </g>

                            {/* ⚠ 그림 위에서 포인터를 받는 것들(히트라인·피벗 손잡이·핀 세로선)엔 **`<title>` 을 두지 않는다**
                                (사용자 요구): 값을 읽으려고 손을 올린 그 자리에 브라우저 툴팁이 떠서 판독을 가린다.
                                조작 안내는 푸터가 한 줄로 답하고, 값은 판독 칩이 답한다.

                                피벗 손잡이 — 포인터를 받는 건 **조사 중인 골격 + 값을 붙잡아 둔 골격**의 점들뿐이다
                                (선은 여전히 순수 그림). 한두 벌뿐이라 뭉쳐서 못 겨냥하는 문제가 없다.
                                핀이 걸린 선까지 넣는 이유: 그 선을 떠난 뒤에도 값이 남는데 손잡이가 사라지면 **뗄 수가 없다**.
                                들어올 때 선 호버도 같이 켠다 — 라벨에서 손이 떠나 조사 대상이 바뀌면 점이 사라져 못 짚는다.
                                클릭 = 그 점의 값 붙잡기/떼기(사용자 확정) — 여럿을 나란히 놓고 볼 수 있다.
                                **맨 위에 그린다** — 위 세로선·아래 선들 어느 것도 이 손잡이를 가리면 안 된다. */}
                            <PivotHandles
                                lines={[...new Set([...(inspectKey ? [inspectKey] : []), ...pins.linesWithPins])]
                                    .map((key) => byKey.get(key))
                                    .filter((s): s is OverlayLine => !!s)}
                                scales={scales}
                                onToggle={pins.toggle}
                                // 들어올 때 선 호버도 같이 켠다 — 라벨에서 손이 떠나 조사 대상이 바뀌면 점이 사라져 못 짚는다.
                                onHover={(at) => { p.setHovered(at?.key ?? null); pins.setHoveredPivot(at); }}
                            />

                            {/* 거래대금 숫자 — **선×세그먼트당 하나 → 화면 x 격자**로 솎아 살아남은 것들.
                                점은 **터진 그 분의 자리**에 정확히 얹히고(표식), 숫자는 그 오른쪽에 선다.
                                점 색이 어느 선 것인지 말한다(좌측 이름 라벨의 점과 같은 색). */}
                            {/* 스왑 중(다른 골격선을 짚는 중)엔 거래대금 숫자도 접는다 — 테마·캔들을 접어 놓고
                                그 숫자들만 남으면 어느 선의 것인지 가리킬 대상이 없어 화면에 뜬 잡음이 된다. */}
                            <g data-layer="amount-labels">
                                {!theme.swapped && (
                                    <AmountLabels labels={p.amountLabels} colorOf={theme.colorOf} dimmedExcept={theme.hovered} />
                                )}
                            </g>

                            {/* 얹는 선(기준선·D선) — 환산·스타일 규칙은 LevelsLayer 가, **누가 받나**(선택·호버)는
                                패널(levelOwners)이 정한다. 다중 선택이면 호버 것만(수십 벌이 겹치므로). */}
                            <LevelsLayer owners={p.levelOwners} levelsOf={p.levelsOf}
                                scaleY={scales.y} box={box} />
                        </g>
                    </>
                )}
            </svg>

            {/* 핀 시각의 판독 — 그 세로선 오른쪽에 크로스헤어 판독과 **같은 모양**으로. */}
            {scales && p.themeReadingSlots.length > 0 && pins.openReadingX !== null && (
                <PinReadout rows={p.themeReadingSlots} x={pins.openReadingX} scales={scales} colorOf={theme.colorOf} />
            )}

            {/* 테마 이름 층 + 넘침 뱃지 목록 — 그림 상자 왼쪽 거터(HTML). */}
            {scales && (
                <ThemeGutter theme={theme} labels={p.themeLabels} box={box} swapped={theme.swapped}
                    isCandleOn={(code) => candles.codes.has(code)} onToggleCandle={candles.toggle} />
            )}

            {/* 라벨 층 — HTML(칩 폭 계산 공짜 + d3 가 SVG mousedown 을 삼키는 문제 회피). 컨테이너는 포인터 통과. */}
            {scales && p.showLabels && (
                <LabelLayer
                    handles={p.handles} byKey={byKey} box={box}
                    labelAtStart={p.labelAtStart}
                    themeMode={theme.mode}
                    visualOf={(key) => { const { v, color } = p.visualOf(key); return { selected: v.role === "selected", color }; }}
                    nameOf={p.nameOf}
                    isCandleOn={(code) => candles.codes.has(code)}
                    canToggleCandle={(s) => (s.kind === "point" || p.isDaily) && p.effSelected.has(s.key) && p.effSelected.size === 1}
                    onLabelClick={p.onLabelClick}
                    onLabelContext={p.onLabelContext}
                    onHover={p.setHovered}
                    onBadgeOpen={p.onBadgeOpen}
                    onBadgeHover={p.onBadgeHover}
                />
            )}

            {/* 크로스헤어 — 자기 상태(마우스 좌표)만 다시 그린다. 부모 렌더에 mousemove 를 태우면
                이동마다 선 수백 개가 재조정된다(분리한 이유). 팬 중엔 숨긴다(사용자 확정). */}
            {scales && !dragging && (
                <CrosshairLayer wrapRef={viewport.wrapRef} scales={scales} box={box} fmtX={fmtXAxis} abs={inspection.axisAbs}
                    readoutAt={p.readoutAt} colorOf={theme.colorOf} />
            )}

            {/* 핀 작업줄 — 붙잡은 값을 통째로 떼는 자리. 헤더가 아니라 대상 옆에 뜬다.
                ⚠ 크로스헤어 **뒤**에 온다: 문서 순서가 곧 겹침 순서라, 앞에 두면 판독 칩이 판 위로 올라온다. */}
            <OverlaySelectionBar selection={p.selection} />
        </div>
    );
}

/** 안내 문구 — 공용 문구 위에 **덮개**만 얹는다(그림 위에 떠서 포인터를 안 먹게). */
const muted: CSSProperties = { ...mutedNote, position: "absolute", inset: 0, pointerEvents: "none" };
