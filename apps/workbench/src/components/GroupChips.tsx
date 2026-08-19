// 그룹 표기 — 성격이 다른 두 자리를 **다른 모양**으로 나눈다. 하나로 쓰다가 밀집한 표에서 겉돌았다.
//   · GroupChips(읽기)  — 차트 카드·타점 정보·차트 헤더. 테두리·배경 없이 **색 텍스트 + · 구분**.
//     이 앱의 밀집 표기 문법 그대로다(PlacementBadge = 값은 색, 구분자는 tertiary / 시트 Cell = 얇은 선+틱).
//   · GroupToken(편집)  — 그룹창의 붙은 그룹·필터 식 칩. 잡고 클릭·드래그하니 형태가 필요하다.
//     단 알약이 아니라 **각진 토큰**(radius 3, 테두리만) — miniBtn 계열과 같은 결.
//
// 공통 규칙: **절대 wrap 하지 않는다.** 줄 수가 데이터에 따라 늘면 그 아래 레이아웃(축 목록·카드 높이)이 흔들린다.
//   · scroll — 넘치면 hover 가로 스크롤(패널: 폭이 좁아도 다 볼 수 있다)
//   · 아니면 잘림(차트 위 카드·시트 셀: 스크롤할 수 없거나 하면 안 되는 자리 — 폭을 넓혀 보는 게 표의 규칙)
//   · short — 좁은 자리에서 `형태:` 그룹 prefix 를 뗀다. 색이 이미 그룹을 말하므로 손실이 적고 두 배쯤 들어간다.
//     (툴팁에는 언제나 전체 이름을 넣는다 — 줄인 표기가 유일한 정보원이 되지 않게.)
import type { CSSProperties, ReactNode } from "react";
import type { Group } from "../api/groups.js";
import { ScrollRow } from "./ControlChrome.js";
import { groupColor, groupValueOf } from "../styles/palette.js";

export function GroupChips({ groups, scroll = false, short = false, empty, pathOf, style }: {
    groups: Group[];
    scroll?: boolean;
    short?: boolean;
    /** 그룹이 없을 때 표시할 문구. 생략하면 빈 줄. */
    empty?: string;
    /**
     * 조상 경로(`대형주 › 반도체 › 소부장`) — **툴팁에만** 쓴다. 그룹 이름은 부모 밑에서만 뜻이 서는데
     * 여기는 경로를 그릴 폭이 없는 자리들이라(밀집 표기), 화면은 이름만 두고 확인은 툴팁으로 준다.
     * 폭이 있는 자리(필터 보드·팔레트)는 GroupPathLabel 로 경로를 직접 그린다.
     */
    pathOf?: (groupName: string) => string;
    style?: CSSProperties;
}): JSX.Element {
    const labelOf = (t: Group): string => (pathOf ? pathOf(t.name) : t.name);
    const full = groups.map(labelOf).join(" · ");
    return (
        <ScrollRow
            scroll={scroll}
            title={full || undefined}
            style={{ fontSize: 11, lineHeight: 1.4, whiteSpace: "nowrap", ...style }}
        >
            {groups.length === 0 && empty && <span style={{ color: "var(--text-tertiary)" }}>{empty}</span>}
            {groups.map((t, i) => (
                <span key={t.name} style={{ display: "contents" }}>
                    {i > 0 && <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>·</span>}
                    <span title={labelOf(t)} style={{ color: groupColor(t.name), fontWeight: 600, flexShrink: 0 }}>{short ? groupValueOf(t.name) : t.name}</span>
                </span>
            ))}
        </ScrollRow>
    );
}

/**
 * 편집용 토큰 — 각진 테두리. 안쪽 내용(라벨·부가 버튼)은 호출부가 채운다.
 * hollow = 배경 없음(부정 리터럴처럼 "빠진 것"을 나타낼 때).
 */
export function GroupToken({ color, hollow = false, dragging = false, draggable, onDragStart, onDragEnd, title, children, style }: {
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

/** 토큰 안 라벨 버튼(클릭 동작이 있는 그룹 이름). */
export function GroupTokenLabel({ color, strike = false, onClick, title, children }: {
    color: string; strike?: boolean; onClick?: () => void; title?: string; children: ReactNode;
}): JSX.Element {
    const s: CSSProperties = { border: "none", background: "transparent", padding: 0, font: "inherit", fontSize: 10.5, fontWeight: 600, color, textDecoration: strike ? "line-through" : "none" };
    if (!onClick) return <span style={s}>{children}</span>;
    return <button onClick={onClick} title={title} style={{ ...s, cursor: "pointer" }}>{children}</button>;
}

/** 토큰 안 부가 버튼(✕ 등) — 라벨과 같은 색, 더 작게. */
export function GroupTokenButton({ color, onClick, title, children }: { color: string; onClick: () => void; title: string; children: ReactNode }): JSX.Element {
    return <button onClick={onClick} title={title} style={{ border: "none", background: "transparent", cursor: "pointer", color, fontSize: 9.5, lineHeight: 1, padding: "0 1px" }}>{children}</button>;
}
