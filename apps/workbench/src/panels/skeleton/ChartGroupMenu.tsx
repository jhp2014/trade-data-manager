// 그룹 입력창 — **이 앱의 유일한 그룹 편집 UI**. 골격 패널의 라벨/마커 우클릭(단일)·헤더 그룹 버튼(다중 선택
// 일괄)으로 연다. 차트·분석 시트에는 입구가 없다 — 편집은 여기 한 곳, 다른 화면은 결과만 보여준다(GroupChips).
//
// **대상 무관(generic)**: 차트든 타점이든 "붙었나(hasGroup)·토글(toggle)"만 주입받는다 — 어느 정션에 쓰는지는
// 호출부의 규약이고(차트 라벨→chart_tags / 타점 마커→review_point_tags), 사전과 색 규칙은 같은 useGroups/groupColor.
// 단일 대상(targets 길이 1)은 all/none 두 상태로 저절로 좁혀져 예전 단일 편집창과 동작이 같다.
//
// 일괄 토글 규칙: **전원이 갖고 있으면 전부 떼고, 아니면 빠진 것만 채운다** — 부분 상태에서 한 번 누르면
// "일단 다 붙는다"(그게 무리를 만들던 손의 의도다).
//
// **scope 는 호출부가 준다** — 하루 대상(차트 라벨)이면 day, 타점 대상(마커)이면 point. 목록도 그 scope 만
// 보여주고 생성도 그 scope 로 한다. 안 맞는 그룹을 보여줬다 서버 거절로 배우게 하지 않는다.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGroup, deleteGroup, renameGroup, type Group, type GroupScope } from "../../api/groups.js";
import { groupsQuery, groupMembershipsQuery } from "../../api/queries.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { groupColor } from "../../styles/palette.js";

export function BulkGroupMenu<T>({ anchor, targets, scope, hasGroup, inheritedVia, toggle, label, onClose }: {
    anchor: { x: number; y: number };
    /** 대상들(1개 = 단일 편집, 여럿 = 다중 선택 일괄). */
    targets: readonly T[];
    /** 대상의 층위 — 목록 필터와 생성 scope 가 이걸 따른다. */
    scope: GroupScope;
    /** 이 대상에 이 그룹이 **직접** 붙어 있나(상속 제외 — 편집 판정). */
    hasGroup: (target: T, groupId: string) => boolean;
    /**
     * 계층 상속으로만 적용되면 경유한 하위 그룹 이름, 아니면 null. 주면 상속 행을 흐리게 그리고
     * 토글을 막는다 — 뺄 직접 부착이 없어 눌러도 아무 일도 안 일어나는 행을 스위치처럼 두지 않는다.
     */
    inheritedVia?: (target: T, groupId: string) => string | null;
    toggle: (target: T, groupId: string, on: boolean) => void;
    /** 헤더 표시용(종목명 · 날짜 / "선택 N개"). */
    label: string;
    onClose: () => void;
}): JSX.Element {
    const qc = useQueryClient();
    const { groups, countOf } = useGroups();
    const [q, setQ] = useState("");
    const [editing, setEditing] = useState<string | null>(null); // 이름 변경 중인 groupId

    // 그룹별 보유 현황 — all(전원)·some(일부)·none. 다중일 때 행 표시와 토글 방향이 이걸 따른다.
    const stateOf = (groupId: string): "all" | "some" | "none" => {
        let n = 0;
        for (const t of targets) if (hasGroup(t, groupId)) n++;
        return n === targets.length ? "all" : n > 0 ? "some" : "none";
    };
    /** 직접은 없는데 **전원이 상속으로** 적용받는 그룹 — 경유지 이름. 일부만 상속이면 보통 행(채우기 가능). */
    const inheritedOf = (groupId: string): string | null => {
        if (!inheritedVia) return null;
        let name: string | null = null;
        for (const t of targets) {
            const via = inheritedVia(t, groupId);
            if (via === null) return null;
            name ??= via;
        }
        return name;
    };
    const toggleAll = (groupId: string): void => {
        const st = stateOf(groupId);
        // 전원 보유 → 전부 떼기 / 아니면 빠진 것만 채우기(프리셋 규칙).
        for (const t of targets) {
            const has = hasGroup(t, groupId);
            if (st === "all") { if (has) toggle(t, groupId, false); }
            else if (!has) toggle(t, groupId, true);
        }
    };

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: groupsQuery().queryKey });
        void qc.invalidateQueries({ queryKey: groupMembershipsQuery().queryKey }); // 삭제 = 멤버십도 cascade
    };
    const createMut = useMutation({
        mutationFn: (name: string) => createGroup(name, scope), // 대상 층위 그대로 — 하루 대상이면 하루 그룹
        // 새 그룹는 만들자마자 대상 전부에 붙인다 — "만들기"를 누른 의도가 곧 부착이다.
        onSuccess: (group) => {
            // 사전 캐시에 먼저 심는다(이름순 = 서버 정렬) — 심기 전에 토글하면 낙관적 부착 정렬이
            // 이름을 못 찾아 id 기준으로 끼워지고, refetch 때 칩 자리가 한 번 튄다(useGroups.nameOf 폴백의 짝).
            qc.setQueryData<Group[]>(groupsQuery().queryKey, (cur) =>
                cur && !cur.some((t) => t.name === group.name) ? [...cur, group].sort((a, b) => a.name.localeCompare(b.name)) : cur);
            for (const t of targets) toggle(t, group.name, true);
            setQ("");
            invalidate();
        },
    });
    const renameMut = useMutation({ mutationFn: (v: { id: string; name: string }) => renameGroup(v.id, v.name), onSuccess: invalidate });
    const deleteMut = useMutation({ mutationFn: (id: string) => deleteGroup(id), onSuccess: invalidate });

    const needle = q.trim().toLowerCase();
    const scoped = groups.filter((t) => t.scope === scope); // 다른 층위 그룹은 붙일 수 없으니 보여주지도 않는다
    const shown = scoped.filter((t) => !needle || t.name.toLowerCase().includes(needle));
    const canCreate = needle.length > 0 && !scoped.some((t) => t.name.toLowerCase() === needle);

    const submit = (): void => {
        if (canCreate) { createMut.mutate(q.trim()); return; }
        if (shown.length === 1) { toggleAll(shown[0].name); setQ(""); }
    };

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={252} maxWidth={300} maxHeight="min(60vh, 420px)" padding={0} placement="beside" offset={8}>
            <MenuLabel>{label} · 그룹</MenuLabel>
            <div style={{ padding: "0 10px 7px" }}>
                <input
                    autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
                    placeholder="그룹 검색 · 새로 만들기"
                    style={inputStyle}
                />
            </div>
            {canCreate && (
                <button onClick={() => createMut.mutate(q.trim())} style={{ ...rowStyle, color: "var(--accent-primary)", fontWeight: 600 }}>
                    + &quot;{q.trim()}&quot; 새 그룹으로 만들어 붙이기
                </button>
            )}
            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {shown.length === 0 && !canCreate && <div style={{ ...rowStyle, color: "var(--text-tertiary)" }}>그룹 없음</div>}
                {shown.map((t) => (
                    <GroupRow
                        key={t.name} group={t} state={stateOf(t.name)} count={countOf(t.name)}
                        inheritedVia={stateOf(t.name) === "none" ? inheritedOf(t.name) : null}
                        multi={targets.length > 1}
                        editing={editing === t.name}
                        onToggleAll={() => toggleAll(t.name)}
                        onStartEdit={() => setEditing(t.name)}
                        onCommitEdit={(name) => { setEditing(null); if (name && name !== t.name) renameMut.mutate({ id: t.name, name }); }}
                        onCancelEdit={() => setEditing(null)}
                        onDelete={() => {
                            const n = countOf(t.name);
                            const warn = n > 0 ? `\n${n}개 타점에 붙어 있습니다 — 그 부착도 함께 사라집니다.` : "";
                            if (confirm(`그룹 "${t.name}" 을 삭제할까요?${warn}`)) deleteMut.mutate(t.name);
                        }}
                    />
                ))}
            </div>
        </AnchoredPopover>
    );
}

