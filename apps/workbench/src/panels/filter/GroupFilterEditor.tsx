// 그룹 조건 편집 — 그룹은 **레일이 될 수 없다**(순서가 없으니 자를 자리가 없다). 그래서 보드에서
// 유일하게 팔레트로 고르는 조건이고, 대신 필터를 여러 개로 나눌 수 있다(테마A / 돌파형을 나눠 걸어야
// 각각의 한계 기여도가 보인다).
//
// 편집 문법은 옛 그룹 필터 줄과 같다: 팔레트에서 고르면 **단독 절**로 붙고(OR), 칩 클릭 = 부정 토글,
// 칩 ✕ = 제거. 새 문법을 발명하지 않는 이유는 손이 이미 그걸 알고 있어서다.
//
// ⚠ 팔레트는 **같은 층위만** 보여준다(canAddGroupLiteral). 한 필터는 한 층위여야 하는데, 못 넣을 걸
// 보여주고 눌렀을 때 거절하면 왜 안 되는지가 화면에 없다 — 애초에 안 보이는 게 규칙을 가르친다.
import { useMemo, useState } from "react";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { GroupPathLabel } from "../../components/GroupPathLabel.js";
import { GROUP_PLAIN, groupColor } from "../../styles/palette.js";
import { useGroups } from "../../lib/GroupsContext.js";
import {
    addGroupLiteral, noneLabelOf, noneLiteral, removeGroupLiteral, toggleGroupNeg, type GroupExpr,
} from "../rank/groupFilter.js";
import { GroupExprChips, namingOf } from "./GroupExprChips.js";
import { canAddGroupLiteral, type Grain, type GrainLookup } from "./stage.js";
import { listRow, textInput } from "./ui.js";

/** 그룹 조건 하나를 고치는 팝오버. 식이 비면 호출부가 그 필터를 통째로 지운다. */
export function GroupFilterEditor({ anchor, scope, expr, onChange, onClose }: {
    anchor: { x: number; y: number };
    /** 이 필터가 사는 칸의 층위 — **칸이 곧 선언**이라 팔레트를 이 층위 그룹으로 좁힌다. */
    scope: Grain;
    expr: GroupExpr;
    onChange: (next: GroupExpr) => void;
    onClose: () => void;
}): JSX.Element {
    const gv = useGroups();
    const { groups, groupByName } = gv;
    const naming = useMemo(() => namingOf(gv), [gv]);
    const [q, setQ] = useState("");

    const grainLook = useMemo<GrainLookup>(
        () => ({ groupScope: (id) => groupByName.get(id)?.scope, axisScope: () => undefined }),
        [groupByName],
    );

    const needle = q.trim().toLowerCase();
    // 칸의 층위가 팔레트를 좁힌다 — 못 넣을 걸 보여주고 눌렀을 때 거절하면 왜 안 되는지가 화면에 없다.
    // 검색은 **경로까지** 본다 — `반도체` 로 그 아래 그룹들을 한 번에 좁힐 수 있어야 부모가 뜻을 갖는다.
    const shown = useMemo(
        () => groups.filter((g) =>
            g.scope === scope && (!needle || naming.pathOf(g.name).toLowerCase().includes(needle)) && canAddGroupLiteral(expr, g.name, grainLook)),
        [groups, scope, needle, expr, grainLook, naming],
    );

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={240} maxWidth={300} maxHeight="min(60vh, 420px)" padding={0} placement="beside" offset={8}>
            <MenuLabel>그룹 조건 · 고르면 |(또는)로 붙습니다</MenuLabel>

            <div style={{ padding: "0 10px 7px" }}>
                <GroupExprChips
                    expr={expr} naming={naming} empty="아래에서 고르세요"
                    onToggleNeg={(gi, li) => onChange(toggleGroupNeg(expr, gi, li))}
                    onRemove={(gi, li) => onChange(removeGroupLiteral(expr, gi, li))}
                />
            </div>

            <div style={{ padding: "0 10px 7px" }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
                    placeholder="그룹 검색" style={textInput} />
            </div>

            {/* "없음"도 **칸의 층위**를 받는다 — 타점 칸에서 고르면 하루 그룹 상속은 안 세고 타점에 직접
                붙은 것만 본다(그래야 일봉에서 이미 분류한 하루가 분봉 미분류 타점을 안 가린다). */}
            <button onClick={() => onChange(addGroupLiteral(expr, noneLiteral(scope)))} style={{ ...listRow, borderTop: "1px solid var(--border-subtle)", color: GROUP_PLAIN, fontWeight: 600 }}>
                ∅ {noneLabelOf(scope)}{" "}
                <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                    {scope === "day" ? "— 아직 분류 안 한 하루" : "— 아직 분류 안 한 타점(하루 그룹은 안 셈)"}
                </span>
            </button>

            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {shown.length === 0 && <div style={{ ...listRow, color: "var(--text-tertiary)" }}>이 층위({scope === "day" ? "하루" : "타점"})에 고를 그룹 없음</div>}
                {shown.map((g) => (
                    <button key={g.name} onClick={() => onChange(addGroupLiteral(expr, g.name))} title={naming.pathOf(g.name)}
                        style={{ ...listRow, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: groupColor(g.name), flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                            {/* 경로가 여기서 제일 중요하다 — 같은 이름이 두 부모 밑에 있으면 목록만 보고는 못 고른다. */}
                            <GroupPathLabel ancestors={naming.ancestorsOf(g.name)} name={g.name} color={groupColor(g.name)} size={12.5} />
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>{g.scope === "day" ? "하루" : "타점"}</span>
                    </button>
                ))}
            </div>
        </AnchoredPopover>
    );
}
