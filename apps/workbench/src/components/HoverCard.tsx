// 즉시 뜨는 hover 카드 — 네이티브 title 툴팁의 두 약점(지연·무채색 한 줄)을 대신한다.
// 그룹처럼 **색이 정보인** 상세(groupColor 로 묶임이 읽히는 이름들)를 아이콘 옆에서 바로 보여줄 때 쓴다.
// 포털(fixed)인 이유: 목록 행은 overflow 상자 안이라 안에서 띄우면 패널 경계에 잘린다(ui/popover 판과 같은 이유).
//
// 자리 잡기: 기본은 앵커 좌하단인데, 앵커가 대개 행 오른쪽 끝(배지 자리)이라 그대로 열면 화면 밖이다 —
// **실측 후 넘치는 쪽을 뒤집는다**(판과 같은 계산 ui/popover/place — 어림 반지름이 아니라 실제 카드 크기:
// 그룹 수에 따라 카드 높이가 몇 배씩 달라진다).
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Z_HOVER } from "../ui/popover/layers.js";
import type { PlaceOpts, Rect } from "../ui/popover/place.js";
import { usePlacedTooltip } from "../ui/popover/usePlacedTooltip.js";

const PLACE: PlaceOpts = { side: "below", align: "start", gap: 4, shiftX: 0, overlap: true };

export function HoverCard({ card, children }: {
    /** 카드 내용 — 호출부가 색·구성을 소유한다. */
    card: ReactNode;
    children: ReactNode;
}): JSX.Element {
    const [anchor, setAnchor] = useState<Rect | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    // 첫 프레임은 안 보이게 그려 크기를 재고 자리를 잡는다.
    const pos = usePlacedTooltip(cardRef, anchor, PLACE);

    return (
        <span
            style={{ display: "inline-flex" }}
            onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
            }}
            onMouseLeave={() => setAnchor(null)}
        >
            {children}
            {anchor !== null && createPortal(
                <div ref={cardRef} data-hover-card style={{
                    position: "fixed",
                    left: pos?.left ?? anchor.left,
                    top: pos?.top ?? anchor.bottom + 4,
                    visibility: pos === null ? "hidden" : "visible",
                    zIndex: Z_HOVER, maxWidth: 260, padding: "5px 9px",
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
