// 그룹 입력창 — **이 앱의 유일한 그룹 편집 UI**. 골격 패널의 라벨/마커 우클릭(단일)·헤더 그룹 버튼(다중 선택
// 일괄)·분석 시트의 그룹 셀 우클릭(단일)으로 연다. 차트(분봉 타점 ▼ 우클릭)에는 더 이상 입구가 없다 — 편집은
// 여기 한 곳, 차트는 결과만 칩으로 보여준다(GroupChips).
//
// **대상 무관(generic)**: 차트든 타점이든 "붙었나(hasGroup)·토글(toggle)"만 주입받는다 — 어느 정션에 쓰는지는
// 호출부의 규약이고(차트 라벨→chart_tags / 타점 마커→review_point_tags), 사전과 색 규칙은 같은 useGroups/groupColor.
// 단일 대상(targets 길이 1)은 all/none 두 상태로 저절로 좁혀져 예전 단일 편집창과 동작이 같다.
//
// 일괄 토글 규칙은 프리셋(presetToggle)과 같은 판정이다: **전원이 갖고 있으면 전부 떼고, 아니면 빠진 것만
// 채운다** — 부분 상태에서 한 번 누르면 "일단 다 붙는다"(그게 무리를 만들던 손의 의도다).
//
// 프리셋 슬롯(숫자키 1~4)·이름 변경·삭제는 예전 차트 전용 GroupMenu 에만 있던 것을 흡수했다 — 입력창이
// 둘이면 결국 하나가 죽은 기능이 되므로, 그룹을 만지는 자리는 이제 이거 하나뿐이다.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGroup, deleteGroup, renameGroup, type Group } from "../../api/groups.js";
import { groupsQuery, groupMembershipsQuery } from "../../api/queries.js";
import { useGroups } from "../../lib/useGroups.js";
import { useWorkbench } from "../../store/workbench.js";
import { TAG_PRESET_SLOTS } from "../../store/settingsSlice.js";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { groupColor } from "../../styles/palette.js";

export function BulkGroupMenu<T>({ anchor, targets, hasGroup, toggle, label, onClose }: {
    anchor: { x: number; y: number };
    /** 대상들(1개 = 단일 편집, 여럿 = 다중 선택 일괄). */
    targets: readonly T[];
    /** 이 대상에 이 그룹이 **직접** 붙어 있나(상속 제외 — 편집 판정). */
    hasGroup: (target: T, groupId: string) => boolean;
    toggle: (target: T, groupId: string, on: boolean) => void;
    /** 헤더 표시용(종목명 · 날짜 / "선택 N개"). */
    label: string;
    onClose: () => void;
}): JSX.Element {
    const qc = useQueryClient();
    const { groups, groupById, countOf } = useGroups();
    const presets = useWorkbench((s) => s.groupPresets);
    const togglePreset = useWorkbench((s) => s.toggleGroupPreset);
    const [q, setQ] = useState("");
    const [editing, setEditing] = useState<string | null>(null); // 이름 변경 중인 groupId

    // 그룹별 보유 현황 — all(전원)·some(일부)·none. 다중일 때 행 표시와 토글 방향이 이걸 따른다.
    const stateOf = (groupId: string): "all" | "some" | "none" => {
        let n = 0;
        for (const t of targets) if (hasGroup(t, groupId)) n++;
        return n === targets.length ? "all" : n > 0 ? "some" : "none";
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
        mutationFn: (name: string) => createGroup(name, "day"), // 차트 라벨에서 만드는 건 하루 그룹
        // 새 그룹는 만들자마자 대상 전부에 붙인다 — "만들기"를 누른 의도가 곧 부착이다.
        onSuccess: (group) => {
            // 사전 캐시에 먼저 심는다(이름순 = 서버 정렬) — 심기 전에 토글하면 낙관적 부착 정렬이
            // 이름을 못 찾아 id 기준으로 끼워지고, refetch 때 칩 자리가 한 번 튄다(useGroups.nameOf 폴백의 짝).
            qc.setQueryData<Group[]>(groupsQuery().queryKey, (cur) =>
                cur && !cur.some((t) => t.id === group.id) ? [...cur, group].sort((a, b) => a.name.localeCompare(b.name)) : cur);
            for (const t of targets) toggle(t, group.id, true);
            setQ("");
            invalidate();
        },
    });
    const renameMut = useMutation({ mutationFn: (v: { id: string; name: string }) => renameGroup(v.id, v.name), onSuccess: invalidate });
    const deleteMut = useMutation({ mutationFn: (id: string) => deleteGroup(id), onSuccess: invalidate });

    const needle = q.trim().toLowerCase();
    const shown = groups.filter((t) => !needle || t.name.toLowerCase().includes(needle));
    const canCreate = needle.length > 0 && !groups.some((t) => t.name.toLowerCase() === needle);

    const submit = (): void => {
        if (canCreate) { createMut.mutate(q.trim()); return; }
        if (shown.length === 1) { toggleAll(shown[0].id); setQ(""); }
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
                        key={t.id} group={t} state={stateOf(t.id)} count={countOf(t.id)}
                        slots={presets.map((slot, i) => (slot.includes(t.id) ? i : -1)).filter((i) => i >= 0)}
                        multi={targets.length > 1}
                        editing={editing === t.id}
                        onToggleAll={() => toggleAll(t.id)}
                        onPreset={(i) => togglePreset(i, t.id)}
                        onStartEdit={() => setEditing(t.id)}
                        onCommitEdit={(name) => { setEditing(null); if (name && name !== t.name) renameMut.mutate({ id: t.id, name }); }}
                        onCancelEdit={() => setEditing(null)}
                        onDelete={() => {
                            const n = countOf(t.id);
                            const warn = n > 0 ? `\n${n}개 타점에 붙어 있습니다 — 그 부착도 함께 사라집니다.` : "";
                            if (confirm(`그룹 "${t.name}" 을 삭제할까요?${warn}`)) deleteMut.mutate(t.id);
                        }}
                    />
                ))}
            </div>

            {/* 슬롯 요약 — 지금 각 키에 무슨 조합이 걸려 있나(행 배지는 넣고 빼는 곳, 여긴 읽는 곳). */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "6px 10px", fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginBottom: 3 }}>
                    {presets.map((slot, i) => {
                        const names = slot.map((id) => groupById.get(id)?.name).filter((n): n is string => !!n);
                        return (
                            <span key={i} style={{ whiteSpace: "nowrap" }}>
                                <b style={{ color: names.length > 0 ? "var(--accent-primary)" : "var(--text-tertiary)" }}>{i + 1}</b>{" "}
                                {names.length > 0
                                    ? names.map((n, k) => <span key={k} style={{ color: groupColor(n), fontWeight: 600 }}>{k > 0 ? " + " : ""}{n}</span>)
                                    : <span style={{ opacity: 0.6 }}>—</span>}
                            </span>
                        );
                    })}
                </div>
                행의 <b>1~4</b> = 그 슬롯에 넣기/빼기 · 분봉 차트 숫자키 = 현재 타점에 그 조합 전체 탈부착
            </div>
        </AnchoredPopover>
    );
}

