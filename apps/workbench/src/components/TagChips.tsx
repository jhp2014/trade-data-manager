// 태그 칩 한 줄 — 타점 정보 패널·차트 카드·(후속) 시트 셀이 공유한다.
// 규칙: **절대 wrap 하지 않는다.** 줄 수가 데이터에 따라 늘면 그 아래 레이아웃(축 목록·카드 높이)이 흔들린다.
//   · scroll=true  — 넘치면 hover 가로 스크롤로 탐색(패널: 폭이 좁아도 다 볼 수 있다)
//   · scroll=false — 넘치면 그냥 잘림(차트 위 카드: 스크롤할 수 없는 오버레이라 clamp 가 정직하다)
// 색은 이름의 `그룹:` prefix 자동색(styles/palette.tagColor) — 관리 비용 0.
import type { CSSProperties } from "react";
import type { Tag } from "../api/tags.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { tagColor } from "../styles/palette.js";

export function TagChip({ tag, onClick, title, dim }: { tag: Tag; onClick?: () => void; title?: string; dim?: boolean }): JSX.Element {
    const c = tagColor(tag.name);
    const style: CSSProperties = {
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        maxWidth: 120,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        padding: "1px 6px",
        borderRadius: 9,
        border: `1px solid ${c}`,
        background: dim ? "transparent" : `${c}22`,
        color: c,
        opacity: dim ? 0.55 : 1,
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1.5,
    };
    if (!onClick) return <span title={title ?? tag.name} style={style}>{tag.name}</span>;
    return <button onClick={onClick} title={title ?? tag.name} style={{ ...style, cursor: "pointer", font: "inherit", fontSize: 10.5, fontWeight: 600 }}>{tag.name}</button>;
}

export function TagChips({ tags, scroll = false, empty, onPick, style }: {
    tags: Tag[];
    /** 넘칠 때 hover 가로 스크롤(패널) — false 면 잘림(오버레이 카드). */
    scroll?: boolean;
    /** 태그가 없을 때 표시할 문구. 생략하면 빈 줄. */
    empty?: string;
    onPick?: (tag: Tag) => void;
    style?: CSSProperties;
}): JSX.Element {
    const ref = useHorizontalWheel<HTMLDivElement>(scroll);
    return (
        <div
            ref={ref}
            className={scroll ? "no-scrollbar" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflowX: scroll ? "auto" : "hidden", ...style }}
        >
            {tags.length === 0 && empty && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{empty}</span>}
            {tags.map((t) => <TagChip key={t.id} tag={t} onClick={onPick ? () => onPick(t) : undefined} />)}
        </div>
    );
}
