// 타점 태그 입력창 — 분봉 차트의 타점 ▼ 우클릭으로 연다. **태그 입력의 유일한 자리**.
// 타점 자체(space=저장/삭제)와 분리돼 있다: 여긴 이미 있는 타점에 붙이고 떼는 일만 한다.
//  · 붙은 태그 = 위쪽 칩(클릭 = 떼기) · 목록에서 클릭 = 토글 · 검색어가 사전에 없으면 "새 태그 만들기"
//  · 각 행의 1~4 = 숫자키 슬롯 지정(같은 창에서 — 설정 모달까지 가지 않는다). 지정된 슬롯은 채워진 배지.
//  · 행 hover 의 ✎/🗑 = 사전 정리(이름 변경 / 삭제). 삭제는 붙어 있는 건수를 확인시킨다(cascade 라 되돌릴 수 없음).
import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTag, deleteTag, renameTag, type Tag } from "../api/tags.js";
import { tagsQuery, tagAttachmentsQuery } from "../api/queries.js";
import { useTags } from "../lib/useTags.js";
import { useWorkbench } from "../store/workbench.js";
import { TAG_PRESET_SLOTS } from "../store/settingsSlice.js";
import { AnchoredPopover, MenuLabel } from "../ui/Dialog.js";
import { TagChips } from "../components/TagChips.js";
import { tagColor } from "../styles/palette.js";
import type { PointRef } from "../lib/pointKey.js";

export function TagMenu({ anchor, point, label, onClose }: {
    anchor: { x: number; y: number };
    point: PointRef;
    /** 헤더 표시용(종목명 · 시각). */
    label: string;
    onClose: () => void;
}): JSX.Element {
    const qc = useQueryClient();
    const { tags, tagsOf, has, countOf, toggle } = useTags();
    const presets = useWorkbench((s) => s.tagPresets);
    const setPreset = useWorkbench((s) => s.setTagPreset);
    const [q, setQ] = useState("");
    const [editing, setEditing] = useState<string | null>(null); // 이름 변경 중인 tagId

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: tagsQuery().queryKey });
        void qc.invalidateQueries({ queryKey: tagAttachmentsQuery().queryKey }); // 삭제 = 부착도 cascade
    };
    // 새 태그는 만들자마자 이 타점에 붙인다 — "만들기"를 누른 의도가 곧 부착이다(두 번 클릭시키지 않는다).
    const createMut = useMutation({
        mutationFn: (name: string) => createTag(name),
        onSuccess: (tag) => { toggle(point, tag.id, true); setQ(""); invalidate(); },
    });
    const renameMut = useMutation({ mutationFn: (v: { id: string; name: string }) => renameTag(v.id, v.name), onSuccess: invalidate });
    const deleteMut = useMutation({ mutationFn: (id: string) => deleteTag(id), onSuccess: invalidate });

    const attached = tagsOf(point);
    const needle = q.trim().toLowerCase();
    const shown = useMemo(() => (needle ? tags.filter((t) => t.name.toLowerCase().includes(needle)) : tags), [tags, needle]);
    const exact = tags.some((t) => t.name.toLowerCase() === needle);
    const canCreate = needle.length > 0 && !exact;

    const submit = (): void => {
        if (canCreate) { createMut.mutate(q.trim()); return; }
        // 검색 결과가 하나면 Enter = 그 태그 토글(연속 입력이 키보드만으로 끝난다).
        if (shown.length === 1) { toggle(point, shown[0].id); setQ(""); }
    };

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={252} maxWidth={300} maxHeight="min(60vh, 420px)" padding={0} placement="beside" offset={8}>
            <MenuLabel>{label} · 태그</MenuLabel>

            {/* 붙은 태그 — 클릭 = 떼기. 지금 상태가 맨 위에 있어야 토글이 뭘 하는지 보인다. */}
            <div style={{ padding: "0 10px 6px" }}>
                <TagChips tags={attached} scroll empty="아직 없음 — 아래에서 고르거나 새로 만드세요" onPick={(t) => toggle(point, t.id, false)} />
            </div>

            <div style={{ padding: "0 10px 7px" }}>
                <input
                    autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
                    placeholder="태그 검색 · 새로 만들기"
                    style={inputStyle}
                />
            </div>

            {canCreate && (
                <button onClick={() => createMut.mutate(q.trim())} style={{ ...rowStyle, color: "var(--accent-primary)", fontWeight: 600 }}>
                    + &quot;{q.trim()}&quot; 새 태그로 만들어 붙이기
                </button>
            )}

            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {shown.length === 0 && !canCreate && <div style={{ ...rowStyle, color: "var(--text-tertiary)" }}>태그 없음</div>}
                {shown.map((t) => (
                    <TagRow
                        key={t.id} tag={t} on={has(point, t.id)} count={countOf(t.id)}
                        presetIndex={presets.indexOf(t.id)}
                        editing={editing === t.id}
                        onToggle={() => toggle(point, t.id)}
                        onPreset={(i) => setPreset(i, t.id)}
                        onStartEdit={() => setEditing(t.id)}
                        onCommitEdit={(name) => { setEditing(null); if (name && name !== t.name) renameMut.mutate({ id: t.id, name }); }}
                        onCancelEdit={() => setEditing(null)}
                        onDelete={() => {
                            const n = countOf(t.id);
                            const warn = n > 0 ? `\n${n}개 타점에 붙어 있습니다 — 그 부착도 함께 사라집니다.` : "";
                            if (confirm(`태그 "${t.name}" 을 삭제할까요?${warn}`)) deleteMut.mutate(t.id);
                        }}
                    />
                ))}
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "6px 10px", fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                행의 <b>1~4</b> = 숫자키 슬롯 지정 · 차트에서 그 키로 현재 타점에 탈부착
            </div>
        </AnchoredPopover>
    );
}

