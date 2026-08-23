// 정규화 겹치기의 **그림판** — 층을 쌓는 순서 규약이 이 파일의 본론이다.
//
// ## 그림판은 **세 겹**이다. 층 순서가 뜻을 지므로 캔버스를 그 사이에 끼워야 한다:
//    ① SVG(아래) — 눈금·지시선·좌표축. 그림보다 아래에 깔린다.
//    ② canvas    — 캔들·테마 선·정규화 선(PAINT_ORDER). 노드 0개.
//    ③ SVG(위)   — 손짓(히트라인)과 값(거래대금·기준선). 줌도 여기 붙는다.
// 한 SVG 안에 캔버스를 넣을 수가 없어서(foreignObject 는 위험을 안 살 이유가 없다)
// 셋을 겹쳐 쌓는다 — 문서 순서가 그대로 그리는 순서라 규약이 안 바뀐다.
//
// 그 위로 HTML 층(거터·라벨·크로스헤어)이 문서 순서대로 겹친다.
import { useId, type ComponentProps, type CSSProperties } from "react";
import { polylinePoints, type LabelHandle, type LineVisual, type OverlayLine } from "./overlay.js";
import { LabelLayer } from "./LabelLayer.js";
import { AmountLabels, type AmountLabel } from "./AmountLabels.js";
import { useThemeLabels, type ThemeView } from "./useThemeOverlay.js";
import { CrosshairLayer } from "./CrosshairLayer.js";
import { LevelsLayer, type LevelOwner } from "./LevelsLayer.js";
import { AxisLayer } from "./AxisLayer.js";
import { ThemeGutter, ThemeLeaders, ThemeHit } from "./ThemeLayer.js";
import { CanvasLayers } from "../canvas/CanvasPainter.js";
import type { DrawLayer } from "../canvas/drawList.js";
import type { ReadoutCandidate } from "../canvas/readout.js";
import type { OverlayViewport } from "./useOverlayViewport.js";
import type { CandlesView } from "./useCandles.js";
import type { Inspection } from "./useInspection.js";
import { mutedNote } from "../../components/ControlChrome.js";

export type XUnit = "day" | "min";
export const fmtX = (x: number, unit: XUnit): string => `${Math.round(x)}${unit === "day" ? "일" : "분"}`;

