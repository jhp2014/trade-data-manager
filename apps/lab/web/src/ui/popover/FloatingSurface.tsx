// 떠 있는 판의 몸 — body portal + 껍데기 + 자리(useFitInViewport) + 스택(usePopoverLayer) + 탈착 닫기.
// workbench ui/popover/FloatingSurface.tsx 에서 옮겼다(요소 앵커만). 입구는 TriggerPopover 다.
//
// **body 로 portal 하는 게 핵심**: dockview 패널이 transform 을 써서 그 안의 position:fixed 는 패널에
// 갇히고, 헤더 줄이 가로 스크롤이라 안에 두면 잘린다. body 로 옮겨야 좌표가 진짜 뷰포트 기준이다.
import { useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Z_POPOVER } from "./layers.js";
import type { PlaceOpts } from "./place.js";
import { PopoverParentProvider, usePopoverLayer } from "./stack.js";
import { useCloseOnDetach, useFitInViewport } from "./useFitInViewport.js";

/** 판 표면 표식 — 테스트가 "떠 있는 판"을 찾는 이름. */
export const LAYER_ATTR = "data-popover-layer";

export function FloatingSurface({ anchorRef, place, onClose, layout, width, padding, children }: {
    anchorRef: RefObject<HTMLElement | null>;
    place: PlaceOpts;
    onClose: () => void;
    /**
     * 몸의 배치 규약 둘:
     *   · "scroll" — 판 자신이 overflowY:auto(내용이 길면 판이 스크롤).
     *   · "column" — flex column + overflow:hidden. 스크롤은 **자식의 몫**(자식이 min-height 0 으로 줄어든다).
     */
    layout: "scroll" | "column";
    width?: number;
    padding: number;
    children: ReactNode;
}): JSX.Element {
    const surfaceRef = useRef<HTMLDivElement>(null);
    // 앵커(트리거)도 "안"이다 — 트리거 재클릭은 트리거의 토글이 처리한다(바깥으로 세면 닫혔다 곧바로 다시 열린다).
    const { id, close } = usePopoverLayer({ surfaceRef, insideRefs: [anchorRef], onClose });
    const posStyle = useFitInViewport({
        ref: surfaceRef,
        getAnchor: () => {
            const r = anchorRef.current?.getBoundingClientRect();
            return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
        },
        opts: place,
    });
    useCloseOnDetach(anchorRef, close);

    const body: CSSProperties = {
        ...posStyle,
        zIndex: Z_POPOVER,
        boxSizing: "border-box",
        width,
        padding,
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        ...(layout === "column"
            ? { display: "flex", flexDirection: "column", overflow: "hidden" }
            : { overflowY: "auto" }), // border-radius 안쪽으로 클리핑 → padding 0 인 메뉴도 모서리가 안 삐져나온다
    };

    return createPortal(
        <div ref={surfaceRef} {...{ [LAYER_ATTR]: "" }} style={body}>
            <PopoverParentProvider value={id}>{children}</PopoverParentProvider>
        </div>,
        document.body,
    );
}
