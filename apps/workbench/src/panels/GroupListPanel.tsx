// 그룹 목록 — **그룹 사이의 구조를 보고, 탐색 후보를 재는 자리.** 옛 그룹 맵을 대신한다.
//
// 맵을 접는 이유는 취향이 아니다. 맵은 겹침 선을 *짚은 그룹의 것만* 그렸다(전부 그리면 실뭉치라서) —
// 즉 실제로 보여주던 겹침은 이미 "한 기준 → 후보들"의 1:N 이었고, 그건 **정렬 가능한 한 열**이 훨씬
// 잘한다. 계층도 들여쓰기가 영역 중첩보다 정확하고, 부모 지정도 행에 떨어뜨리는 게 영역에 떨어뜨리는
// 것보다 애매하지 않다. 대응은 groupList.ts 머리 주석에.
//
// 맵과 규약은 같다: 깔때기의 여느 구독자(읽기)이고, **쓰기는 "필터에 추가" 하나**다. 조건의 저자는
// 깔때기 하나여야 하므로 여기서 만든 뒤 잊는다 — 지우기·순서·on/off 는 필터 보드의 일이다.
// (부모 지정은 조건이 아니라 사전 편집이라 별개다.)
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { createGroup, setGroupParent, type GroupMembership } from "../api/groups.js";
import { groupsQuery } from "../api/queries.js";
import { PanelHeader, miniBtn, mutedNote } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { useGroups } from "../lib/GroupsContext.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { chartKey } from "../lib/pointKey.js";
import { ACTIVE } from "../styles/palette.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { chainCandidates, membersOfAll, populationCounts, populationFeed, type PopulationItem } from "./map/mapView.js";
import { canReparent, overlapRows, relationOf, treeRows, type GroupRow } from "./group/groupList.js";

const SORT_KEY = "wb.groupListSort";
const COLLAPSED_KEY = "wb.groupListCollapsed";
type SortMode = "tree" | "overlap";

