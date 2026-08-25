// 이동·확대 제스처 — d3-zoom 을 **축별 변환 두 벌**(tx·ty)로 잇는 훅.
//
// **왜 손으로 안 짜는가**: 필요한 건 "휠=확대, 드래그=이동"이 아니라 그 주변의 자잘한 것들이다 —
// 브라우저·OS별 휠 delta 단위 정규화, 트랙패드 핀치(ctrlKey 붙은 휠), 터치 두 손가락, 배율 클램핑.
// 손으로 짜면 이 목록의 절반은 나중에 버그로 만난다.
//
// **왜 축별 두 벌인가**(사용자 확정 — 차트식): 골격은 시간(x)과 %(y)의 관심 배율이 다르다 —
// 기간을 넓게 보며 되돌림 폭만 당겨 보는 일이 잦다. 단일 변환은 이 손짓이 불가능하다. 손짓은 LWC
// 차트의 것을 그대로 옮긴다: **본문 휠 = 가로만**(커서 중심) · **본문 Shift+휠 = 세로만** · 본문 드래그 =
// 이동 · **y축 스트립 = 세로만 · x축 스트립 = 가로만**(휠이든 드래그든 그 축 확대) ·
// **축 스트립 더블클릭 = 그 축만 원위치**(전체 원위치 버튼은 은퇴 — OverlaySelectionBar 주석).
//
// Shift+휠을 세로에 준 건 축 스트립까지 커서를 옮기지 않고 제자리에서 %를 당기기 위해서다(사용자 요청).
// 처음엔 Ctrl 이었다가 Shift 로 바꿨다(사용자 요청) — Ctrl 은 트랙패드 핀치와 겹치고(브라우저가 핀치를
// ctrlKey 휠로 보낸다) d3 가 ctrlKey 휠에 ×10 을 먹여 감도 보정이 따로 필요했다. Shift 는 둘 다 없다.
// ⚠ **Shift+휠은 브라우저가 deltaY 를 deltaX 로 돌려 보낸다**(Windows/Chrome 의 가로 스크롤 규약) —
//   d3 기본 wheelDelta 는 deltaY 만 읽어 0 이 되므로 wheelDelta 를 직접 준다(아래).
//
// d3-zoom 은 **제스처 정규화만** 맡는다: 내부 단일 변환은 쓰지 않고, 이벤트 간 **델타**(배율비·이동량)를
// 뽑아 시작 지점의 영역(본문/x축/y축)에 따라 두 축 변환에 나눠 싣는다(applyGesture — 순수, 테스트 대상).
// 제스처가 끝날 때마다 내부 변환을 identity 로 되돌려(silent) 내부 배율 클램프가 우리 손짓을 막지 않게 한다.
//
// **변환을 그림에 거는 게 아니라 스케일에 건다**(transform 속성 대신 rescaleX/rescaleY).
// SVG transform 으로 확대하면 선이 같이 굵어지고 축 눈금이 확대에 따라 다시 안 찍힌다 — 여기선 축이 곧
// 정보(기준 대비 %)라 그건 그림이 거짓말을 하는 것이다. 소비자는 tx·ty 를 받아 스케일을 다시 만든다.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useSessionUi } from "../../store/useSessionUi.js";
import { select, pointer } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom";

/** 한 축의 변환 — 배율 k 와 화면 px 이동 t. ZoomTransform 의 축 하나 분량이다. */
export interface AxisTransform {
    k: number;
    t: number;
}

export const AXIS_IDENTITY: AxisTransform = { k: 1, t: 0 };

/** 두 축이 다 원위치인 상태 — **모듈 상수**여야 한다(렌더마다 새 객체를 내면 tx·ty memo 가 매번 깨진다). */
const IDENTITY_AXES: { x: AxisTransform; y: AxisTransform } = { x: AXIS_IDENTITY, y: AXIS_IDENTITY };

/** 제스처가 시작된 영역 — 본문 / 아래 시간축 스트립 / 왼쪽 % 축 스트립. */
export type ZoomRegion = "body" | "x" | "y";

