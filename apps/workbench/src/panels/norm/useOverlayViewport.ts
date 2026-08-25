// 골격 겹쳐 그리기의 **뷰포트 절반** — 값 공간의 경계(bounds)와 화면 상자(box), 그 둘을 잇는
// 스케일·확대(줌)·솎기 간격까지 이 훅이 소유한다. 패널에는 "무엇을 그리나"만 남기고
// "어디에·어느 배율로 그리나"를 전부 여기로 모았다(svgRef·wrapRef 의 주인도 이 훅이다).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import {
    dailyFrame, pointFrame, decimate, decimateStep, clipToX,
    type OverlayBounds,
} from "./overlay.js";
import { AXIS_W, GUTTER_W } from "./gutter.js";
import { TAG_W } from "./anchorDisplay.js";
import { useOverlayZoom, type ZoomRegion } from "./useOverlayZoom.js";

/**
 * 그림 상자 바깥 여백. **오른쪽 한 스트립에 축과 이름이 같이 산다**(사용자 확정):
 * 그림에 붙은 눈금 칸(AXIS_W) + 그 바깥의 이름 거터(GUTTER_W). **왼쪽은 수준선 종류 태그 칸**(TAG_W,
 * 상시 — 토글이 아니라 상수라 폭이 출렁일 일이 없다). 옛 왼쪽 테마 거터 폭은 그림(과거 구간)에 돌아갔다.
 *
 * 거터는 **라벨 토글이 켜져 있을 때만** 자리를 먹는다 — 데이터가 아니라 토글이 정하므로 값이
 * 도착할 때 폭이 출렁이지 않는다(옛 gutter 판정의 규칙 승계).
 */
const PAD = { left: 4 + TAG_W, top: 12, bottom: 24 };

export type Scales = { x: ScaleLinear<number, number>; y: ScaleLinear<number, number> };

export interface OverlayBox { left: number; top: number; width: number; height: number }

export interface OverlayViewport {
    /** 손짓(마퀴·단축키 창·크로스헤어)이 걸리는 그림판 컨테이너. */
    wrapRef: React.MutableRefObject<HTMLDivElement | null>;
    /** 줌 제스처가 붙는 위 SVG. */
    svgRef: React.MutableRefObject<SVGSVGElement | null>;
    size: { w: number; h: number };
    box: OverlayBox;
    /** 값 공간의 창 — **패널 종류만이 정하는 상수**라 마운트 뒤로 안 바뀐다. */
    bounds: OverlayBounds;
    /** 기본 뷰 — 배율·위치를 표준 창으로 되돌린다(창 자체는 원래 안 움직인다). */
    onResetView: () => void;
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
    /** 오른쪽에 이름 거터를 세우나(라벨 토글) — 스트립 폭이 갈린다. */
    gutter: boolean;
    /**
     * 제스처(팬·확대)가 시작될 때 한 번 — 뭉친 라벨 팝오버를 닫는 자리다. d3 가 SVG mousedown 을
     * 삼켜 팝오버의 바깥클릭 감지가 그래프 위에서 안 뜨기 때문(제스처 콜백이 그 자리를 대신한다).
     */
    onGestureStart: () => void;
}): OverlayViewport {
    const { isDaily, gutter, onGestureStart } = args;

    /**
     * ── 창(값 공간) — **패널 종류 하나만이 정하는 상수**다. 일봉 −60~+2일·−60~+40%, 분봉 −60~+10분·±20%p.
     *
     * 예전엔 여기에 항목 목록·로딩 공백·미래 토글이 함께 물려 있었고, 그래서 `boundsKey` 가 수시로
     * 튀며 아래 있던 "창이 바뀌면 줌 원위치" 효과가 **손으로 맞춘 배율을 날렸다**(종목을 바꾸거나
     * 필터로 모수가 잠깐 0이 되기만 해도). 창을 상수로 못 박으면 그 효과가 돌 일 자체가 없어지고,
     * "척도 고정" 토글도 필요 없어진다 — 붙들려 있는 게 기본이다.
     *
     * 선이 없어도 창은 있다(빈 격자를 그린다) — 옛 `null` 은 로딩 한 프레임을 척도 변경으로 둔갑시켰다.
     */
    const bounds = useMemo(() => (isDaily ? dailyFrame() : pointFrame()), [isDaily]);

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

    const padRight = AXIS_W + (gutter ? GUTTER_W : 0);
    const box = { left: PAD.left, top: PAD.top, width: Math.max(0, size.w - PAD.left - padRight), height: Math.max(0, size.h - PAD.top - PAD.bottom) };
    const drawable = box.width > 0 && box.height > 0;

    // 제스처 영역 — 아래 스트립=시간축, **오른쪽** 스트립=% 축(축이 그리로 갔다. 모서리는 시간축 우선).
    // 거터도 그 스트립 안이다: 칩만 포인터를 받고 빈 자리는 세로 확대 손짓으로 남는다.
    const regionOf = useCallback(
        (x: number, y: number): ZoomRegion => (y > box.top + box.height ? "x" : x > box.left + box.width ? "y" : "body"),
        [box.top, box.height, box.left, box.width],
    );
    // 배율·위치의 세션 스코프 — 패널 하나(일봉/분봉)당 한 벌. grain 이 곧 패널 정체성이라 이게 그 단위다.
    const zoomScope = isDaily ? "norm.daily" : "norm.minute";
    const { tx, ty, reset, resetAxis, dragging } = useOverlayZoom(svgRef, drawable, regionOf, onGestureStart, zoomScope);
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


    // 변환은 그림이 아니라 **스케일**에 건다 — 선 굵기가 안 늘어나고 눈금이 확대에 맞춰 다시 찍힌다.
    // 축별 변환 두 벌(tx·ty)이라 가로만 당기고 세로만 당기는 손짓이 성립한다.
    const scales = useMemo<Scales>(() => {
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
        wrapRef, svgRef, size, box, bounds,
        onResetView: reset,
        scales, viewX, view, lineStep, hitStep, themePath,
        dragging, onDoubleClick,
    };
}