export function GroupListPanel(): JSX.Element {
    const gv = useGroups();
    const funnel = useFunnel();
    const qc = useQueryClient();

    const [sort, setSort] = usePersistedState<SortMode>(
        SORT_KEY, (o) => (o === "tree" || o === "overlap" ? o : null), "tree",
    );
    const [collapsedList, setCollapsed] = usePersistedState<readonly string[]>(
        COLLAPSED_KEY, (o) => (Array.isArray(o) && o.every((s) => typeof s === "string") ? (o as string[]) : null), [],
    );
    const collapsed = useMemo(() => new Set(collapsedList), [collapsedList]);
    /** 체인 — 클릭 순서대로 쌓는 **세션 시선**(조건이 아니다. 조건의 저자는 깔때기 하나). */
    const [chain, setChain] = useState<string[]>([]);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState("");

    /**
     * 모집단 — 맵과 **같은 잣대**여야 한다(골격·시트와도). 여기만 다르게 세면 숫자가 어긋나는데
     * 그 어긋남은 화면 어디에도 신호가 없다. 그래서 판정도 깔때기의 적용 집합을 그대로 쓴다.
     *
     * 그룹은 하루·타점 두 층위가 있어 항목을 차트 단위로 접는다 — 맵의 하루 평면과 같은 셈법이다.
     */
    const population = useMemo<PopulationItem[]>(() => {
        if (funnel.isLoading) return [];
        const seen = new Set<string>();
        const out: PopulationItem[] = [];
        for (const it of funnel.viewedItems) {
            const k = chartKey(it);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ stockCode: it.stockCode, date: it.date });
        }
        return out;
    }, [funnel.isLoading, funnel.viewedItems]);

    const popFeed = useMemo<GroupMembership[]>(
        () => populationFeed(population, (i) => gv.appliedGroupNamesOf(i)),
        [population, gv],
    );
    const counts = useMemo(() => populationCounts(popFeed), [popFeed]);
    /** 후보별 "체인 전부 & 그 후보" 수 — 맵의 화살표 위 숫자와 같은 값(같은 함수를 쓴다). */
    const candidates = useMemo(
        () => chainCandidates(popFeed, chain, { groupByName: gv.groupByName }),
        [popFeed, chain, gv.groupByName],
    );
    const chainMembers = useMemo(() => (chain.length === 0 ? [] : membersOfAll(popFeed, chain)), [popFeed, chain]);

    // 지워진 그룹은 체인에서 빠진다 — 죽은 참조가 남으면 머리줄이 허공을 가리킨다.
    const rows = useMemo<GroupRow[]>(
        () => (sort === "tree" ? treeRows(gv.groups, collapsed) : overlapRows(gv.groups, candidates, chain, gv.groupByName)),
        [sort, gv.groups, gv.groupByName, collapsed, candidates, chain],
    );

    const addFilterStage = useWorkbench((s) => s.addFilterStage);
    /**
     * 체인 전체를 조건으로 굳힌다 — 그룹마다 **단계 하나씩**. 한 단계에 몰면 깔때기가 "어느 단계가
     * 무엇을 죽였나"를 못 묻는다(12→8→5 가 12→5 로 뭉친다).
     */
    const addChainToFilter = useCallback(() => {
        for (const groupId of chain) addFilterStage([{ kind: "group", expr: { groups: [{ literals: [{ groupId, neg: false }] }] } }]);
    }, [chain, addFilterStage]);

    /**
     * 행 클릭 규약 — 맵과 **글자 단위로 같다**(손짓을 새로 배우지 않게).
     *   · 클릭      = 그 그룹 하나만(체인 새로 시작)
     *   · Ctrl+클릭 = 체인에 더하기. 이미 든 그룹이면 거기까지 되감기
     * Ctrl 로도 **갈 수 없는 곳**(교집합 0·포함관계)은 이어붙지 않는다.
     */
    const onRowClick = useCallback((name: string, additive: boolean) => {
        setChain((cur) => {
            const i = cur.indexOf(name);
            if (!additive) return cur.length === 1 && i === 0 ? [] : [name];
            if (i >= 0) return cur.slice(0, i + 1);
            if (cur.length === 0) return [name];
            return (candidates.get(name) ?? 0) > 0 ? [...cur, name] : cur;
        });
    }, [candidates]);

    const parentMut = useMutation({
        mutationFn: (v: { name: string; parentName: string | null }) => setGroupParent(v.name, v.parentName),
        onSettled: () => void qc.invalidateQueries({ queryKey: groupsQuery().queryKey }),
    });
    const createMut = useMutation({
        mutationFn: (name: string) => createGroup(name, "day"),
        onSettled: () => void qc.invalidateQueries({ queryKey: groupsQuery().queryKey }),
    });

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    /** 행을 행 위로 = 그 그룹의 하위로. "최상위" 자리에 놓으면 밖으로 뺀다. */
    const onDragEnd = ({ active, over }: DragEndEvent): void => {
        if (!over) return;
        const name = String(active.id);
        const target = over.id === ROOT_DROP ? null : String(over.id);
        if (!canReparent(name, target, gv.groupByName)) return;
        parentMut.mutate({ name, parentName: target });
    };

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "choice", id: "sort", name: "정렬", help: "계층 그대로 볼까, 지금 체인과 겹치는 순으로 볼까",
            values: [{ v: "tree", label: "계층" }, { v: "overlap", label: "겹침" }],
            value: sort, set: (v) => setSort(v === "overlap" ? "overlap" : "tree"),
        },
        {
            kind: "action", id: "newGroup", name: "+ 새 그룹", help: "이름만 정하면 된다(층위는 하루)",
            run: () => setAdding((v) => !v),
        },
    ], [sort, setSort]);

    if (gv.isLoading) return <Note>불러오는 중…</Note>;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }}>
            <PanelHeader chrome={false} padding="5px 10px"
                style={{ borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}>
                    그룹 {gv.groups.length} · 모집단 {funnel.isLoading ? "…" : population.length}{funnel.isFiltering ? "" : " (전체)"}
                </span>
                <HeaderControls controls={controls} storageKey="wb.headerPins.groupList" />
            </PanelHeader>

            {adding && (
                <div style={{ display: "flex", gap: 4, padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            const n = newName.trim();
                            if (n !== "") { createMut.mutate(n); setNewName(""); setAdding(false); }
                        }}
                        placeholder="새 그룹 이름 (Enter)" style={{ fontSize: 11, flex: 1 }} />
                    <button onClick={() => setAdding(false)} style={{ ...miniBtn, padding: "1px 6px" }}>취소</button>
                </div>
            )}

            {/* 머리줄 — 맵의 체인 작업줄이 여기로 왔다. 교집합 칩이 서던 자리가 "공통 N" 이다. */}
            {chain.length > 0 && (
                <div style={{
                    flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
                    background: "var(--accent-soft)", borderBottom: "1px solid var(--border-default)",
                    fontSize: 11.5, whiteSpace: "nowrap", overflowX: "auto",
                }} className="no-scrollbar">
                    {chain.map((name, i) => (
                        <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {i > 0 && <span style={{ color: "var(--text-tertiary)" }}>&</span>}
                            <button onClick={() => setChain((cur) => cur.slice(0, i + 1))} title="여기까지 되감기"
                                style={{
                                    border: "none", background: ACTIVE, color: "#fff", borderRadius: 999,
                                    padding: "1px 8px", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 500,
                                }}>
                                {name}
                            </button>
                        </span>
                    ))}
                    <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>공통 {chainMembers.length}</span>
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <button onClick={addChainToFilter} title="체인 전체를 필터 단계로 — 그룹마다 하나씩. 지우기·수정은 필터 보드에서"
                            style={{ border: "none", background: "none", cursor: "pointer", font: "inherit", fontSize: 11.5, color: "var(--accent-primary)", fontWeight: 700 }}>
                            필터에 추가
                        </button>
                        <button onClick={() => setChain([])} title="체인 비우기"
                            style={{ border: "none", background: "none", cursor: "pointer", font: "inherit", fontSize: 11.5, color: "var(--text-tertiary)" }}>✕</button>
                    </span>
                </div>
            )}

            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                    {gv.groups.length === 0 && <div style={mutedNote}>그룹이 없습니다. 위 <b>+ 새 그룹</b>으로 만드세요.</div>}
                    {rows.length > 0 && (
                        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                            <thead>
                                <tr style={{ color: "var(--text-tertiary)", fontSize: 10, textAlign: "left" }}>
                                    <th style={{ fontWeight: 400, padding: "3px 10px" }}>그룹</th>
                                    <th style={{ width: 42, fontWeight: 400, padding: "3px 0", textAlign: "right" }}>수</th>
                                    <th style={{ width: 86, fontWeight: 400, padding: "3px 10px 3px 8px" }}>
                                        {chain.length > 0 ? `& ${chain.join(" & ")}` : "겹침"}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <GroupRowView key={r.group.name} row={r}
                                        count={counts.get(r.group.name) ?? 0}
                                        relation={relationOf(r.group.name, chain, gv.groupByName)}
                                        overlap={candidates.get(r.group.name) ?? 0}
                                        maxOverlap={maxOf(candidates)}
                                        chainOn={chain.length > 0}
                                        collapsed={collapsed.has(r.group.name)}
                                        onToggleCollapse={() => setCollapsed((cur) =>
                                            cur.includes(r.group.name) ? cur.filter((x) => x !== r.group.name) : [...cur, r.group.name])}
                                        onClick={(additive) => onRowClick(r.group.name, additive)}
                                        pathOf={() => gv.pathLabel(r.group.name, r.group.name)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                    <RootDrop />
                </div>
            </DndContext>
        </div>
    );
}

/** 최상위로 빼는 자리 — 목록 끝의 넓은 띠. 트리에는 "밖" 이라는 행이 없어서 자리를 따로 만든다. */
const ROOT_DROP = "__root__";
function RootDrop(): JSX.Element {
    const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP });
    return (
        <div ref={setNodeRef} style={{
            margin: "6px 10px 10px", padding: "6px 8px", borderRadius: 6, fontSize: 10.5, textAlign: "center",
            border: `1px dashed ${isOver ? "var(--accent-primary)" : "var(--border-default)"}`,
            background: isOver ? "var(--accent-soft)" : "transparent",
            color: isOver ? "var(--accent-primary)" : "var(--text-tertiary)",
        }}>
            여기에 놓으면 최상위로
        </div>
    );
}

