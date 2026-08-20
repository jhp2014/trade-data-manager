// 즉시 뜨는 hover 카드 — 네이티브 title 툴팁의 두 약점(지연·무채색 한 줄)을 대신한다.
// 그룹처럼 **색이 정보인** 상세(groupColor 로 묶임이 읽히는 이름들)를 아이콘 옆에서 바로 보여줄 때 쓴다.
// 포털(fixed)인 이유: 목록 행은 overflow 상자 안이라 안에서 띄우면 패널 경계에 잘린다(HeaderPopover 선례).
//
// 자리 잡기: 기본은 앵커 좌하단인데, 앵커가 대개 행 오른쪽 끝(배지 자리)이라 그대로 열면 화면 밖이다 —
// **실측 후 넘치는 쪽을 뒤집는다**(오른쪽 넘침 → 왼쪽으로, 아래 넘침 → 위로). 어림 반지름이 아니라
// 실제 카드 크기로 재는 이유: 그룹 수에 따라 카드 높이가 몇 배씩 달라진다(세로 나열).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const MARGIN = 6;

export function HoverCard({ card, children }: {
    /** 카드 내용 — 호출부가 색·구성을 소유한다. */
    card: ReactNode;
    children: ReactNode;
}): JSX.Element {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // 첫 프레임은 안 보이게 그려 크기를 재고, 넘치는 축만 반대쪽으로 뒤집어 앉힌다.
    useLayoutEffect(() => {
        if (anchor === null) { setPos(null); return; }
        const el = cardRef.current;
        if (!el) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left = anchor.left;
        if (left + w > window.innerWidth - MARGIN) left = Math.max(MARGIN, anchor.right - w);
        let top = anchor.bottom + 4;
        if (top + h > window.innerHeight - MARGIN) top = Math.max(MARGIN, anchor.top - h - 4);
        setPos({ left, top });
    }, [anchor]);

    return (
        <span
            style={{ display: "inline-flex" }}
            onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => { setAnchor(null); setPos(null); }}
        >
            {children}
            {anchor !== null && createPortal(
                <div ref={cardRef} data-hover-card style={{
                    position: "fixed",
                    left: pos?.left ?? anchor.left,
                    top: pos?.top ?? anchor.bottom + 4,
                    visibility: pos === null ? "hidden" : "visible",
                    zIndex: 1000, maxWidth: 260, padding: "5px 9px",
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
