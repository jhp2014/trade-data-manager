// 이동·확대 제스처 — d3-zoom 을 React 상태로 잇는 얇은 훅.
//
// **왜 손으로 안 짜는가**: 필요한 건 "휠=확대, 드래그=이동"이 아니라 그 주변의 자잘한 것들이다 —
// 브라우저·OS별 휠 delta 단위 정규화, 트랙패드 핀치(ctrlKey 붙은 휠), 터치 두 손가락, 배율 클램핑.
// 손으로 짜면 이 목록의 절반은 나중에 버그로 만난다.
//
// **왜 차트 라이브러리는 아닌가**: 여기 필요한 건 제스처 층뿐이다. 렌더는 React SVG 가 하고(호버·클릭
// 판정이 공짜), 스토어 연동(hoveredPoint·goToPoint)과 팔레트도 이미 이 앱의 것이다. 차트 라이브러리는
// 렌더 루프와 상호작용을 자기가 소유하므로 그 배선 하나하나가 싸움이 된다.
//
// **변환을 그림에 거는 게 아니라 스케일에 건다**(transform 속성 대신 rescaleX/rescaleY).
// SVG transform 으로 확대하면 선이 같이 굵어지고 축 눈금이 확대에 따라 다시 안 찍힌다 — 여기선 축이 곧
// 정보(기준 대비 %)라 그건 그림이 거짓말을 하는 것이다. 소비자는 transform 을 받아 스케일을 다시 만든다.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom";

export interface OverlayZoom {
    transform: ZoomTransform;
    /** 원위치(더블클릭·버튼). d3 내부 상태까지 되돌린다 — setState 만 하면 다음 제스처가 옛 값에서 이어진다. */
    reset: () => void;
    /** 그 화면 좌표를 중심으로 배율만 곱한다 — 뭉친 라벨 뱃지를 눌러 푸는 손짓. */
    scaleAt: (cx: number, cy: number, factor: number) => void;
    /** 확대 중인가 — 원위치 버튼을 조건부로 띄울 때. */
    zoomed: boolean;
}

/**
 * 대상 SVG 에 이동·확대를 붙이고 현재 변환을 낸다.
 * `enabled` 가 false 면 붙이지 않는다(그릴 게 없을 때 빈 화면이 끌려다니지 않게).
 */
export function useOverlayZoom(ref: RefObject<SVGSVGElement | null>, enabled: boolean, scaleExtent: [number, number] = [0.5, 60]): OverlayZoom {
    const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
    const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const [min, max] = scaleExtent;

    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;
        const b = d3zoom<SVGSVGElement, unknown>()
            .scaleExtent([min, max])
            .on("zoom", (ev: D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(ev.transform));
        behavior.current = b;
        const sel = select(el);
        sel.call(b);
        sel.on("dblclick.zoom", null); // 기본 더블클릭(한 단계 확대) 해제 — 여기선 원위치가 더 쓸모 있다
        return () => {
            sel.on(".zoom", null);
            behavior.current = null;
        };
    }, [ref, enabled, min, max]);

    const reset = useCallback(() => {
        const el = ref.current;
        const b = behavior.current;
        if (!el || !b) { setTransform(zoomIdentity); return; }
        select(el).call(b.transform, zoomIdentity);
    }, [ref]);

    // d3 의 scaleBy 를 그대로 쓴다 — 중심 고정 배율은 변환 합성이라 손으로 짜면 부호 하나로 어긋난다.
    const scaleAt = useCallback((cx: number, cy: number, factor: number) => {
        const el = ref.current;
        const b = behavior.current;
        if (!el || !b) return;
        select(el).call(b.scaleBy, factor, [cx, cy]);
    }, [ref]);

    return { transform, reset, scaleAt, zoomed: transform.k !== 1 || transform.x !== 0 || transform.y !== 0 };
}
