import type { CSSProperties, ReactNode, RefObject } from "react";
import { FloatingSurface } from "./FloatingSurface.js";

/**
 * 좌표(커서)에 뜨는 판 — 열림 상태는 호출자가 쥔다(anchor 가 있으면 연 것). 우클릭 메뉴·클릭 목록·
 * 조건 편집기 공용. 닫기 = 바깥 클릭 · Esc(맨 위 판 하나) · 연 자리가 DOM 에서 떨어짐(탭 전환).
 *
 * placement
 *   · "at"     — 커서 위치에 그대로. 넓은 팝오버(내용 패널)용.
 *   · "beside" — 커서에서 offset 만큼 비껴서. 커서 아래 요소를 안 가리므로 메뉴에 맞다.
 * 어느 쪽이든 안 들어가면 커서 반대편으로 뒤집고, 그래도 안 되면 화면 안으로 민다 — 방향은 처음 열 때
 * 한 번만 고른다(편집 중 판이 자라도 안 뒤집힌다). shiftX 를 주면 가로 비킴만 따로 정한다(음수 = 커서를
 * 살짝 덮는다 — 편집기가 연 자리 위로 붙는 모양).
 */
export function AnchoredPopover({
    anchor,
    onClose,
    width,
    minWidth,
    maxWidth,
    padding = 12,
    maxHeight = "70vh",
    placement = "at",
    offset = 12,
    shiftX,
    role,
    style,
    insideRefs,
    children,
}: {
    anchor: { x: number; y: number };
    onClose: () => void;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
    /** 메뉴처럼 항목이 가장자리까지 차는 내용은 0 (항목이 자기 padding 을 가진다). */
    padding?: number | string;
    maxHeight?: number | string;
    placement?: "at" | "beside";
    offset?: number;
    shiftX?: number;
    role?: string;
    /** 껍데기 위에 덧대는 모양(글자 크기·flex 간격 등). */
    style?: CSSProperties;
    /** 판 밖이지만 "안"으로 칠 요소(판을 여닫는 칩) — 그 위 mousedown 이 판을 먼저 닫아 클릭 토글이 다시 여는 것을 막는다. */
    insideRefs?: RefObject<Element | null>[];
    children: ReactNode;
}): JSX.Element {
    const off = placement === "beside" ? offset : 0;
    return (
        <FloatingSurface
            anchor={{ kind: "point", x: anchor.x, y: anchor.y }}
            place={{ side: "below", align: "start", gap: off, shiftX: shiftX ?? off, overlap: true }}
            onClose={onClose}
            width={width}
            minWidth={minWidth}
            maxWidth={maxWidth}
            padding={padding}
            cap={maxHeight}
            role={role}
            insideRefs={insideRefs}
            style={{ fontSize: 13, ...style }}
        >
            {children}
        </FloatingSurface>
    );
}
