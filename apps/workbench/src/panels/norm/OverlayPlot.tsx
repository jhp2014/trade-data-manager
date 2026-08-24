// 정규화 겹치기의 **그림판** — 층을 쌓는 순서 규약이 이 파일의 본론이다.
//
// ## 그림판은 **세 겹**이다. 층 순서가 뜻을 지므로 캔버스를 그 사이에 끼워야 한다:
//    ① SVG(아래) — 지시선·눈금·원점 표식. 그림보다 아래에 깔린다.
//    ② canvas    — 캔들·테마 선·정규화 선(PAINT_ORDER). 노드 0개.
//    ③ SVG(위)   — 손짓(히트라인)과 값(거래대금·기준선). 줌도 여기 붙는다.
// 한 SVG 안에 캔버스를 넣을 수가 없어서(foreignObject 는 위험을 안 살 이유가 없다)
// 셋을 겹쳐 쌓는다 — 문서 순서가 그대로 그리는 순서라 규약이 안 바뀐다.
//
// 그 위로 HTML 층(이름 거터·크로스헤어)이 문서 순서대로 겹친다.
import { useId, type CSSProperties } from "react";
import { polylinePoints } from "./overlay.js";
import { AmountLabels, type AmountLabel } from "./AmountLabels.js";
import { type ThemeView } from "./useThemeOverlay.js";
import { CrosshairLayer } from "./CrosshairLayer.js";
import { LevelsLayer, LevelTags, type LevelRowsView } from "./LevelsLayer.js";
import { AnchorMarksLayer, type MarkGroup } from "./AnchorMarksLayer.js";
import { AxisLayer } from "./AxisLayer.js";
import { Gutter, GutterLeaders, type GutterView } from "./GutterLayer.js";
import { OriginLeader, OriginStack, type OriginStackProps } from "./OriginStack.js";
import { ThemeHit, ThemeOverflowMenu } from "./ThemeLayer.js";
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
    /** 이름 거터를 세우나(라벨 토글) — 끄면 스트립이 눈금 칸만 남는다. */
    showLabels: boolean;
    viewport: OverlayViewport;
    /** 그림 세 층의 표시목록 — 조립(무엇을 넣나)은 패널의 몫, 펴기(캔버스)는 여기의 몫. */
    paintLayers: DrawLayer[];
    theme: ThemeView;
    /** 오른쪽 이름 거터 한 벌 — 칩·지시선이 같은 값을 본다(패널이 조립한다). 일봉은 비어 있다. */
    gutter: GutterView;
    /** 바닥 원점 스택 한 벌(범례 + 원점 표식) — 상자 좌표만 그림판이 채운다. */
    origin: Omit<OriginStackProps, "box">;
    /** 거터를 세우나 — 분봉만(일봉은 눈금 칸만 남는다). */
    showGutter: boolean;
    candles: CandlesView;
    inspection: Inspection;
    setHovered: (key: string | null) => void;
    /** 패널 안 단축키(t)의 근거 — 포인터가 이 그림판 안에 있나. */
    onHoverPanel: (inside: boolean) => void;
    readoutAt: ((x: number) => ReadoutCandidate[]) | null;
    amountLabels: AmountLabel[];
    /** 자리 잡은 수준선 줄들 — 가로선·값 칩(클립 안)과 좌측 태그(클립 밖)가 같은 줄을 본다. */
    levels: LevelRowsView;
    /** 상단 표식 무리(주인별) — 상시. */
    markGroups: readonly MarkGroup[];
}

export function OverlayPlot(p: OverlayPlotProps): JSX.Element {
    const { viewport, theme, candles, inspection } = p;
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
                    {p.isDaily ? "겹칠 차트가 없습니다 — 종목을 선택하거나(시선) 이름 칩을 클릭해 고정하세요." : "겹칠 타점이 없습니다 — 타점을 고르거나 이름 칩을 클릭해 고정하세요."}
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
                        {/* 거터 칩의 지시선 — 클립 밖(거터는 그림 상자 바깥이라 클립하면 사라진다).
                            ⚠ **눈금보다 먼저** 그린다 — 눈금 숫자 칸을 가로지르므로 나중에 그리면
                            점선이 숫자 위에 얹혀 둘 다 못 읽는다(층 순서 테스트가 잡는다). */}
                        {p.showGutter && <GutterLeaders view={p.gutter} box={box} scaleX={scales.x} />}

                        {/* 눈금·원점 0선·사건 표식 — 표기 규칙 전부 AxisLayer 가 소유(절대값 아랫줄 포함). */}
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

                        </g>

                        {/* 얹는 선(기준선·전일 종가선) — 가로선·값 칩은 층 안에서 자기 클립을 걸고,
                            좌측 태그(클립 밖)는 LevelTags 가 같은 줄(rows)로 그린다. **누가 받나**
                            (시선·호버)는 패널이 정한다. */}
                        <LevelsLayer view={p.levels} box={box} clipId={clipId} />
                        <LevelTags view={p.levels} box={box} />

                        {/* 상단 앵커 표식 — 종류 칩 + 봉당 드롭선 하나. 상시(토글 없음). */}
                        <AnchorMarksLayer groups={p.markGroups} scales={scales} box={box} clipId={clipId} />

                        <g clipPath={`url(#${clipId})`}>
                            {/* 원점 세로 점선 — 봉 아래에서 바닥 스택까지(옛 세로축의 후임). */}
                            {p.showLabels && <OriginLeader {...p.origin} box={box} />}
                        </g>
                    </>
                )}
            </svg>

            {/* 이름 거터(HTML) — 내 항목과 테마가 한 목록에 서고, 칩 모양으로 갈린다.
                그림 안엔 글자가 없다(옛 라벨 층 폐지 — 사용자 확정). 컨테이너는 포인터 통과. */}
            {scales && p.showGutter && <Gutter view={p.gutter} box={box} />}

            {/* 바닥 원점 스택 — 범례이자 원점 표식. 일봉·분봉 공통(내용만 갈린다). */}
            {scales && p.showLabels && <OriginStack {...p.origin} box={box} />}

            {/* 거터에서 이름을 못 단 테마 종목 목록 — 넘침 뱃지가 여는 팝오버. */}
            <ThemeOverflowMenu theme={theme} onToggleCandle={candles.toggle} />

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
