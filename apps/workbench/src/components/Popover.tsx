import { useEffect, useRef, useState, type ReactNode } from "react";

// 경량 팝오버 — 작업표시줄(하단)에서 위로 열린다. 바깥 클릭/Esc 로 닫힘.
// trigger 는 열림상태·토글을 받아 렌더, children 은 닫기 함수를 받아 렌더.
export function Popover({
    trigger,
    children,
}: {
    trigger: (open: boolean, toggle: () => void) => ReactNode;
    children: (close: () => void) => ReactNode;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent): void => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
        <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
            {trigger(open, () => setOpen((v) => !v))}
            {open && (
                <div
                    style={{
                        position: "absolute",
                        bottom: "calc(100% + 6px)",
                        right: 0,
                        zIndex: 200,
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-default)",
                        borderRadius: 8,
                        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                        padding: 8,
                    }}
                >
                    {children(() => setOpen(false))}
                </div>
            )}
        </div>
    );
}