/** 스트립 **드래그**를 배율로 바꾸는 감도 — exp(px × 이 값). 200px 드래그 ≈ e¹ ≈ 2.7배. */
export const DRAG_ZOOM_RATE = 0.005;

/** 축 하나를 포인터 p(화면 px) 기준으로 dk 배 확대(그 지점이 제자리에 남는다). k 는 extent 로 클램프. */
export function zoomAxisAt(a: AxisTransform, dk: number, p: number, extent: readonly [number, number]): AxisTransform {
    const k = Math.max(extent[0], Math.min(extent[1], a.k * dk));
    const eff = k / a.k;
    return { k, t: p - (p - a.t) * eff };
}

/** 축 하나를 화면 px 만큼 이동. */
export const panAxis = (a: AxisTransform, d: number): AxisTransform => ({ k: a.k, t: a.t + d });

/** d3 이벤트 하나에서 뽑은 델타 — 배율비(dk)·이동량(dx,dy)·현재 포인터(px,py). */
export interface GestureDelta {
    dk: number;
    dx: number;
    dy: number;
    px: number;
    py: number;
    /** 이 확대가 Shift+휠에서 왔나 — 본문에서 축을 가른다(세로). 이동에는 뜻이 없다. */
    vertical?: boolean;
}

/**
 * 델타 하나를 영역 규칙에 따라 두 축 변환에 싣는다 — **손짓 규칙의 전부가 이 함수다**(순수).
 *   · body: 휠(dk≠1) = **가로만**(커서 중심) / **Shift+휠 = 세로만**(커서 중심) / 드래그 = 양축 이동
 *   · x 스트립: 휠 = 가로 확대(커서 중심) / 드래그 = 가로 확대(**제스처 시작점** 중심 — 오른쪽으로 당기면 확대)
 *   · y 스트립: 휠 = 세로 확대 / 드래그 = 세로 확대(위로 당기면 확대 — LWC 가격축 손짓)
 * 드래그 확대의 중심이 시작점인 이유: 드래그 중 커서는 계속 움직이므로 커서 중심이면 기준이 흘러다닌다.
 */
export function applyGesture(
    axes: { x: AxisTransform; y: AxisTransform },
    region: ZoomRegion,
    g: GestureDelta,
    start: { x: number; y: number },
    extent: readonly [number, number],
): { x: AxisTransform; y: AxisTransform } {
    const zooming = g.dk !== 1;
    if (region === "body") {
        if (!zooming) return { x: panAxis(axes.x, g.dx), y: panAxis(axes.y, g.dy) };
        return g.vertical
            ? { x: axes.x, y: zoomAxisAt(axes.y, g.dk, g.py, extent) }
            : { x: zoomAxisAt(axes.x, g.dk, g.px, extent), y: axes.y };
    }
    if (region === "x") {
        return zooming
            ? { x: zoomAxisAt(axes.x, g.dk, g.px, extent), y: axes.y }
            : { x: zoomAxisAt(axes.x, Math.exp(g.dx * DRAG_ZOOM_RATE), start.x, extent), y: axes.y };
    }
    return zooming
        ? { x: axes.x, y: zoomAxisAt(axes.y, g.dk, g.py, extent) }
        : { x: axes.x, y: zoomAxisAt(axes.y, Math.exp(-g.dy * DRAG_ZOOM_RATE), start.y, extent) };
}

export interface OverlayZoom {
    /** 가로축 변환 — scaleLinear 에 rescaleX 로 적용한다. */
    tx: ZoomTransform;
    /** 세로축 변환 — rescaleY 로 적용한다. */
    ty: ZoomTransform;
    /** 전체 원위치 — 이제 **손잡이가 아니라 자동**(척도가 바뀌면 뷰포트가 부른다). d3 내부 상태까지
     *  되돌린다 — setState 만 하면 다음 제스처가 옛 값에서 이어진다. */
    reset: () => void;
    /**
     * **한 축만** 원위치 — 축 스트립 더블클릭(사용자 확정). 본문 더블클릭 전체 리셋은 폐기했다:
     * 그림을 짚다 보면 더블클릭이 섞여 들어가 애써 맞춘 배율이 통째로 날아갔다.
     * 축을 겨냥해 눌렀을 때만, 그 축만 되돌리는 게 손짓의 뜻과 맞는다.
     */
    resetAxis: (axis: "x" | "y") => void;
    /** 제스처 진행 중 — 커서를 grab↔grabbing 으로 바꾸는 데 쓴다. */
    dragging: boolean;
}

