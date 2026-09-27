// 떠 있는 판의 몸 — body portal + 껍데기 + 자리(useFitInViewport) + 스택(usePopoverLayer) + 탈착 닫기.
// 입구(AnchoredPopover·TriggerPopover)는 이 위의 얇은 겉면이다. 판을 새로 만들 때 이걸 직접 쓰지 말고
// 입구 둘 중 하나를 쓴다.
//
// **body 로 portal 하는 게 핵심**: dockview 패널이 transform 을 써서 그 안의 position:fixed 는 패널에
// 갇히고, 줄·헤더가 overflow 스크롤이라 안에 두면 잘린다. body 로 옮겨야 좌표가 진짜 뷰포트 기준이다.
import { useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Z_POPOVER } from "./layers.js";
import { pointRect, type PlaceOpts } from "./place.js";
import { PopoverParentProvider, usePopoverLayer } from "./stack.js";
import { useCloseOnDetach, useFitInViewport } from "./useFitInViewport.js";

export type Anchor =
    | { kind: "point"; x: number; y: number }
    | { kind: "element"; ref: RefObject<HTMLElement | null> };

/** 판 표면 표식 — 테스트·외부 판정이 "떠 있는 판"을 찾는 이름. */
export const LAYER_ATTR = "data-popover-layer";

export function FloatingSurface({
    anchor,
    place,
    onClose,
    insideRefs,
    layout = "scroll",
    width,
    minWidth,
    maxWidth,
    padding = 0,
    cap,
    role,
    style,
    children,
}: {
    anchor: Anchor;
    place: PlaceOpts;
    onClose: () => void;
    /** 판 밖이지만 "안"으로 칠 요소(트리거 — 재클릭은 트리거의 토글이 처리한다). */
    insideRefs?: RefObject<Element | null>[];
    /**
     * 몸의 배치 규약 둘:
     *   · "scroll" — 판 자신이 overflowY:auto(내용이 길면 판이 스크롤). 메뉴·편집기.
     *   · "column" — flex column + overflow:hidden. 스크롤은 **자식의 몫**(자식이 min-height 0 으로 줄어든다).
     *     머리·바닥 줄이 고정이고 가운데만 스크롤하는 판(필터 편집 판 등)이 여기 기댄다.
     */
    layout?: "scroll" | "column";
    width?: number;
    minWidth?: number;
    maxWidth?: number;
    padding?: number | string;
    /** 호출자가 원하는 최대 높이 — 화면에 남은 공간과 둘 중 작은 쪽이 걸린다. */
    cap?: number | string;
    role?: string;
    /** 껍데기 위에 덧대는 모양(글자 크기·flex 간격 등). 자리(position·transform·maxHeight)는 못 덮는다. */
    style?: CSSProperties;
    children: ReactNode;
}): JSX.Element {
    const surfaceRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLSpanElement>(null);
    const { id, close } = usePopoverLayer({ surfaceRef, insideRefs, onClose });

    const isPoint = anchor.kind === "point";
    const px = isPoint ? anchor.x : 0;
    const py = isPoint ? anchor.y : 0;
    const elRef = isPoint ? null : anchor.ref;
    const posStyle = useFitInViewport({
        ref: surfaceRef,
        getAnchor: () => {
            if (isPoint) return pointRect(px, py);
            const el = elRef?.current;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        },
        opts: place,
        key: isPoint ? `${px},${py}` : "el",
        cap,
        track: !isPoint,
    });
    // 점 앵커는 호출 자리에 센티널을 남겨 그 자리의 탈착을 본다(요소 앵커는 앵커 자신을 본다).
    useCloseOnDetach(isPoint ? sentinelRef : (elRef as RefObject<Element | null>), close);

    const body: CSSProperties = {
        ...style,
        ...posStyle,
        zIndex: Z_POPOVER,
        boxSizing: "border-box",
        width,
        minWidth,
        maxWidth,
        padding,
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        fontFamily: "var(--font-sans)",
        ...(layout === "column"
            ? { display: "flex", flexDirection: "column", overflow: "hidden" }
            : { overflowY: "auto" }), // border-radius 안쪽으로 클리핑 → padding 0 인 메뉴도 모서리가 안 삐져나온다
    };

    return (
        <>
            {isPoint && <span ref={sentinelRef} hidden />}
            {createPortal(
                <div ref={surfaceRef} role={role} {...{ [LAYER_ATTR]: "" }} style={body}>
                    <PopoverParentProvider value={id}>{children}</PopoverParentProvider>
                </div>,
                document.body,
            )}
        </>
    );
}