const maxOf = (m: ReadonlyMap<string, number>): number => {
    let max = 0;
    for (const v of m.values()) max = Math.max(max, v);
    return max;
};

/**
 * 한 줄 — 손잡이 없이 **행 전체가 끌린다**(부모 지정이 이 목록의 주 편집이라 손잡이를 따로 두면 멀다).
 * 클릭과 드래그는 거리(4px)로 갈린다(PointerSensor activationConstraint).
 *
 * `&` 칸의 규칙은 groupList.relationOf 에 있다: 짚음 · 포함(좁혀지지 않음) · 수(막대 길이는 상대 척도).
 */
function GroupRowView({ row, count, relation, overlap, maxOverlap, chainOn, collapsed, onToggleCollapse, onClick, pathOf }: {
    row: GroupRow;
    count: number;
    relation: "chain" | "contain" | "other";
    overlap: number;
    maxOverlap: number;
    chainOn: boolean;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onClick: (additive: boolean) => void;
    pathOf: () => string;
}): JSX.Element {
    const { group, depth, hasChildren } = row;
    const drag = useDraggable({ id: group.name });
    const drop = useDroppable({ id: group.name });
    const picked = relation === "chain";
    const reachable = !chainOn || relation === "chain" || overlap > 0;

    return (
        <tr
            ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
            {...drag.attributes} {...drag.listeners}
            onClick={(e) => onClick(e.ctrlKey || e.metaKey)}
            title={`${pathOf()} · 모집단 ${count}\n클릭 = 이 그룹만 · Ctrl+클릭 = 교집합에 더하기 · 끌어서 다른 그룹 밑으로`}
            style={{
                cursor: "pointer", touchAction: "none",
                borderTop: "1px solid var(--border-subtle)",
                background: drop.isOver && drop.active?.id !== group.name ? "var(--accent-soft)"
                    : picked ? "var(--bg-active)" : "transparent",
                opacity: drag.isDragging ? 0.4 : 1,
            }}
        >
            <td style={{
                padding: "3px 10px", paddingLeft: 10 + depth * 14,
                borderLeft: picked ? `2px solid ${ACTIVE}` : "2px solid transparent",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
                {hasChildren ? (
                    <button onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
                        title={collapsed ? "펼치기" : "접기"}
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", font: "inherit", fontSize: 9, padding: "0 4px 0 0" }}>
                        {collapsed ? "▶" : "▼"}
                    </button>
                ) : (
                    <span style={{ display: "inline-block", width: 13 }} />
                )}
                <span style={{ color: picked ? ACTIVE : reachable ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: picked ? 700 : 400 }}>
                    {group.name}
                </span>
            </td>
            <td style={{ padding: "3px 0", textAlign: "right", color: "var(--text-secondary)" }}>{count}</td>
            <td style={{ padding: "3px 10px 3px 8px", color: "var(--text-secondary)" }}>
                {!chainOn ? "" : relation === "chain" ? <span style={{ color: "var(--text-tertiary)" }}>짚음</span>
                    : relation === "contain" ? <span style={{ color: "var(--text-tertiary)" }} title="조상·자손이라 교집합을 내도 좁혀지지 않는다">포함</span>
                        : overlap === 0 ? <span style={{ color: "var(--text-tertiary)" }}>0</span>
                            : (
                                <>
                                    {overlap}
                                    <span style={{
                                        display: "inline-block", height: 6, borderRadius: 3, marginLeft: 6, verticalAlign: "middle",
                                        width: Math.max(2, Math.round((overlap / Math.max(1, maxOverlap)) * 40)),
                                        background: "var(--accent-soft)", border: "1px solid var(--accent-primary)",
                                    }} />
                                </>
                            )}
            </td>
        </tr>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={mutedNote}>{children}</div>;
}
