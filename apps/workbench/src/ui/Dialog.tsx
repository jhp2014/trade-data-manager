import type { ReactNode } from "react";

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
                    fontFamily: "var(--font-sans)",
                fontSize: 13,
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

// 커서 좌표에 뜨는 판 — 공용층(ui/popover)으로 옮겼다. 기존 import 경로를 살려 둔다.
export { AnchoredPopover } from "./popover/AnchoredPopover.js";
