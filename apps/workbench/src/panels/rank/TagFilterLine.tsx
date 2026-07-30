// 태그 필터 라인 — 배치 보드·시트 **공용**(같은 store 상태를 같은 UI 로 만진다).
// 식은 DNF: 그룹 상자끼리 |, 상자 안 칩끼리 &. 규칙·연산은 순수 tagFilter, 여긴 손동작만 얹는다.
//   · `+ 태그` = 팔레트 팝오버. 고르면 **단독 그룹**으로 붙는다(OR). 상시 한 줄을 차지하지 않게 팝오버로 뒀다.
//   · 칩 클릭 = ! 토글 · 칩 ✕ = 제거 · 칩을 **다른 칩 위로** 끌면 그 그룹에 합류(&), **| 자리**로 끌면 떨어져 나옴.
//   · 식이 비면 이 줄은 렌더되지 않는다(안 쓸 땐 세로를 안 먹는다) — 호출부가 `+ 태그` 버튼만 둔다.
import { useMemo, useState, type CSSProperties } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { useTags } from "../../lib/useTags.js";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { useHorizontalWheel } from "../../lib/useHorizontalWheel.js";
import { TAG_PLAIN, tagColor } from "../../styles/palette.js";
import { TagToken, TagTokenButton, TagTokenLabel } from "../../components/TagChips.js";
import {
    NO_TAGS, addTagLiteral, isTagExprEmpty, moveTagLiteral, removeTagLiteral, toggleTagNeg, type TagLiteral,
} from "./tagFilter.js";

const LIT_DND = "application/x-tag-literal"; // "gi:li" — 열 헤더 드래그와 미디어타입으로 갈린다
const NONE_LABEL = "태그 없음";

/** 라인 + 버튼을 한 벌로 — 호출부는 이것만 놓으면 된다(식이 비면 버튼 줄만 남는다). */
export function TagFilterLine(): JSX.Element | null {
    const tagExpr = useWorkbench((s) => s.tagExpr);
    if (isTagExprEmpty(tagExpr)) return null;
    return <TagExprRow />;
}

/** `+ 태그` 버튼 — 필터 바 등 호출부의 컨트롤 줄에 놓는다(팔레트 팝오버 진입점). */
export function AddTagFilterButton({ style }: { style?: CSSProperties }): JSX.Element {
    const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
    return (
        <>
            <button onClick={(e) => setOpen({ x: e.clientX, y: e.clientY })} title="태그 조건 추가(팔레트)" style={{ ...dashedBtn, ...style }}>+ 태그</button>
            {open && <TagPalette anchor={open} onClose={() => setOpen(null)} />}
        </>
    );
}

