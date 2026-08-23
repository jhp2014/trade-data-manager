// 골격 겹쳐 그리기의 **뷰포트 절반** — 값 공간의 경계(bounds)와 화면 상자(box), 그 둘을 잇는
// 스케일·확대(줌)·솎기 간격까지 이 훅이 소유한다. 패널에는 "무엇을 그리나"만 남기고
// "어디에·어느 배율로 그리나"를 전부 여기로 모았다(svgRef·wrapRef 의 주인도 이 훅이다).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import {
    dailyFrame, pointUnitFrame, decimate, decimateStep, clipToX,
    type OverlayBounds, type OverlayLine,
} from "./overlay.js";
import { useOverlayZoom, type ZoomRegion } from "./useOverlayZoom.js";

/**
 * 그림 상자 바깥 여백. **테마를 켜면 왼쪽이 거터(100px)로 넓어진다**(사용자 확정) — 테마 이름 라벨을
 * 그 안에서 세로로 벌려 전부 읽히게 하려고. 평소엔 y축 눈금만 들어가면 되니 46px 이면 족하다.
 */
const PAD = { right: 14, top: 12, bottom: 24 };
const PAD_LEFT = { plain: 46, gutter: 122 };

export type Scales = { x: ScaleLinear<number, number>; y: ScaleLinear<number, number> };

export interface OverlayBox { left: number; top: number; width: number; height: number }

export interface OverlayViewport {
    /** 손짓(마퀴·단축키 창·크로스헤어)이 걸리는 그림판 컨테이너. */
    wrapRef: React.MutableRefObject<HTMLDivElement | null>;
    /** 줌 제스처가 붙는 위 SVG. */
    svgRef: React.MutableRefObject<SVGSVGElement | null>;
    size: { w: number; h: number };
    box: OverlayBox;
    bounds: OverlayBounds | null;
    /** 척도가 바뀌었나를 한 문자열로 — 뷰포트 원위치·뱃지 접기의 방아쇠. */
    boundsKey: string;
    locked: boolean;
    onToggleLock: () => void;
    scales: Scales | null;
    /** 보이는 x 구간(값 공간) — 자르기의 기준. */
    viewX: { from: number; to: number } | null;
    /** 보이는 값 공간 전체(x·y) - 라벨을 "잘리는 자리"에 세우는 재료(labelAnchorAt). */
    view: OverlayBounds | null;
    /** 배율 기반 솎기 간격 — 보이는 선용 / 히트라인용(굵기 8px 라 4px 간격이면 판정에 지장 없다). */
    lineStep: number;
    hitStep: number;
    /** 선 한 벌을 화면 구간으로 자르고 배율에 맞춰 솎는다(보이는 선·히트라인이 같은 재료를 쓴다). */
    themePath: (points: readonly { x: number; y: number }[], step: number) => readonly { x: number; y: number }[];
    dragging: boolean;
    /** 더블클릭 — **축 스트립에서만, 그 축만** 원위치(사용자 확정). 전체 원위치 버튼은 은퇴했다. */
    onDoubleClick: (e: React.MouseEvent<SVGSVGElement>) => void;
}

