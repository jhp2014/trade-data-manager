import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 패널 헤더에서 **아래로** 열리는 앵커 팝오버 — Popover(작업표시줄 전용, 위로 열림)와 방향·닫힘 규칙이 다르다.
// **바깥 클릭으로 닫히지 않는다**: 필터 조율처럼 팝오버를 열어둔 채 뒤의 보드를 클릭해 결과(흐리게/숨김)를
// 확인하는 워크플로가 본론이라, 바깥 클릭 닫힘은 그 자체로 사고다. 닫기 = Esc · 트리거 재클릭 · children 의 close.
// 내용은 document.body 로 portal — 헤더가 overflow 스크롤이라 그냥 두면 잘린다(Popover 와 같은 이유).
export function HeaderPopover({
    width,
    trigger,
    children,
}: {
    /** 팝오버 고정 폭(px) — 뷰포트 가장자리 클램프 계산에 쓴다. */
    width: number;
    trigger: (open: boolean, toggle: () => void) => ReactNode;
    children: (close: () => void) => ReactNode;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    // 트리거 위치 추적 — 아래로 열림(anchor bottom 아래 6px), 우측 모서리 정렬 + 뷰포트 클램프.
    // 헤더는 가로 스크롤 영역이라 scroll(capture) 도 들어야 앵커를 따라간다.
    useLayoutEffect(() => {
        if (!open) return;
        const place = (): void => {
            const el = anchorRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
            setPos({ top: r.bottom + 6, left });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, width]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    return (
        <div ref={anchorRef} style={{ display: "inline-flex", flexShrink: 0 }}>
            {trigger(open, () => setOpen((v) => !v))}
            {open &&
                pos &&
                createPortal(
                    <div
                        style={{
                            position: "fixed",
                            top: pos.top,
                            left: pos.left,
                            width,
                            maxHeight: Math.max(200, window.innerHeight - pos.top - 12),
                            display: "flex",
                            flexDirection: "column",
                            zIndex: 300,
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-default)",
                            borderRadius: 8,
                            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                            overflow: "hidden",
                        }}
                    >
                        {children(() => setOpen(false))}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
