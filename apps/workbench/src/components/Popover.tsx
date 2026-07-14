import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 경량 팝오버 — 작업표시줄(하단)에서 위로 열린다. 바깥 클릭/Esc 로 닫힘.
// 내용은 document.body 로 portal — 작업표시줄이 overflow:hidden 이라 그냥 두면 위로 열린 팝오버가
// 바에 잘려 안 보인다(기존 버그). trigger 는 열림상태·토글을, children 은 닫기 함수를 받아 렌더.
export function Popover({
    trigger,
    children,
}: {
    trigger: (open: boolean, toggle: () => void) => ReactNode;
    children: (close: () => void) => ReactNode;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);

    // 트리거 위치 추적 — 위로 열림(anchor top 위 6px), 우측 정렬(anchor right). resize/scroll 시 갱신.
    useLayoutEffect(() => {
        if (!open) return;
        const place = (): void => {
            const el = anchorRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setPos({ right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 6 });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent): void => {
            const t = e.target as Node;
            if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return; // 트리거·팝오버 내부 클릭은 유지
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div ref={anchorRef} style={{ display: "inline-flex" }}>
            {trigger(open, () => setOpen((v) => !v))}
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={popRef}
                        style={{
                            position: "fixed",
                            bottom: pos.bottom,
                            right: pos.right,
                            zIndex: 300,
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-default)",
                            borderRadius: 8,
                            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                            padding: 8,
                        }}
                    >
                        {children(() => setOpen(false))}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