export function useOverlayViewport(args: {
    isDaily: boolean;
    showFuture: boolean;
    lines: readonly OverlayLine[];
    /** 왼쪽 여백을 거터로 넓히나 — 판정은 **토글**이 한다(패널 주석 참고: 데이터 도착으로 출렁이지 않게). */
    gutter: boolean;
    /**
     * 제스처(팬·확대)가 시작될 때 한 번 — 뭉친 라벨 팝오버를 닫는 자리다. d3 가 SVG mousedown 을
     * 삼켜 팝오버의 바깥클릭 감지가 그래프 위에서 안 뜨기 때문(제스처 콜백이 그 자리를 대신한다).
     */
    onGestureStart: () => void;
}): OverlayViewport {
    const { isDaily, showFuture, lines, gutter, onGestureStart } = args;

    // ── 척도: 기본 창(뷰마다 다른 규칙) vs 고정(그 순간의 범위를 붙든다 — 필터 좁히기 전후 비교용).
    //  · 일봉 정규화 = 상수 창(−60~+10일 · −60~+40%) — 필터가 바뀌어도 같은 되돌림이 같은 크기로 선다.
    //  · 분봉 타점 %p = 상수 창(−60~+10분 · ±20%p), 미래 토글이면 양의 쪽만 데이터까지.
    const [locked, setLocked] = useState<OverlayBounds | null>(null);
    const autoBounds = useMemo(
        () => (lines.length === 0 ? null : isDaily ? dailyFrame() : pointUnitFrame(lines, 0.01, showFuture)),
        [isDaily, showFuture, lines],
    );
    const bounds = locked ?? autoBounds;
    const onToggleLock = useCallback(
        () => setLocked((l) => (l ? null : autoBounds)),
        [autoBounds],
    );

    const wrapRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => setSize({ w: es[0].contentRect.width, h: es[0].contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const padLeft = gutter ? PAD_LEFT.gutter : PAD_LEFT.plain;
    const box = { left: padLeft, top: PAD.top, width: Math.max(0, size.w - padLeft - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };
    const drawable = bounds !== null && box.width > 0 && box.height > 0;

    // 제스처 영역 — 아래 스트립=시간축, 왼쪽 스트립=% 축(모서리는 시간축 우선). 스트립에선 그 축만 확대된다.
    const regionOf = useCallback(
        (x: number, y: number): ZoomRegion => (y > box.top + box.height ? "x" : x < box.left ? "y" : "body"),
        [box.top, box.height, box.left],
    );
    const { tx, ty, reset, resetAxis, dragging } = useOverlayZoom(svgRef, drawable, regionOf, onGestureStart);
    /**
     * 더블클릭 — **축 스트립에서만, 그 축만** 원위치(사용자 확정). 본문 더블클릭 전체 리셋은 폐기했다:
     * 선·점을 짚다 보면 더블클릭이 섞여 들어가 애써 맞춘 배율이 통째로 날아갔다.
     */
    const onDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>): void => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r) return;
        const region = regionOf(e.clientX - r.left, e.clientY - r.top);
        if (region !== "body") resetAxis(region);
    }, [regionOf, resetAxis]);

    // 척도가 바뀌면(필터 변경 등) 뷰포트를 원위치 — 옛 변환이 남아 빈 공간을 보지 않게.
    const boundsKey = bounds ? `${bounds.minX}|${bounds.maxX}|${bounds.minY}|${bounds.maxY}` : "";
    useEffect(() => { reset(); }, [boundsKey, reset]);

    // 변환은 그림이 아니라 **스케일**에 건다 — 선 굵기가 안 늘어나고 눈금이 확대에 맞춰 다시 찍힌다.
    // 축별 변환 두 벌(tx·ty)이라 가로만 당기고 세로만 당기는 손짓이 성립한다.
    const scales = useMemo<Scales | null>(() => {
        if (!bounds) return null;
        const x = scaleLinear().domain([bounds.minX, bounds.maxX]).range([box.left, box.left + box.width]);
        const y = scaleLinear().domain([bounds.minY, bounds.maxY]).range([box.top + box.height, box.top]);
        return { x: tx.rescaleX(x), y: ty.rescaleY(y) };
    }, [bounds, box.left, box.top, box.width, box.height, tx, ty]);

    /**
     * 배율 기반 점 솎기 — 이동이 뻑뻑해진 원인이 **테마 선을 하루 전체로 넓힌 것**이라(선당 ~720점,
     * 30선 + 히트라인 한 벌 더 = 4만여 점의 좌표 문자열을 이동마다 다시 만든다) 배율에 맞춰 줄인다.
     * 보이는 선은 1px 간격, 히트라인은 굵기가 8px 라 4px 간격이면 판정에 지장이 없다.
     */
    const pxPerMinute = scales ? Math.abs(scales.x(1) - scales.x(0)) : 0;
    const lineStep = decimateStep(pxPerMinute, 1);
    const hitStep = decimateStep(pxPerMinute, 4);
    /**
     * 보이는 x 구간 — 솎기의 **나머지 절반**. 솎기는 축소 쪽만 답한다(확대하면 step 이 1로 돌아와
     * 점이 다시 720개가 되는데 그중 화면에 있는 건 수십 개뿐이다). 잘라내면 확대할수록 오히려 가벼워진다.
     */
    const viewX = useMemo(
        () => (scales ? { from: scales.x.invert(box.left), to: scales.x.invert(box.left + box.width) } : null),
        [scales, box.left, box.width],
    );
    // 보이는 값 공간 전체 - y 는 range 가 뒤집혀 있어(top=max) invert 순서를 맞춘다.
    const view = useMemo<OverlayBounds | null>(
        () => (scales && viewX
            ? { minX: viewX.from, maxX: viewX.to, minY: scales.y.invert(box.top + box.height), maxY: scales.y.invert(box.top) }
            : null),
        [scales, viewX, box.top, box.height],
    );
    const themePath = useCallback(
        (points: readonly { x: number; y: number }[], step: number): readonly { x: number; y: number }[] =>
            decimate(viewX ? clipToX(points, viewX.from, viewX.to) : points, step),
        [viewX],
    );

    return {
        wrapRef, svgRef, size, box, bounds, boundsKey,
        locked: locked !== null, onToggleLock,
        scales, viewX, view, lineStep, hitStep, themePath,
        dragging, onDoubleClick,
    };
}
