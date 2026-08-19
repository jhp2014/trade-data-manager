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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { createGroup, setGroupParent, type GroupMembership, type GroupScope } from "../api/groups.js";
import { groupsQuery } from "../api/queries.js";
import { PanelHeader, ScrollRow, miniBtn, mutedNote } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { useGroups } from "../lib/GroupsContext.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { chartKey } from "../lib/pointKey.js";
import { ACTIVE } from "../styles/palette.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { useSetBinding } from "./filter/useSetBinding.js";
import { SetBindingLabel, setBindingControl } from "./filter/SetBindingLabel.js";
import { SetSidebar } from "./filter/SetSidebar.js";
import { setMembersOf } from "./filter/setMembers.js";
import { chainCandidates, membersOfAll, populationCounts, populationFeed, type PopulationItem } from "./group/population.js";
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
    // 지워진(개명된) 그룹은 체인에서도 뺀다 — 옛 맵의 불변식("내려간 그룹은 체인에서도 빠진다") 계승.
    // 안 빼면 죽은 이름이 브레드크럼에 남고(행이 없어 클릭 되감기 불가), 발행된 groupChain 참조가
    // BROKEN 으로 풀려 전 소비 패널의 강조가 한꺼번에 죽는다. 로딩 중엔 안 건드린다(빈 사전 ≠ 삭제).
    useEffect(() => {
        if (gv.isLoading) return;
        setChain((cur) => (cur.every((n) => gv.groupByName.has(n)) ? cur : cur.filter((n) => gv.groupByName.has(n))));
    }, [gv.isLoading, gv.groupByName]);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [newScope, setNewScope] = useState<GroupScope>("day");

    /**
     * ── 분모는 **두 층위로 센다**(하루 · 타점). 그룹의 scope 가 어느 쪽인지 정한다.
     *
     * ⚠ 여기가 처음엔 틀려 있었다: 항목을 차트 단위로만 접어 놓으면 `appliedGroupNamesOf` 가
     * **하루 소속만** 돌려주므로(시각 없는 참조 → chartOf) `scope:"point"` 그룹은 전부 0으로 나온다.
     * 맵은 평면마다 scope 가 있어서 이 함정을 피하고 있었다(타점 평면은 viewedPointRefs 를 썼고,
     * 그 주석에 "해상도가 하루면 전 노드가 0이 된다"는 실측 기록이 남아 있다). 목록으로 옮기며
     * 그 교훈을 잃었던 자리다.
     *
     * 잣대는 여전히 깔때기의 적용 집합 하나다 — 골격·시트와 어긋나면 그 어긋남은 화면에 신호가 없다.
     */
    // 분모 = 이 패널의 바인딩(디폴트 연동). 필터 결과를 묶으면 "그 생존자들이 그룹에 어떻게 분포하나"가 된다.
    const binding = useSetBinding("wb.setBinding.groupList");
    const [sideOpen, setSideOpen] = usePersistedState<boolean>(
        "wb.setSidebar.groupList", (o) => (typeof o === "boolean" ? o : null), false);
    const goToDay = useWorkbench((s) => s.goToDay);
    // 이 패널은 항목을 직접 그리지 않는다(그룹 행을 그린다) — 표현가능 술어 없음 = 전부 표현됨.
    const setMembers = useMemo(() => setMembersOf(binding.view, "day"), [binding.view]);
    const dayFeed = useMemo<GroupMembership[]>(() => {
        if (funnel.isLoading) return [];
        const seen = new Set<string>();
        const items: PopulationItem[] = [];
        for (const it of binding.view.viewedItems) {
            const k = chartKey(it);
            if (seen.has(k)) continue;
            seen.add(k);
            items.push({ stockCode: it.stockCode, date: it.date });
        }
        return populationFeed(items, (i) => gv.appliedGroupNamesOf(i));
    }, [funnel.isLoading, binding.view.viewedItems, gv]);

    const pointFeed = useMemo<GroupMembership[]>(
        () => (funnel.isLoading ? [] : populationFeed(binding.view.viewedPointRefs, (i) => gv.appliedGroupNamesOf(i))),
        [funnel.isLoading, binding.view.viewedPointRefs, gv],
    );

    const countsDay = useMemo(() => populationCounts(dayFeed), [dayFeed]);
    const countsPoint = useMemo(() => populationCounts(pointFeed), [pointFeed]);
    /** 그룹 행의 "수" — **그 그룹 자신의 층위**에서 센다(체인과 무관한 그룹 고유의 값). */
    const countOf = useCallback(
        (g: { name: string; scope: string }): number =>
            (g.scope === "point" ? countsPoint : countsDay).get(g.name) ?? 0,
        [countsDay, countsPoint],
    );

    /**
     * 체인의 해상도 — **타점 그룹이 하나라도 있으면 타점**, 아니면 하루. 깔때기의 grain 규칙과 같다:
     * 하루 조건은 그날 타점 전부에 같은 값으로 퍼지므로 `하루 & 타점` 은 타점 층위에서 성립한다.
     * 반대(타점→하루 롤업)는 규칙이 없어 깔때기에서도 막혀 있고 여기서도 안 한다.
     */
    const chainGrain: "day" | "point" = chain.some((n) => gv.groupByName.get(n)?.scope === "point") ? "point" : "day";
    const chainFeed = chainGrain === "point" ? pointFeed : dayFeed;
    const chainMembers = useMemo(() => (chain.length === 0 ? [] : membersOfAll(chainFeed, chain)), [chainFeed, chain]);

    /**
     * 후보별 "체인 전부 & 그 후보" 수 — 맵의 화살표 위 숫자와 같은 값(같은 함수를 쓴다).
     * 두 벌을 만들어 **행마다 더 세밀한 쪽**을 쓴다: 체인이 하루라도 후보가 타점 그룹이면 그 교집합은
     * 타점 층위에서만 존재하므로, 하루 피드에서 0으로 적으면 거짓이 된다.
     * (체인이 타점이면 하루 피드에서 체인 자체가 안 풀리므로 candDay 는 쓰지 않는다.)
     */
    const candDay = useMemo(
        () => (chainGrain === "day" ? chainCandidates(dayFeed, chain, { groupByName: gv.groupByName }) : new Map<string, number>()),
        [chainGrain, dayFeed, chain, gv.groupByName],
    );
    const candPoint = useMemo(
        () => chainCandidates(pointFeed, chain, { groupByName: gv.groupByName }),
        [pointFeed, chain, gv.groupByName],
    );
    const overlapOf = useCallback(
        (g: { name: string; scope: string }): number =>
            (chainGrain === "point" || g.scope === "point" ? candPoint : candDay).get(g.name) ?? 0,
        [chainGrain, candPoint, candDay],
    );

    /** 겹침순 정렬은 행마다 고른 값(overlapOf)으로 세운다 — 층위가 섞여도 같은 잣대로 줄을 세운다. */
    const overlapAll = useMemo(() => {
        const m = new Map<string, number>();
        for (const g of gv.groups) m.set(g.name, overlapOf(g));
        return m;
    }, [gv.groups, overlapOf]);
    // 막대 척도의 분모 — 행마다 다시 재면 O(그룹수²)라 한 번만 잰다.
    const maxOverlap = useMemo(() => maxOf(overlapAll), [overlapAll]);
    const rows = useMemo<GroupRow[]>(
        () => (sort === "tree" ? treeRows(gv.groups, collapsed) : overlapRows(gv.groups, overlapAll, chain, gv.groupByName)),
        [sort, gv.groups, gv.groupByName, collapsed, overlapAll, chain],
    );

    /**
     * ── 체인을 **짚음 채널로 내보낸다**. 이 패널 안에서만 뜻이 있던 걸 밖으로 내는 자리다:
     * 골격은 제 보는 집합을 다 그리고 이 41건만 앞으로 세운다(좁힐지 흐리게 할지는 그 패널의 선택).
     *
     * 항목이 아니라 **참조**(groupChain)를 싣는다 — 멤버십이 바뀌면 소비 패널의 강조도 따라온다(라이브).
     * ⚠ 참조는 유니버스 기준으로 풀리고, **소비 패널마다 자기 보는 집합과 교차해** 표시한다 — 이 패널의
     * "공통 N"(체인 ∩ 내 바인딩)과 골격 배지의 수(체인 ∩ 그 패널 선들)가 다른 건 버그가 아니라 패널별
     * 바인딩의 뜻 그대로다(각 패널의 분모는 제 헤더 칩이 말한다).
     * ⚠ 조건이 아니라 **시선**이다 — 조건으로 굳히려면 여전히 "필터에 추가"를 눌러야 한다.
     * 언마운트·체인 비우기에는 **내 것만** 거둔다(남이 짚어 둔 것을 지우면 안 된다).
     */
    const setPick = useWorkbench((s) => s.setPick);
    const clearPickFrom = useWorkbench((s) => s.clearPickFrom);
    useEffect(() => {
        if (chain.length === 0) {
            clearPickFrom("group");
            return;
        }
        setPick({ source: "group", label: chain.join(" & "), ref: { kind: "groupChain", names: chain } });
    }, [chain, setPick, clearPickFrom]);
    useEffect(() => () => clearPickFrom("group"), [clearPickFrom]);

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
            return (overlapAll.get(name) ?? 0) > 0 ? [...cur, name] : cur;
        });
    }, [overlapAll]);

    const parentMut = useMutation({
        mutationFn: (v: { name: string; parentName: string | null }) => setGroupParent(v.name, v.parentName),
        onSettled: () => void qc.invalidateQueries({ queryKey: groupsQuery().queryKey }),
    });
    const createMut = useMutation({
        mutationFn: (v: { name: string; scope: GroupScope }) => createGroup(v.name, v.scope),
        onSettled: () => void qc.invalidateQueries({ queryKey: groupsQuery().queryKey }),
    });
    const submitNew = useCallback((): void => {
        const n = newName.trim();
        if (n === "") return;
        createMut.mutate({ name: n, scope: newScope });
        setNewName("");
        setAdding(false);
    }, [newName, newScope, createMut]);

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
        setBindingControl({ binding, open: sideOpen, setOpen: setSideOpen }),
        {
            kind: "choice", id: "sort", name: "정렬", help: "계층 그대로 볼까, 지금 체인과 겹치는 순으로 볼까",
            values: [{ v: "tree", label: "계층" }, { v: "overlap", label: "겹침" }],
            value: sort, set: (v) => setSort(v === "overlap" ? "overlap" : "tree"),
        },
        {
            kind: "action", id: "newGroup", name: "+ 새 그룹", help: "이름만 정하면 된다(층위는 하루)",
            run: () => setAdding((v) => !v),
        },
    ], [sort, setSort, binding, sideOpen, setSideOpen]);

    if (gv.isLoading) return <Note>불러오는 중…</Note>;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }}>
            <PanelHeader chrome={false} padding="5px 10px"
                style={{ borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>
                <SetBindingLabel binding={binding} members={setMembers} />
                {/* 분모를 **두 층위로** 적는다 — 행마다 수의 단위가 그 그룹의 scope 라, 분모도 둘이어야 읽힌다. */}
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}
                    title="하루 = (종목·날짜) · 타점 = (종목·날짜·시각). 그룹의 scope 가 어느 쪽에서 셀지 정한다">
                    그룹 {gv.groups.length} · 분모 {funnel.isLoading ? "…" : `하루 ${dayFeed.length} · 타점 ${pointFeed.length}`}
                    {binding.view.isFiltering ? "" : " (전체)"}
                </span>
                <HeaderControls controls={controls} storageKey="wb.headerPins.groupList" />
            </PanelHeader>

            {adding && (
                // scope 는 **만들 때 정하고 못 바꾼다** — 담을 수 있는 항목의 층위가 곧 그룹의 정체다.
                <div style={{ display: "flex", gap: 4, padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
                        placeholder="새 그룹 이름 (Enter)" style={{ fontSize: 11, flex: 1 }} />
                    <select value={newScope} onChange={(e) => setNewScope(e.target.value === "point" ? "point" : "day")}
                        title="담을 항목의 층위 — 하루는 (종목·날짜), 타점은 (종목·날짜·시각)" style={{ fontSize: 11 }}>
                        <option value="day">하루</option>
                        <option value="point">타점</option>
                    </select>
                    <button onClick={submitNew} disabled={newName.trim() === ""} style={{ ...miniBtn, padding: "1px 6px" }}>추가</button>
                    <button onClick={() => setAdding(false)} style={{ ...miniBtn, padding: "1px 6px" }}>취소</button>
                </div>
            )}

            {/* 머리줄 — 맵의 체인 작업줄이 여기로 왔다. 교집합 칩이 서던 자리가 "공통 N" 이다. */}
            {chain.length > 0 && (
                <ScrollRow gap={6} style={{
                    flexShrink: 0, padding: "4px 10px",
                    background: "var(--accent-soft)", borderBottom: "1px solid var(--border-default)",
                    fontSize: 11.5, whiteSpace: "nowrap",
                }}>
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
                </ScrollRow>
            )}

            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                {/* 트리와 집합 사이드바가 한 줄 — 사이드바는 오른쪽(분모 집합의 멤버 목록). */}
                <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto" }}>
                    {gv.groups.length === 0 && <div style={mutedNote}>그룹이 없습니다. 위 <b>+ 새 그룹</b>으로 만드세요.</div>}
                    {rows.length > 0 && (
                        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                            <thead>
                                <tr style={{ color: "var(--text-tertiary)", fontSize: 10, textAlign: "left" }}>
                                    <th style={{ fontWeight: 400, padding: "3px 10px" }}>그룹</th>
                                    <th style={{ width: 42, fontWeight: 400, padding: "3px 0", textAlign: "right" }}>수</th>
                                    {/* **고정 명칭**이다 — 체인 이름을 여기 넣으면 짚을 때마다 열 폭이 출렁인다.
                                        무엇과의 교집합인지는 바로 위 머리줄이 이미 말한다. */}
                                    <th style={{ width: 78, fontWeight: 400, padding: "3px 10px 3px 8px" }}
                                        title="체인 전부와 이 그룹의 교집합 — 이 그룹을 더하면 남는 수">교집합</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <GroupRowView key={r.group.name} row={r}
                                        count={countOf(r.group)}
                                        relation={relationOf(r.group.name, chain, gv.groupByName)}
                                        overlap={overlapAll.get(r.group.name) ?? 0}
                                        maxOverlap={maxOverlap}
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
                {sideOpen && (
                    <SetSidebar binding={binding} members={setMembers} showTime={false}
                        onPick={(it) => goToDay({ code: it.stockCode, date: it.date })} />
                )}
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
            title={`${pathOf()} · 분모 ${count}\n클릭 = 이 그룹만 · Ctrl+클릭 = 교집합에 더하기 · 끌어서 다른 그룹 밑으로`}
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
                {/* scope 배지 — 이 그룹이 무엇을 담는 바구니인지. 수의 단위가 여기서 갈리므로 상시 표기다.
                    긴 설명([종목·날짜·시각])은 툴팁으로 — 행마다 반복하면 이름이 밀린다. */}
                <span style={{
                    marginLeft: 6, fontSize: 9.5, padding: "0 5px", borderRadius: 3, verticalAlign: "1px",
                    background: "var(--bg-tertiary)", color: "var(--text-tertiary)", whiteSpace: "nowrap",
                }} title={group.scope === "point" ? "타점 그룹 — (종목·날짜·시각)" : "하루 그룹 — (종목·날짜)"}>
                    {group.scope === "point" ? "타점" : "하루"}
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
