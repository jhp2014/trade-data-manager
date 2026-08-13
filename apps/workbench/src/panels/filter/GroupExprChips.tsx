// 그룹 식(DNF)의 칩 표기 — **읽기와 편집이 같은 모양**이어야 한다.
// 보드의 줄에서 본 식과 팔레트를 열었을 때의 식이 다르게 생기면, 같은 조건인지 확인하는 데 눈이 든다.
// 편집 손잡이(onToggleNeg·onRemove)를 안 주면 그대로 읽기 표기가 된다.
//
// 칩은 **조상 경로까지** 보여준다(`반도체 › 소부장`) — 같은 이름이 두 부모 밑에 있으면 이름만으로는
// 어느 조건인지 알 수 없고, 그게 그대로 잘못 건 필터가 된다. 강조는 현재 그룹 하나뿐이다.
import { GroupToken, GroupTokenButton } from "../../components/GroupChips.js";
import { GroupPathLabel } from "../../components/GroupPathLabel.js";
import type { GroupsView } from "../../lib/useGroups.js";
import { GROUP_PLAIN, groupColor } from "../../styles/palette.js";
import { NO_TAGS, type GroupExpr } from "../rank/groupFilter.js";

export const NONE_LABEL = "그룹 없음";
/** 지워진 그룹 — 조용히 건너뛰면 화면에는 멀쩡한 조건처럼 보인다(판정에서는 미배치를 만들고 있는데). */
export const GONE_LABEL = "(지워짐)";

/** 칩 하나가 이름을 얻는 방법 — 지워진 그룹까지 화면에 남기려면 조회가 실패해도 뭔가는 돌려줘야 한다. */
export interface GroupNaming {
    nameOf: (groupId: string) => string;
    /** 조상 이름들(먼 조상이 앞). "그룹 없음"은 그룹이 아니라 조상도 없다. */
    ancestorsOf: (groupId: string) => string[];
    /** 툴팁용 전체 경로. */
    pathOf: (groupId: string) => string;
}

/**
 * 사전 한 벌 → 이름 짓기. **훅이 아니다** — 그룹을 쓰는 화면은 이미 useGroups 를 부르고 있고,
 * 여기서 또 부르면 같은 인덱스(멤버십 수천 건)가 한 벌 더 만들어진다.
 */
export function namingOf(gv: Pick<GroupsView, "groupById" | "ancestorsOf" | "pathLabel">): GroupNaming {
    return {
        nameOf: (id) => (id === NO_TAGS ? NONE_LABEL : (gv.groupById.get(id)?.name ?? GONE_LABEL)),
        ancestorsOf: (id) => (id === NO_TAGS ? [] : gv.ancestorsOf(id).map((g) => g.name)),
        pathOf: (id) => (id === NO_TAGS ? NONE_LABEL : gv.pathLabel(id, GONE_LABEL)),
    };
}

export function GroupExprChips({ expr, naming, empty, onToggleNeg, onRemove }: {
    expr: GroupExpr;
    naming: GroupNaming;
    /** 식이 비었을 때의 문구. 없으면 아무것도 안 그린다. */
    empty?: string;
    /** 칩 클릭 = 부정 토글. 없으면 읽기 전용. */
    onToggleNeg?: (clauseIndex: number, literalIndex: number) => void;
    /** 칩 ✕ = 리터럴 제거. 없으면 ✕ 를 안 그린다. */
    onRemove?: (clauseIndex: number, literalIndex: number) => void;
}): JSX.Element {
    return (
        <div className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflowX: "auto" }}>
            {expr.groups.length === 0 && empty && (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{empty}</span>
            )}
            {expr.groups.map((clause, gi) => (
                <span key={gi} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                    {gi > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>|</span>}
                    {clause.literals.map((l, li) => {
                        const none = l.groupId === NO_TAGS;
                        const name = naming.nameOf(l.groupId);
                        const color = none ? GROUP_PLAIN : groupColor(name);
                        return (
                            <GroupToken key={li} color={color} hollow={l.neg} title={none ? NONE_LABEL : naming.pathOf(l.groupId)}>
                                {l.neg && <span style={{ color, fontWeight: 700, fontSize: 10.5 }}>!</span>}
                                {onToggleNeg ? (
                                    <button onClick={() => onToggleNeg(gi, li)} title={l.neg ? "부정 해제" : "부정으로 — 이 그룹이 아닌 것"}
                                        style={{ border: "none", background: "transparent", padding: 0, font: "inherit", cursor: "pointer", minWidth: 0 }}>
                                        <GroupPathLabel ancestors={none ? [] : naming.ancestorsOf(l.groupId)} name={name} color={color} strike={l.neg} />
                                    </button>
                                ) : (
                                    <GroupPathLabel ancestors={none ? [] : naming.ancestorsOf(l.groupId)} name={name} color={color} strike={l.neg} />
                                )}
                                {onRemove && <GroupTokenButton color={color} onClick={() => onRemove(gi, li)} title="이 조건 제거">✕</GroupTokenButton>}
                            </GroupToken>
                        );
                    })}
                </span>
            ))}
        </div>
    );
}