/**
 * 대상 SVG 에 축별 이동·확대를 붙이고 현재 변환 두 벌을 낸다.
 * `enabled` 가 false 면 붙이지 않는다(그릴 게 없을 때 빈 화면이 끌려다니지 않게).
 */
export function useOverlayZoom(
    ref: RefObject<SVGSVGElement | null>,
    enabled: boolean,
    /** 화면 좌표 → 제스처 영역. 그림 상자(box)가 리사이즈로 변해도 재부착 없이 따라가도록 ref 경유로 읽는다. */
    regionOf: (x: number, y: number) => ZoomRegion,
    /**
     * 제스처가 시작될 때(마우스다운·휠) 한 번. **d3 가 SVG 의 mousedown 을 stopImmediatePropagation 으로
     * 삼키기 때문에** 그래프 위에서는 React onMouseDown 도 document 리스너도 안 뜬다 — 열려 있는 팝오버를
     * 닫는 것 같은 일은 여기서 해야 한다.
     */
    onGestureStart?: () => void,
    /** 축 변환이 사는 세션 스코프 — 재마운트를 건너 이어지는 단위(패널 하나). */
    scopeId: string = "overlay",
    /**
     * 배율 한계. 하한이 넉넉한 이유(0.05): 기본 창이 관심 구간만 담으므로 **창 밖을 보려면 축소가 유일한 길**이다.
     * 0.5 였을 때는 두 배까지만 넓어져 타점 뒤 몇 시간이 창 밖에 남았고, 그걸 이동으로 찾아다녀야 했다(사용자 지적).
     * 축이 독립이라 x 만 크게 빼도 %는 안 눌린다.
     */
    scaleExtent: readonly [number, number] = [0.05, 60],
): OverlayZoom {
    /**
     * 축 변환 — 컴포넌트 useState 가 아니라 **세션 스토어**에 산다. 프리셋 전환은 dockview 재마운트라
     * useState 였을 때는 화면만 바꿔도 애써 맞춘 배율이 날아갔다. 새로고침에는 초기화된다(의도 — 배율은
     * 그때 보던 항목을 겨냥해 맞춘 것이라 다음 날 데이터에 씌우면 어긋난 자리에서 시작한다).
     */
    const [axes, setAxes] = useSessionUi<{ x: AxisTransform; y: AxisTransform }>(scopeId, "axes", IDENTITY_AXES);
    const [dragging, setDragging] = useState(false);
    const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    /** 재영점 중 이벤트 무시 — ref 인 이유: 제스처 end(효과 내부)와 reset(효과 밖) 둘 다 재영점을 한다.
     *  reset 이 이 플래그 없이 transform 을 부르면 start/end 가 그대로 발화해 onGestureStart(팝오버 닫기)와
     *  dragging 토글이 매 bounds 변경(효과의 reset 호출)마다 스퓨리어스하게 돈다. */
    const silentRef = useRef(false);
    const [min, max] = scaleExtent;
    // 콜백은 ref 경유 — 인라인 함수를 의존성에 넣으면 렌더마다 zoom 이 재부착된다(제스처가 끊긴다).
    const startRef = useRef(onGestureStart);
    startRef.current = onGestureStart;
    const regionRef = useRef(regionOf);
    regionRef.current = regionOf;

    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;
        // 제스처 하나 동안의 상태 — 직전 내부 변환(델타의 기준), 시작 지점·영역.
        let prev: ZoomTransform = zoomIdentity;
        let region: ZoomRegion = "body";
        let startPos = { x: 0, y: 0 };
        const extent: readonly [number, number] = [min, max];

        const b = d3zoom<SVGSVGElement, unknown>()
            // 내부 배율은 안 쓴다 — 클램프는 축별로 우리가 한다. 좁게 잡으면 내부 k 가 벽에 닿아 손짓을 먹는다.
            .scaleExtent([1e-9, 1e9])
            // d3 기본 wheelDelta 와 같은 단위 정규화(deltaMode 별 계수)에서 두 가지를 바꾼다:
            //   · Shift+휠은 deltaY 가 0 이고 deltaX 에 실려 온다 → 그걸 읽는다(세로 확대의 재료).
            //   · ctrlKey ×10(핀치 가정)은 뺀다 — Ctrl 은 이제 뜻이 없으니 평휠과 같게.
            .wheelDelta((ev: WheelEvent) => {
                const d = ev.deltaY !== 0 ? ev.deltaY : ev.shiftKey ? ev.deltaX : 0;
                return -d * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.002);
            })
            .on("start", (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
                prev = ev.transform;
                if (silentRef.current) return;
                if (ev.sourceEvent) {
                    const [x, y] = pointer(ev.sourceEvent as Event, el);
                    startPos = { x, y };
                    region = regionRef.current(x, y);
                }
                setDragging(true);
                startRef.current?.();
            })
            .on("zoom", (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
                const t = ev.transform;
                const dk = t.k / prev.k;
                const dx = t.x - prev.x;
                const dy = t.y - prev.y;
                prev = t;
                if (silentRef.current || !ev.sourceEvent) return;
                const [px, py] = pointer(ev.sourceEvent as Event, el);
                const vertical = (ev.sourceEvent as { shiftKey?: boolean }).shiftKey === true;
                setAxes((a) => applyGesture(a, region, { dk, dx, dy, px, py, vertical }, startPos, extent));
            })
            .on("end", (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
                prev = ev.transform;
                if (silentRef.current) return;
                setDragging(false);
                // 제스처마다 내부 변환을 재영점 — 내부 상태는 델타의 재료일 뿐, 누적되게 두면 언젠가 극값에 닿는다.
                silentRef.current = true;
                select(el).call(b.transform, zoomIdentity);
                silentRef.current = false;
                prev = zoomIdentity;
            });
        behavior.current = b;
        const sel = select(el);
        sel.call(b);
        sel.on("dblclick.zoom", null); // 기본 더블클릭(한 단계 확대) 해제 — 여기선 원위치가 더 쓸모 있다
        return () => {
            sel.on(".zoom", null);
            behavior.current = null;
            // 제스처 도중 enabled 가 꺼지면(데이터가 비는 등) end 가 영영 안 온다 — dragging 이 true 로
            // 눌어붙으면 커서가 grabbing 에 갇히고 크로스헤어가 안 돌아온다. 여기서 손으로 내린다.
            setDragging(false);
        };
    }, [ref, enabled, min, max]);

    /** d3 내부 변환을 identity 로 — 진행 중이던 제스처가 옛 내부 값에서 델타를 이어가지 않게.
     *  silent 로 감싼다: 이 transform 호출도 start/zoom/end 를 동기 발화하는데 그건 사용자 손짓이 아니다. */
    const rezero = useCallback(() => {
        const el = ref.current;
        const b = behavior.current;
        if (!el || !b) return;
        silentRef.current = true;
        select(el).call(b.transform, zoomIdentity);
        silentRef.current = false;
    }, [ref]);

    const reset = useCallback(() => {
        setAxes(IDENTITY_AXES);
        rezero();
    }, [rezero]);

    const resetAxis = useCallback((axis: "x" | "y") => {
        setAxes((a) => ({ ...a, [axis]: AXIS_IDENTITY }));
        rezero();
    }, [rezero]);

    // ⚠ 변환은 축 상태에 memo — 매 렌더 새 객체를 내면 소비자의 scales useMemo 가 항상 깨져
    // 그 하류(손잡이·viewX·테마 경로·라벨) 전부가 무관한 렌더마다 다시 돈다.
    const tx = useMemo(() => zoomIdentity.translate(axes.x.t, 0).scale(axes.x.k), [axes.x]);
    const ty = useMemo(() => zoomIdentity.translate(0, axes.y.t).scale(axes.y.k), [axes.y]);

    return {
        tx,
        ty,
        reset,
        resetAxis,
        dragging,
    };
}