export interface OverlayPlotProps {
    isDaily: boolean;
    xUnit: XUnit;
    loading: boolean;
    /** 그릴 선이 하나도 없나 — 안내 문구가 뜬다(로딩과 구분). */
    linesEmpty: boolean;
    showLabels: boolean;
    viewport: OverlayViewport;
    /** 그림 세 층의 표시목록 — 조립(무엇을 넣나)은 패널의 몫, 펴기(캔버스)는 여기의 몫. */
    paintLayers: DrawLayer[];
    theme: ThemeView;
    themeLabels: ReturnType<typeof useThemeLabels>;
    candles: CandlesView;
    inspection: Inspection;
    byKey: ReadonlyMap<string, OverlayLine>;
    setHovered: (key: string | null) => void;
    handles: readonly LabelHandle[];
    visualOf: (key: string) => { v: LineVisual; color: string };
    nameOf: (code: string) => string;
    isPinnedItem: (line: OverlayLine) => boolean;
    onLabelClick: (s: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    onLabelContext: (s: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    onBadgeOpen: (at: { x: number; y: number }, members: string[]) => void;
    onBadgeHover: (id: string | null) => void;
    /** 패널 안 단축키(t)의 근거 — 포인터가 이 그림판 안에 있나. */
    onHoverPanel: (inside: boolean) => void;
    readoutAt: ((x: number) => ReadoutCandidate[]) | null;
    amountLabels: AmountLabel[];
    levelOwners: LevelOwner[];
    levelsOf: ComponentProps<typeof LevelsLayer>["levelsOf"];
}

export function OverlayPlot(p: OverlayPlotProps): JSX.Element {
    const { viewport, theme, candles, inspection, byKey } = p;
    const { size, box, bounds, scales, dragging } = viewport;
    const themeOverlay = theme.overlay;
    const { singleTarget } = inspection;
    const fmtXAxis = (v: number): string => fmtX(v, p.xUnit);

    /**
     * clipPath id — **인스턴스별**(useId). 일봉·분봉 패널이 한 문서에 같이 떠 있는데 문자열 상수를 쓰면
     * `url(#…)` 이 문서의 **첫** clipPath 로 풀려, 한 패널의 손짓 층이 다른 패널의 상자로 잘렸다.
     */
    const clipId = `norm-overlay-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    return (
        <div ref={viewport.wrapRef} data-plot
            onMouseEnter={() => p.onHoverPanel(true)} onMouseLeave={() => p.onHoverPanel(false)}
            style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
            {p.loading && <div style={muted}>불러오는 중…</div>}
            {!p.loading && p.linesEmpty && (
                <div style={muted}>
                    {p.isDaily ? "겹칠 차트가 없습니다 — 종목을 선택하거나(시선) 라벨 우클릭으로 고정하세요." : "겹칠 타점이 없습니다 — 타점을 고르거나 라벨 우클릭으로 고정하세요."}
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

            {/* ── ② 그림 세 층 — DOM 노드 0개. 무엇을 몇 개 그렸는지는 canvas 의 data-* 로 남는다. */}
            <CanvasLayers layers={p.paintLayers} width={size.w} height={size.h}
                clip={scales && bounds ? box : null} />

            {/* ── ③ SVG(위) — 손짓과 값. 줌 제스처(svgRef)도 여기 붙는다. */}
            <svg ref={viewport.svgRef} width={size.w} height={size.h} onDoubleClick={viewport.onDoubleClick}
                style={{ position: "absolute", inset: 0, cursor: dragging ? "grabbing" : "default", touchAction: "none" }}>
                {scales && bounds && (
                    <>
                        <g clipPath={`url(#${clipId})`}>

                            {/* 테마 히트라인 — 그림 뭉치 **뒤**에 선다. 그림 층은 포인터를 안 받으므로
                                손짓끼리의 우선순위(이것 < 선 히트)는 그대로다. */}
                            {themeOverlay && !theme.swapped ? (
                                <ThemeHit overlay={themeOverlay} hitStep={viewport.hitStep}
                                    pathOf={(pts, step) => polylinePoints(viewport.themePath(pts, step), scales.x, scales.y)}
                                    onHover={theme.setHovered} onToggleCandle={candles.toggle} />
                            ) : (
                                <g data-layer="theme-hit" />
                            )}

                            {/* 시선 선의 히트라인 — 선 위에서 값을 읽는 손짓(판독을 펼치는 방아쇠).
                                **시선 하나만** 포인터를 받는다: 전부 열면 많아질수록 손이 걸리고,
                                그때는 라벨만 손잡이로 남긴다는 게 이 패널의 규약이다(사용자 확정). */}
                            <g data-layer="line-hit">
                            {singleTarget && (
                                <polyline points={polylinePoints(singleTarget.points, scales.x, scales.y)}
                                    fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round"
                                    style={{ pointerEvents: "stroke" }}
                                    onMouseEnter={() => p.setHovered(singleTarget.key)}
                                    onMouseLeave={() => p.setHovered(null)} />
                            )}
                            </g>

                            {/* 거래대금 숫자 — **선×세그먼트당 하나 → 화면 x 격자**로 솎아 살아남은 것들.
                                스왑 중(다른 선을 짚는 중)엔 접는다 — 가리킬 대상이 없어 잡음이 된다. */}
                            <g data-layer="amount-labels">
                                {!theme.swapped && (
                                    <AmountLabels labels={p.amountLabels} colorOf={theme.colorOf} dimmedExcept={theme.hovered} />
                                )}
                            </g>

                            {/* 얹는 선(기준선) — 환산·스타일 규칙은 LevelsLayer 가, **누가 받나**(시선·호버)는
                                패널(levelOwners)이 정한다. */}
                            <LevelsLayer owners={p.levelOwners} levelsOf={p.levelsOf}
                                scaleY={scales.y} box={box} />
                        </g>
                    </>
                )}
            </svg>

            {/* 테마 이름 층 + 넘침 뱃지 목록 — 그림 상자 왼쪽 거터(HTML). */}
            {scales && (
                <ThemeGutter theme={theme} labels={p.themeLabels} box={box} swapped={theme.swapped}
                    isCandleOn={(code) => candles.codes.has(code)} onToggleCandle={candles.toggle} />
            )}

            {/* 라벨 층 — HTML(칩 폭 계산 공짜 + d3 가 SVG mousedown 을 삼키는 문제 회피). 컨테이너는 포인터 통과. */}
            {scales && p.showLabels && (
                <LabelLayer
                    handles={p.handles} byKey={byKey} box={box}
                    themeMode={theme.mode}
                    visualOf={(key) => { const { v, color } = p.visualOf(key); return { selected: v.role === "selected", color }; }}
                    nameOf={p.nameOf}
                    isPinnedItem={p.isPinnedItem}
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
        </div>
    );
}

/** 안내 문구 — 공용 문구 위에 **덮개**만 얹는다(그림 위에 떠서 포인터를 안 먹게). */
const muted: CSSProperties = { ...mutedNote, position: "absolute", inset: 0, pointerEvents: "none" };
