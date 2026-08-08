// 일괄 태그 입력창 — 골격 패널의 라벨/마커 우클릭(단일)·헤더 태그 버튼(다중 선택 일괄)으로 연다.
// **대상 무관(generic)**: 차트든 타점이든 "붙었나(hasTag)·토글(toggle)"만 주입받는다 — 어느 정션에 쓰는지는
// 호출부의 규약이고(차트 라벨→chart_tags / 타점 마커→review_point_tags), 사전과 색 규칙은 같은 useTags/tagColor.
// 타점 입력창(TagMenu)과 갈라 둔 이유: 저긴 타점 하나 + 숫자키 슬롯이 본체고, 여긴 **여러 대상 일괄**이 본체다.
//
// 일괄 토글 규칙은 프리셋(presetToggle)과 같은 판정이다: **전원이 갖고 있으면 전부 떼고, 아니면 빠진 것만
// 채운다** — 부분 상태에서 한 번 누르면 "일단 다 붙는다"(그게 무리를 만들던 손의 의도다).
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTag, type Tag } from "../../api/tags.js";
import { tagsQuery } from "../../api/queries.js";
import { useTags } from "../../lib/useTags.js";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { tagColor } from "../../styles/palette.js";

export function BulkTagMenu<T>({ anchor, targets, hasTag, toggle, label, onClose }: {
    anchor: { x: number; y: number };
    /** 대상들(1개 = 단일 편집, 여럿 = 다중 선택 일괄). */
    targets: readonly T[];
    /** 이 대상에 이 태그가 **직접** 붙어 있나(상속 제외 — 편집 판정). */
    hasTag: (target: T, tagId: string) => boolean;
    toggle: (target: T, tagId: string, on: boolean) => void;
    /** 헤더 표시용(종목명 · 날짜 / "선택 N개"). */
    label: string;
    onClose: () => void;
}): JSX.Element {
    const qc = useQueryClient();
    const { tags, countOf } = useTags();
    const [q, setQ] = useState("");

    // 태그별 보유 현황 — all(전원)·some(일부)·none. 다중일 때 행 표시와 토글 방향이 이걸 따른다.
    const stateOf = (tagId: string): "all" | "some" | "none" => {
        let n = 0;
        for (const t of targets) if (hasTag(t, tagId)) n++;
        return n === targets.length ? "all" : n > 0 ? "some" : "none";
    };
    const toggleAll = (tagId: string): void => {
        const st = stateOf(tagId);
        // 전원 보유 → 전부 떼기 / 아니면 빠진 것만 채우기(프리셋 규칙).
        for (const t of targets) {
            const has = hasTag(t, tagId);
            if (st === "all") { if (has) toggle(t, tagId, false); }
            else if (!has) toggle(t, tagId, true);
        }
    };

    const createMut = useMutation({
        mutationFn: (name: string) => createTag(name),
        // 새 태그는 만들자마자 대상 전부에 붙인다 — "만들기"를 누른 의도가 곧 부착이다.
        onSuccess: (tag) => {
            // 사전 캐시에 먼저 심는다(이름순 = 서버 정렬) — 심기 전에 토글하면 낙관적 부착 정렬이
            // 이름을 못 찾아 id 기준으로 끼워지고, refetch 때 칩 자리가 한 번 튄다(useTags.nameOf 폴백의 짝).
            qc.setQueryData<Tag[]>(tagsQuery().queryKey, (cur) =>
                cur && !cur.some((t) => t.id === tag.id) ? [...cur, tag].sort((a, b) => a.name.localeCompare(b.name)) : cur);
            for (const t of targets) toggle(t, tag.id, true);
            setQ("");
            void qc.invalidateQueries({ queryKey: tagsQuery().queryKey });
        },
    });

    const needle = q.trim().toLowerCase();
    const shown = useMemo(() => (needle ? tags.filter((t) => t.name.toLowerCase().includes(needle)) : tags), [tags, needle]);
    const canCreate = needle.length > 0 && !tags.some((t) => t.name.toLowerCase() === needle);

    const submit = (): void => {
        if (canCreate) { createMut.mutate(q.trim()); return; }
        if (shown.length === 1) { toggleAll(shown[0].id); setQ(""); }
    };

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={230} maxWidth={290} maxHeight="min(55vh, 380px)" padding={0} placement="beside" offset={8}>
            <MenuLabel>{label} · 태그</MenuLabel>
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
                {shown.map((t) => {
                    const st = stateOf(t.id);
                    const c = tagColor(t.name);
                    return (
                        <button key={t.id} onClick={() => toggleAll(t.id)}
                            title={st === "all" ? "전부에서 떼기" : targets.length > 1 ? "빠진 대상에 채우기" : "붙이기"}
                            style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 6 }}>
                            {/* ●=전원 ◐=일부 ○=없음 — 다중 일괄의 3상태가 행에서 바로 읽힌다. */}
                            <span style={{ width: 12, flexShrink: 0, color: c, fontSize: 11 }}>{st === "all" ? "●" : st === "some" ? "◐" : "○"}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: st !== "none" ? c : "var(--text-primary)", fontWeight: st === "all" ? 700 : 400 }}>{t.name}</span>
                            <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{countOf(t.id)}</span>
                        </button>
                    );
                })}
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
