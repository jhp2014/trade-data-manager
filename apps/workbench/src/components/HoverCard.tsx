// 즉시 뜨는 hover 카드 — 네이티브 title 툴팁의 두 약점(지연·무채색 한 줄)을 대신한다.
// 그룹처럼 **색이 정보인** 상세(groupColor 로 묶임이 읽히는 이름들)를 아이콘 옆에서 바로 보여줄 때 쓴다.
// 포털(fixed)인 이유: 목록 행은 overflow 상자 안이라 안에서 띄우면 패널 경계에 잘린다(HeaderPopover 선례).
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function HoverCard({ card, children }: {
    /** 카드 내용 — 호출부가 색·구성을 소유한다. */
    card: ReactNode;
    children: ReactNode;
}): JSX.Element {
    const [at, setAt] = useState<{ x: number; y: number } | null>(null);
    return (
        <span
            style={{ display: "inline-flex" }}
            onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setAt({ x: r.left, y: r.bottom + 4 });
            }}
            onMouseLeave={() => setAt(null)}
        >
            {children}
            {at !== null && createPortal(
                <div data-hover-card style={{
                    position: "fixed", left: at.x, top: at.y, zIndex: 1000,
                    maxWidth: 260, padding: "5px 9px",
                    background: "var(--bg-primary)", border: "1px solid var(--border-strong)", borderRadius: 5,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.25)", fontSize: 11.5, lineHeight: 1.5,
                    pointerEvents: "none", whiteSpace: "nowrap",
                }}>
                    {card}
                </div>,
                document.body,
            )}
        </span>
    );
}
