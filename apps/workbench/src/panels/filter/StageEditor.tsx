// 단계 조건 편집 — 이 슬라이스는 **그룹 조건만**(날짜·시간·축은 레일이 이사 온 뒤).
//
// 편집 문법은 GroupFilterLine 과 같다: 팔레트에서 고르면 **단독 절**로 붙고(OR), 칩 클릭 = 부정 토글,
// 칩 ✕ = 제거. 새 문법을 발명하지 않는 이유는 손이 이미 그걸 알고 있어서다.
//
// ⚠ 팔레트는 **같은 scope 만** 보여준다(canAddGroupLiteral). 한 단계는 한 층위여야 하는데, 못 넣을 걸
// 보여주고 눌렀을 때 거절하면 왜 안 되는지가 화면에 없다 — 애초에 안 보이는 게 규칙을 가르친다.
import { useMemo, useState } from "react";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { GroupToken, GroupTokenButton, GroupTokenLabel } from "../../components/GroupChips.js";
import { GROUP_PLAIN, groupColor } from "../../styles/palette.js";
import { useGroups } from "../../lib/useGroups.js";
import {
    NO_TAGS, addGroupLiteral, removeGroupLiteral, toggleGroupNeg, type GroupExpr,
} from "../rank/groupFilter.js";
import { canAddGroupLiteral, type GrainLookup } from "./stage.js";

const NONE_LABEL = "그룹 없음";

/** 그룹 술어 하나를 고치는 팝오버. 식이 비면 호출부가 그 술어를 통째로 지운다. */
export function GroupStageEditor({ anchor, expr, onChange, onClose }: {
    anchor: { x: number; y: number };
    expr: GroupExpr;
    onChange: (next: GroupExpr) => void;
    onClose: () => void;
}): JSX.Element {
    const { groups, groupById } = useGroups();
    const [q, setQ] = useState("");

    const grainLook = useMemo<GrainLookup>(
        () => ({ groupScope: (id) => groupById.get(id)?.scope, axisScope: () => undefined }),
        [groupById],
    );

    const needle = q.trim().toLowerCase();
    // 층위가 안 맞는 그룹은 목록에서 뺀다 — 못 넣을 걸 보여주면 규칙이 거절로만 드러난다.
    const shown = useMemo(
        () => groups.filter((g) => (!needle || g.name.toLowerCase().includes(needle)) && canAddGroupLiteral(expr, g.id, grainLook)),
        [groups, needle, expr, grainLook],
    );

    const nameOf = (id: string): string => (id === NO_TAGS ? NONE_LABEL : (groupById.get(id)?.name ?? "(지워짐)"));

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={240} maxWidth={300} maxHeight="min(60vh, 420px)" padding={0} placement="beside" offset={8}>
            <MenuLabel>그룹 조건 · 고르면 |(또는)로 붙습니다</MenuLabel>

            {/* 지금 식 — 절끼리 |, 절 안은 &. 칩 클릭 = 부정 토글. */}
            <div className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 10px 7px", overflowX: "auto" }}>
                {expr.groups.length === 0 && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>아래에서 고르세요</span>}
                {expr.groups.map((clause, gi) => (
                    <span key={gi} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        {gi > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>|</span>}
                        {clause.literals.map((l, li) => {
                            const c = l.groupId === NO_TAGS ? GROUP_PLAIN : groupColor(nameOf(l.groupId));
                            return (
                                <GroupToken key={li} color={c} hollow={l.neg}>
                                    {l.neg && <span style={{ color: c, fontWeight: 700, fontSize: 10.5 }}>!</span>}
                                    <GroupTokenLabel color={c} strike={l.neg} onClick={() => onChange(toggleGroupNeg(expr, gi, li))}
                                        title={l.neg ? "부정 해제" : "부정으로 — 이 그룹이 아닌 것"}>
                                        {nameOf(l.groupId)}
                                    </GroupTokenLabel>
                                    <GroupTokenButton color={c} onClick={() => onChange(removeGroupLiteral(expr, gi, li))} title="이 조건 제거">✕</GroupTokenButton>
                                </GroupToken>
                            );
                        })}
                    </span>
                ))}
            </div>

            <div style={{ padding: "0 10px 7px" }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
                    placeholder="그룹 검색" style={inputStyle} />
            </div>

            <button onClick={() => onChange(addGroupLiteral(expr, NO_TAGS))} style={{ ...rowStyle, borderTop: "1px solid var(--border-subtle)", color: GROUP_PLAIN, fontWeight: 600 }}>
                ∅ {NONE_LABEL} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>— 아직 분류 안 한 것</span>
            </button>

            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {shown.length === 0 && <div style={{ ...rowStyle, color: "var(--text-tertiary)" }}>고를 그룹 없음{expr.groups.length > 0 && " (층위가 같은 것만 보입니다)"}</div>}
                {shown.map((g) => (
                    <button key={g.id} onClick={() => onChange(addGroupLiteral(expr, g.id))} style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: groupColor(g.name), flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{g.scope === "day" ? "하루" : "타점"}</span>
                    </button>
                ))}
            </div>
        </AnchoredPopover>
    );
}

const rowStyle: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
    color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "6px 10px",
};
const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 5,
    background: "var(--bg-primary)", color: "var(--text-primary)", padding: "4px 7px", fontSize: 12.5, outline: "none",
};
