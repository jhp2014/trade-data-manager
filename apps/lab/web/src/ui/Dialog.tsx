// 가운데 뜨는 창 — 어두운 막 + 머리 줄(제목 · ✕) + 내용. workbench ui/Dialog.tsx 의 틀.
// 닫기(막 클릭 · Esc)는 판 스택(usePopoverLayer)이 맡는다 — 창 안에서 연 판이 있으면 Esc 는 그 판부터 닫는다.
// 크기를 고정해 칸을 바꿔도 창이 출렁이지 않고, 내용만 스크롤한다.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PopoverParentProvider, closeAllPopovers, usePopoverLayer } from "./popover/stack.js";
import { Z_DIALOG } from "./popover/layers.js";

export function Dialog({ title, width, height, onClose, children }: { title: string; width: number; height: number; onClose: () => void; children: ReactNode }): JSX.Element {
    const surfaceRef = useRef<HTMLDivElement>(null);
    // 창 밖에 떠 있던 판(경로 날짜 판·패널 컨트롤 판)은 닫는다 — 판이 막 위에 남아, 누르면 창이 닫힌다.
    // 판 스택에 오르기(usePopoverLayer) 전에 돈다(같은 커밋의 layout effect 는 선언 순).
    useLayoutEffect(() => closeAllPopovers(), []);
    const { id, close } = usePopoverLayer({ surfaceRef, onClose });
    return createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: Z_DIALOG, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div
                ref={surfaceRef}
                role="dialog"
                aria-label={title}
                style={{
                    width, height, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column",
                    background: "var(--bg-primary)", color: "var(--text-primary)", borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.3)", overflow: "hidden", fontSize: 12,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                    <b style={{ flex: 1, fontSize: 13 }}>{title}</b>
                    <button title="닫기 (Esc)" onClick={close} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "var(--text-3)", padding: "0 4px" }}>
                        ✕
                    </button>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                    <PopoverParentProvider value={id}>{children}</PopoverParentProvider>
                </div>
            </div>
        </div>,
        document.body,
    );
}
