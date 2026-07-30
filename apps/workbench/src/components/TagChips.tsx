// 태그 표기 — 성격이 다른 두 자리를 **다른 모양**으로 나눈다. 하나로 쓰다가 밀집한 표에서 겉돌았다.
//   · TagChips(읽기)  — 시트 셀·차트 카드·타점 정보·차트 헤더. 테두리·배경 없이 **색 텍스트 + · 구분**.
//     이 앱의 밀집 표기 문법 그대로다(PlacementBadge = 값은 색, 구분자는 tertiary / 시트 Cell = 얇은 선+틱).
//   · TagToken(편집)  — 태그창의 붙은 태그·필터 식 칩. 잡고 클릭·드래그하니 형태가 필요하다.
//     단 알약이 아니라 **각진 토큰**(radius 3, 테두리만) — miniBtn 계열과 같은 결.
//
// 공통 규칙: **절대 wrap 하지 않는다.** 줄 수가 데이터에 따라 늘면 그 아래 레이아웃(축 목록·카드 높이)이 흔들린다.
//   · scroll — 넘치면 hover 가로 스크롤(패널: 폭이 좁아도 다 볼 수 있다)
//   · 아니면 잘림(차트 위 카드·시트 셀: 스크롤할 수 없거나 하면 안 되는 자리 — 폭을 넓혀 보는 게 표의 규칙)
//   · short — 좁은 자리에서 `형태:` 그룹 prefix 를 뗀다. 색이 이미 그룹을 말하므로 손실이 적고 두 배쯤 들어간다.
//     (툴팁에는 언제나 전체 이름을 넣는다 — 줄인 표기가 유일한 정보원이 되지 않게.)
import type { CSSProperties, ReactNode } from "react";
import type { Tag } from "../api/tags.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { tagColor, tagValueOf } from "../styles/palette.js";

export function TagChips({ tags, scroll = false, short = false, empty, style }: {
    tags: Tag[];
    scroll?: boolean;
    short?: boolean;
    /** 태그가 없을 때 표시할 문구. 생략하면 빈 줄. */
    empty?: string;
    style?: CSSProperties;
}): JSX.Element {
    const ref = useHorizontalWheel<HTMLDivElement>(scroll);
    const full = tags.map((t) => t.name).join(" · ");
    return (
        <div
            ref={ref}
            className={scroll ? "no-scrollbar" : undefined}
            title={full || undefined}
            style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflowX: scroll ? "auto" : "hidden", fontSize: 11, lineHeight: 1.4, whiteSpace: "nowrap", ...style }}
        >
            {tags.length === 0 && empty && <span style={{ color: "var(--text-tertiary)" }}>{empty}</span>}
            {tags.map((t, i) => (
                <span key={t.id} style={{ display: "contents" }}>
                    {i > 0 && <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>·</span>}
                    <span style={{ color: tagColor(t.name), fontWeight: 600, flexShrink: 0 }}>{short ? tagValueOf(t.name) : t.name}</span>
                </span>
            ))}
        </div>
    );
}

/**
 * 편집용 토큰 — 각진 테두리. 안쪽 내용(라벨·부가 버튼)은 호출부가 채운다.
 * hollow = 배경 없음(부정 리터럴처럼 "빠진 것"을 나타낼 때).
 */
export function TagToken({ color, hollow = false, dragging = false, draggable, onDragStart, onDragEnd, title, children, style }: {
    color: string;
    hollow?: boolean;
    dragging?: boolean;
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
    title?: string;
    children: ReactNode;
    style?: CSSProperties;
}): JSX.Element {
    return (
        <span
            draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} title={title}
            style={{
                display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0, whiteSpace: "nowrap",
                padding: "1px 5px", borderRadius: 3, border: `1px solid ${color}`,
                background: hollow ? "transparent" : `${color}1a`,
                opacity: dragging ? 0.4 : 1,
                fontSize: 10.5, lineHeight: 1.5,
                ...style,
            }}
        >
            {children}
        </span>
    );
}

/** 토큰 안 라벨 버튼(클릭 동작이 있는 태그 이름). */
export function TagTokenLabel({ color, strike = false, onClick, title, children }: {
    color: string; strike?: boolean; onClick?: () => void; title?: string; children: ReactNode;
}): JSX.Element {
    const s: CSSProperties = { border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 10.5, fontWeight: 600, color, textDecoration: strike ? "line-through" : "none" };
    if (!onClick) return <span style={s}>{children}</span>;
    return <button onClick={onClick} title={title} style={{ ...s, cursor: "pointer" }}>{children}</button>;
}

/** 토큰 안 부가 버튼(✕ 등) — 라벨과 같은 색, 더 작게. */
export function TagTokenButton({ color, onClick, title, children }: { color: string; onClick: () => void; title: string; children: ReactNode }): JSX.Element {
    return <button onClick={onClick} title={title} style={{ border: "none", background: "transparent", cursor: "pointer", color, fontSize: 9.5, lineHeight: 1, padding: "0 1px" }}>{children}</button>;
}