function GroupRow({ group, state, count, inheritedVia, multi, editing, onToggleAll, onStartEdit, onCommitEdit, onCancelEdit, onDelete }: {
    group: Group; state: "all" | "some" | "none"; count: number;
    inheritedVia: string | null; // 전원이 계층 상속으로 적용받으면 경유 그룹 이름 — 흐린 표시 + 토글 차단
    multi: boolean; // targets 가 여럿인가 — 툴팁 문구만 갈린다
    editing: boolean;
    onToggleAll: () => void;
    onStartEdit: () => void; onCommitEdit: (name: string) => void; onCancelEdit: () => void; onDelete: () => void;
}): JSX.Element {
    const [hover, setHover] = useState(false);
    const escRef = useRef(false);
    const c = groupColor(group.name);

    if (editing) {
        return (
            <div style={{ ...rowStyle, cursor: "default" }}>
                <input
                    autoFocus defaultValue={group.name}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { e.preventDefault(); escRef.current = true; e.currentTarget.blur(); } }}
                    onBlur={(e) => { if (escRef.current) { escRef.current = false; onCancelEdit(); } else onCommitEdit(e.currentTarget.value.trim()); }}
                    style={{ ...inputStyle, padding: "3px 6px" }}
                />
            </div>
        );
    }
    const inherited = inheritedVia !== null;
    return (
        <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px" }}>
            <button onClick={inherited ? undefined : onToggleAll} disabled={inherited}
                title={inherited
                    ? `"${inheritedVia}" 소속이라 자동 적용 — 빼려면 그 하위 그룹에서 뺀다`
                    : state === "all" ? "전부에서 떼기" : multi ? "빠진 대상에 채우기" : "붙이기"}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: inherited ? "default" : "pointer", padding: 0, font: "inherit", textAlign: "left", opacity: inherited ? 0.55 : 1 }}>
                {/* ●=전원 ◐=일부 ○=없음 — 상속(흐린 ●)은 결과지 스위치가 아니라 누를 수 없다. */}
                <span style={{ width: 12, flexShrink: 0, color: c, fontSize: 11 }}>{state === "all" || inherited ? "●" : state === "some" ? "◐" : "○"}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, color: state !== "none" || inherited ? c : "var(--text-primary)", fontWeight: state === "all" ? 700 : 400 }}>
                    {group.name}
                    {inherited && <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 5 }}>하위 {inheritedVia} 경유</span>}
                </span>
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
            </button>
            <span style={{ display: "inline-flex", gap: 1, flexShrink: 0, visibility: hover ? "visible" : "hidden" }}>
                <button onClick={onStartEdit} title="이름 변경" style={iconBtn}>✎</button>
                <button onClick={onDelete} title="그룹 삭제(부착도 함께)" style={{ ...iconBtn, color: "var(--rise)" }}>🗑</button>
            </span>
        </div>
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
const iconBtn: React.CSSProperties = { border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "1px 2px" };