function GroupRow({ group, state, count, slots, multi, editing, onToggleAll, onPreset, onStartEdit, onCommitEdit, onCancelEdit, onDelete }: {
    group: Group; state: "all" | "some" | "none"; count: number; slots: number[]; // 이 그룹이 속한 슬롯들(다중 가능)
    multi: boolean; // targets 가 여럿인가 — 툴팁 문구만 갈린다
    editing: boolean;
    onToggleAll: () => void; onPreset: (index: number) => void;
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
    return (
        <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px" }}>
            <button onClick={onToggleAll}
                title={state === "all" ? "전부에서 떼기" : multi ? "빠진 대상에 채우기" : "붙이기"}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}>
                {/* ●=전원 ◐=일부 ○=없음 — 단일 대상이면 일부가 안 나와 옛 이분 토글과 같은 모양이 된다. */}
                <span style={{ width: 12, flexShrink: 0, color: c, fontSize: 11 }}>{state === "all" ? "●" : state === "some" ? "◐" : "○"}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, color: state !== "none" ? c : "var(--text-primary)", fontWeight: state === "all" ? 700 : 400 }}>{group.name}</span>
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
            </button>
            {/* 슬롯 배지 1~4 — 소속 슬롯만 채워짐(여러 개 가능). hover 아니어도 보인다(지금 배치를 늘 알 수 있게). */}
            <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                {Array.from({ length: TAG_PRESET_SLOTS }, (_, i) => {
                    const inSlot = slots.includes(i);
                    return (
                        <button key={i} onClick={() => onPreset(i)} title={inSlot ? `숫자키 ${i + 1} 슬롯에서 빼기` : `숫자키 ${i + 1} 슬롯에 넣기`}
                            style={{
                                width: 15, height: 15, borderRadius: 3, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: 0,
                                border: `1px solid ${inSlot ? "var(--accent-primary)" : "var(--border-default)"}`,
                                background: inSlot ? "var(--accent-primary)" : "transparent",
                                color: inSlot ? "#fff" : "var(--text-tertiary)",
                                opacity: inSlot || hover ? 1 : 0.35,
                            }}>{i + 1}</button>
                    );
                })}
            </span>
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