function TagExprRow(): JSX.Element {
    const tagExpr = useWorkbench((s) => s.tagExpr);
    const setTagExpr = useWorkbench((s) => s.setTagExpr);
    const { tagById } = useTags();
    const wheelRef = useHorizontalWheel<HTMLDivElement>(true);
    const [drag, setDrag] = useState<{ gi: number; li: number } | null>(null);
    const [over, setOver] = useState<string | null>(null); // 드롭 하이라이트 대상 키

    const nameOf = (tagId: string): string => (tagId === NO_TAGS ? NONE_LABEL : (tagById.get(tagId)?.name ?? "(지워진 태그)"));
    const parse = (s: string): { gi: number; li: number } | null => {
        const [g, l] = s.split(":").map(Number);
        return Number.isInteger(g) && Number.isInteger(l) ? { gi: g, li: l } : null;
    };
    const dropOn = (e: React.DragEvent, to: number | "new"): void => {
        const src = parse(e.dataTransfer.getData(LIT_DND));
        setOver(null); setDrag(null);
        if (src) setTagExpr(moveTagLiteral(tagExpr, src.gi, src.li, to));
    };
    const accept = (e: React.DragEvent, key: string): void => {
        if (!e.dataTransfer.types.includes(LIT_DND)) return;
        e.preventDefault();
        setOver(key);
    };

    return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", minWidth: 0, minHeight: 28 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", flexShrink: 0 }}>태그</span>
            <div ref={wheelRef} className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap: 3, overflowX: "auto", flex: 1, minWidth: 0 }}>
                {tagExpr.groups.map((g, gi) => (
                    <div key={gi} style={{ display: "contents" }}>
                        {gi > 0 && <OrSlot active={over === `or:${gi}`} onOver={(e) => accept(e, `or:${gi}`)} onLeave={() => setOver(null)} onDrop={(e) => dropOn(e, "new")} />}
                        <div
                            onDragOver={(e) => accept(e, `g:${gi}`)}
                            onDragLeave={() => setOver(null)}
                            onDrop={(e) => dropOn(e, gi)}
                            title="칩을 여기로 끌면 &(그리고)로 묶입니다"
                            style={{
                                flexShrink: 0, display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 8,
                                border: `1px ${g.literals.length > 1 ? "solid" : "dashed"} ${over === `g:${gi}` ? "var(--accent-primary)" : "var(--border-default)"}`,
                                background: over === `g:${gi}` ? "var(--accent-soft)" : "transparent",
                            }}
                        >
                            {g.literals.map((l, li) => (
                                <div key={li} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                                    {li > 0 && <span style={opStyle}>&</span>}
                                    <LiteralChip
                                        lit={l} name={nameOf(l.tagId)}
                                        dragging={drag?.gi === gi && drag?.li === li}
                                        onDragStart={(e) => { e.dataTransfer.setData(LIT_DND, `${gi}:${li}`); e.dataTransfer.effectAllowed = "move"; setDrag({ gi, li }); }}
                                        onDragEnd={() => { setDrag(null); setOver(null); }}
                                        onToggle={() => setTagExpr(toggleTagNeg(tagExpr, gi, li))}
                                        onRemove={() => setTagExpr(removeTagLiteral(tagExpr, gi, li))}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {/* 끝자락 | 자리 — 마지막 그룹 뒤로 끌어도 떨어져 나오게(뭉친 걸 푸는 유일한 손동작이라 목표가 넉넉해야 한다) */}
                <OrSlot active={over === "or:end"} onOver={(e) => accept(e, "or:end")} onLeave={() => setOver(null)} onDrop={(e) => dropOn(e, "new")} tail />
            </div>
            <AddTagFilterButton style={{ flexShrink: 0 }} />
            <button onClick={() => setTagExpr({ groups: [] })} title="태그 조건 전체 해제" style={{ ...dashedBtn, flexShrink: 0 }}>지우기</button>
        </div>
    );
}

/** 그룹 사이 | — 드롭 목표를 겸한다(여기 놓으면 단독 그룹으로 분리). */
function OrSlot({ active, tail, onOver, onLeave, onDrop }: {
    active: boolean; tail?: boolean;
    onOver: (e: React.DragEvent) => void; onLeave: () => void; onDrop: (e: React.DragEvent) => void;
}): JSX.Element {
    return (
        <span
            onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop}
            title="여기로 끌면 |(또는)로 떨어집니다"
            style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: tail ? 22 : 16, height: 20, borderRadius: 5,
                fontSize: 11, fontWeight: 700, color: active ? "var(--accent-primary)" : "var(--text-tertiary)",
                background: active ? "var(--accent-soft)" : "transparent",
                border: active ? "1px dashed var(--accent-primary)" : "1px dashed transparent",
            }}
        >{tail ? "" : "|"}</span>
    );
}

function LiteralChip({ lit, name, dragging, onDragStart, onDragEnd, onToggle, onRemove }: {
    lit: TagLiteral; name: string; dragging: boolean;
    onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onToggle: () => void; onRemove: () => void;
}): JSX.Element {
    const c = lit.tagId === NO_TAGS ? TAG_PLAIN : tagColor(name);
    return (
        // 부정(!)은 **속 빈 토큰 + 취소선** — 색만 바꾸면 "무슨 색이 부정이더라"를 외워야 한다.
        <TagToken color={c} hollow={lit.neg} dragging={dragging} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} style={{ cursor: "grab", paddingRight: 3 }}>
            {lit.neg && <span style={{ color: c, fontWeight: 700, fontSize: 10.5 }}>!</span>}
            <TagTokenLabel color={c} strike={lit.neg} onClick={onToggle} title={lit.neg ? "부정 해제(클릭)" : "부정으로(클릭) — 이 태그가 아닌 것"}>{name}</TagTokenLabel>
            <TagTokenButton color={c} onClick={onRemove} title="이 조건 제거">✕</TagTokenButton>
        </TagToken>
    );
}

