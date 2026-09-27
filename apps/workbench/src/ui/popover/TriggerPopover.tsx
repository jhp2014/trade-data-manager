import { useRef, useState, type ReactNode } from "react";
import { FloatingSurface } from "./FloatingSurface.js";

/**
 * 트리거가 여는 판 — 열림 상태를 스스로 쥔다. 트리거 요소 아래(side="below")나 위("above")에 열리고,
 * 들어가지 않으면 반대편으로 한 번 뒤집는다(그 뒤로는 안 뒤집고 내부 스크롤).
 * 닫기 = 바깥 클릭 · Esc · 트리거 재클릭 · children 의 close · 트리거가 DOM 에서 떨어짐(탭 전환).
 *
 * 패널 헤더 컨트롤(아래로, 헤더 우측이 대다수라 기본 end 정렬)과 작업표시줄(위로)이 같이 쓴다.
 */
export function TriggerPopover({
    width,
    align = "end",
    side = "below",
    layout = "column",
    padding = 0,
    trigger,
    children,
}: {
    /** 판 폭(px). 안 주면 내용 폭. */
    width?: number;
    /** 트리거의 어느 모서리에 맞출지. 좌측 컨트롤은 "start". */
    align?: "start" | "end";
    side?: "below" | "above";
    /** FloatingSurface 의 배치 규약 — 기본 column(스크롤은 자식 몫, 옛 HeaderPopover 규약). */
    layout?: "scroll" | "column";
    padding?: number;
    trigger: (open: boolean, toggle: () => void) => ReactNode;
    children: (close: () => void) => ReactNode;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const close = (): void => setOpen(false);
    return (
        <div ref={anchorRef} style={{ display: "inline-flex", flexShrink: 0 }}>
            {trigger(open, () => setOpen((v) => !v))}
            {open && (
                <FloatingSurface
                    anchor={{ kind: "element", ref: anchorRef }}
                    place={{ side, align, gap: 6, shiftX: 0, overlap: false }}
                    onClose={close}
                    insideRefs={[anchorRef]}
                    layout={layout}
                    width={width}
                    padding={padding}
                >
                    {children(close)}
                </FloatingSurface>
            )}
        </div>
    );
}
