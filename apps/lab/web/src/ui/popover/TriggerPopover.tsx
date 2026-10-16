// 트리거가 여는 판 — 떠 있는 판(메뉴·헤더 판)은 이 입구로만 띄운다. workbench ui/popover/TriggerPopover.tsx.
// 열림 상태를 스스로 쥐고, 트리거 아래(side="below")나 위("above")에 열리며, 들어가지 않으면 반대편으로 한 번
// 뒤집는다(그 뒤로는 안 뒤집고 내부 스크롤).
// 닫기 = 바깥 클릭 · Esc · 트리거 재클릭 · children 의 close · 트리거가 DOM 에서 떨어짐(탭 전환).
import { useRef, useState, type ReactNode } from "react";
import { FloatingSurface } from "./FloatingSurface.js";

export function TriggerPopover({ width, align = "end", side = "below", layout = "column", padding = 0, trigger, children }: {
    /** 판 폭(px). 안 주면 내용 폭. */
    width?: number;
    /** 트리거의 어느 모서리에 맞출지 — 헤더 오른쪽 버튼이 대다수라 기본 end. 왼쪽 칩은 "start". */
    align?: "start" | "end";
    side?: "below" | "above";
    /** FloatingSurface 의 배치 규약 — 기본 column(스크롤은 자식 몫). */
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
                <FloatingSurface anchorRef={anchorRef} place={{ side, align, gap: 6 }} onClose={close} layout={layout} width={width} padding={padding}>
                    {children(close)}
                </FloatingSurface>
            )}
        </div>
    );
}