/**
 * 팔레트 — 사전 전체 + "태그 없음"(미분류 찾기). 고르면 단독 그룹으로 추가되고 창은 열린 채라 연속으로 담을 수 있다.
 * 정렬은 이름순 **고정**이다: 현재 타점 태그를 앞으로 끌어올리면 타점이 바뀔 때마다 칩이 재배열돼 오클릭이 난다.
 * 대신 현재 타점의 태그는 위쪽 구역에 따로 모아 둔다(그 구역만 바뀐다).
 */
function TagPalette({ anchor, onClose }: { anchor: { x: number; y: number }; onClose: () => void }): JSX.Element {
    const tagExpr = useWorkbench((s) => s.tagExpr);
    const setTagExpr = useWorkbench((s) => s.setTagExpr);
    const activePoint = useWorkbench((s) => s.activePoint);
    const { tags, tagsOf, countOf } = useTags();
    const [q, setQ] = useState("");

    const current = useMemo(
        () => (activePoint ? tagsOf({ stockCode: activePoint.code, date: activePoint.date, time: activePoint.time }) : []),
        [activePoint, tagsOf],
    );
    const needle = q.trim().toLowerCase();
    const shown = useMemo(() => (needle ? tags.filter((t) => t.name.toLowerCase().includes(needle)) : tags), [tags, needle]);
    const add = (tagId: string): void => setTagExpr(addTagLiteral(tagExpr, tagId));

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={230} maxWidth={280} maxHeight="min(56vh, 380px)" padding={0} placement="beside" offset={6}>
            <MenuLabel>태그 조건 추가 · 고르면 |(또는)로 붙습니다</MenuLabel>
            <div style={{ padding: "0 10px 7px" }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
                    placeholder="태그 검색" style={inputStyle} />
            </div>

            {current.length > 0 && !needle && (
                <div style={{ padding: "0 10px 6px", display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 8 }}>
                    <span style={{ width: "100%", fontSize: 10, color: "var(--text-tertiary)" }}>현재 타점</span>
                    {current.map((t) => (
                        <TagToken key={t.id} color={tagColor(t.name)}>
                            <TagTokenLabel color={tagColor(t.name)} onClick={() => add(t.id)} title="이 태그로 조건 추가">{t.name}</TagTokenLabel>
                        </TagToken>
                    ))}
                </div>
            )}

            <button onClick={() => add(NO_TAGS)} style={{ ...rowStyle, borderTop: "1px solid var(--border-subtle)", color: TAG_PLAIN, fontWeight: 600 }}>
                ∅ {NONE_LABEL} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>— 아직 분류 안 한 타점</span>
            </button>

            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {shown.length === 0 && <div style={{ ...rowStyle, color: "var(--text-tertiary)" }}>태그 없음</div>}
                {shown.map((t) => (
                    <button key={t.id} onClick={() => add(t.id)} style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: tagColor(t.name), flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{countOf(t.id)}</span>
                    </button>
                ))}
            </div>
        </AnchoredPopover>
    );
}

const opStyle: CSSProperties = { fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", flexShrink: 0 };
const dashedBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" };
const rowStyle: CSSProperties = {
    display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
    color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "6px 10px",
};
const inputStyle: CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 5,
    background: "var(--bg-primary)", color: "var(--text-primary)", padding: "4px 7px", fontSize: 12.5, outline: "none",
};
