// 판 안 메뉴 줄 — workbench ui/popover/menu.tsx 의 MenuItem(쓰는 만큼만). 경로 칩 메뉴와 긴 택1 판이 같이 쓴다.
// 모양: 11.5px · 줄은 판 가장자리에서 4px 들어간 둥근 면 · 테두리 없음. 상태 표식은 **왼쪽 고정 칸**(●○ 하나 고르기)이라
// 표식이 바뀌어도 글자가 안 밀린다. 배경(마우스 올림·고른 줄)은 CSS(.menu-item, styles.css)만 칠한다 — 인라인 배경은 :hover 를 이긴다.
import type { ReactNode } from "react";

/** 메뉴를 담는 판의 padding — 줄이 좌우 4px 를 제 margin 으로 가지므로 위아래만. */
export const MENU_PAD = "4px 0";

export function MenuItem({ onClick, children, mark, on = false, selected = false, title }: {
    onClick: () => void;
    children: ReactNode;
    /** 왼쪽 표식 칸 — radio = 하나 고르기(●○). 없으면 칸도 없다. */
    mark?: "radio";
    on?: boolean;
    /** 지금 고른 것 — 옅은 청록 면. */
    selected?: boolean;
    title?: string;
}): JSX.Element {
    return (
        <button
            className="menu-item"
            role="menuitem"
            onClick={onClick}
            title={title}
            {...(selected ? { "data-selected": "" } : {})}
            style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "calc(100% - 8px)", margin: "0 4px", padding: "4px 8px", borderRadius: 5,
                textAlign: "left", border: "none", fontSize: 11.5, lineHeight: 1.45, cursor: "pointer",
                color: selected ? "var(--accent-hover)" : "var(--text-primary)",
            }}
        >
            {mark && (
                <span aria-hidden style={{ width: 10, flexShrink: 0, textAlign: "center", color: on ? "var(--accent-primary)" : "var(--border-strong)", fontSize: 9 }}>
                    {on ? "●" : "○"}
                </span>
            )}
            <span style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
        </button>
    );
}
