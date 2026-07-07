import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// 공용 다이얼로그 — 백드롭 클릭/✕ 로 닫힘. 앱 전체 위 fixed 오버레이.
// width/height 를 주면 프레임 고정(내용이 바뀌어도 창이 안 출렁임) — 설정처럼 화면 전환이 잦은 곳에 쓴다.
export function Dialog({
    title,
    onClose,
    children,
    width,
    height,
    maxWidth = 440,
    padding = 14,
}: {
    title: ReactNode;
    onClose: () => void;
    children: ReactNode;
    width?: number;
    height?: number;
    maxWidth?: number;
    padding?: number;
}): JSX.Element {
    return (
        <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    width,
                    height,
                    minWidth: 300,
                    maxWidth: width ? undefined : maxWidth,
                    background: "var(--bg-primary)",
                    borderRadius: 10,
                    border: "1px solid var(--border-default)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                    font: "13px system-ui, sans-serif",
                    overflow: "hidden",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
                    <button onClick={onClose} title="닫기" style={{ background: "none", color: "var(--text-tertiary)", fontSize: 15, cursor: "pointer", lineHeight: 1 }}>
                        ✕
                    </button>
                </div>
                {/* 고정 높이면 본문이 남는 공간을 채우고 내부에서 스크롤을 관리(overflow:hidden) */}
                <div style={{ flex: 1, minHeight: 0, padding, overflow: height ? "hidden" : "visible" }}>{children}</div>
            </div>
        </div>
    );
}

// 커서 좌표에 뜨는 컨텍스트 팝오버(딤 백드롭 없음) — 우클릭 액션용. 바깥클릭·Esc 로 닫힘.
// 뷰포트 밖으로 나가지 않도록 마운트 후 크기를 재어 화면 안으로 clamp(내용이 늦게 로드돼 커져도 ResizeObserver 로 재보정).
export function AnchoredPopover({
    anchor,
    onClose,
    width,
    children,
}: {
    anchor: { x: number; y: number };
    onClose: () => void;
    width: number;
    children: ReactNode;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.x, top: anchor.y });

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const pad = 8;
        const reposition = (): void => {
            const r = el.getBoundingClientRect();
            setPos({
                left: Math.max(pad, Math.min(anchor.x, window.innerWidth - r.width - pad)),
                top: Math.max(pad, Math.min(anchor.y, window.innerHeight - r.height - pad)),
            });
        };
        reposition();
        const ro = new ResizeObserver(reposition);
        ro.observe(el);
        return () => ro.disconnect();
    }, [anchor.x, anchor.y]);

    useEffect(() => {
        const onDown = (e: MouseEvent): void => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                width,
                zIndex: 200,
                maxHeight: "70vh",
                overflowY: "auto",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                padding: 12,
                font: "13px system-ui, sans-serif",
            }}
        >
            {children}
        </div>
    );
}