function TagRow({ tag, on, count, presetIndex, editing, onToggle, onPreset, onStartEdit, onCommitEdit, onCancelEdit, onDelete }: {
    tag: Tag; on: boolean; count: number; presetIndex: number;
    editing: boolean;
    onToggle: () => void; onPreset: (index: number) => void;
    onStartEdit: () => void; onCommitEdit: (name: string) => void; onCancelEdit: () => void; onDelete: () => void;
}): JSX.Element {
    const [hover, setHover] = useState(false);
    const escRef = useRef(false);
    const c = tagColor(tag.name);

    if (editing) {
        return (
            <div style={{ ...rowStyle, cursor: "default" }}>
                <input
                    autoFocus defaultValue={tag.name}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { e.preventDefault(); escRef.current = true; e.currentTarget.blur(); } }}
                    onBlur={(e) => { if (escRef.current) { escRef.current = false; onCancelEdit(); } else onCommitEdit(e.currentTarget.value.trim()); }}
                    style={{ ...inputStyle, padding: "3px 6px" }}
                />
            </div>
        );
    }
    return (
        <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px" }}>
            <button onClick={onToggle} title={on ? "이 타점에서 떼기" : "이 타점에 붙이기"}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}>
                <span style={{ width: 12, flexShrink: 0, color: c, fontSize: 11 }}>{on ? "●" : "○"}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, color: on ? c : "var(--text-primary)", fontWeight: on ? 700 : 400 }}>{tag.name}</span>
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
            </button>
            {/* 슬롯 배지 1~4 — 지정된 슬롯만 채워짐. hover 아니어도 보인다(지금 배치를 늘 알 수 있게). */}
            <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                {Array.from({ length: TAG_PRESET_SLOTS }, (_, i) => (
                    <button key={i} onClick={() => onPreset(i)} title={`숫자키 ${i + 1} 슬롯에 지정`}
                        style={{
                            width: 15, height: 15, borderRadius: 3, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: 0,
                            border: `1px solid ${presetIndex === i ? "var(--accent-primary)" : "var(--border-default)"}`,
                            background: presetIndex === i ? "var(--accent-primary)" : "transparent",
                            color: presetIndex === i ? "#fff" : "var(--text-tertiary)",
                            opacity: presetIndex === i || hover ? 1 : 0.35,
                        }}>{i + 1}</button>
                ))}
            </span>
            <span style={{ display: "inline-flex", gap: 1, flexShrink: 0, visibility: hover ? "visible" : "hidden" }}>
                <button onClick={onStartEdit} title="이름 변경" style={iconBtn}>✎</button>
                <button onClick={onDelete} title="태그 삭제(부착도 함께)" style={{ ...iconBtn, color: "var(--rise)" }}>🗑</button>
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
