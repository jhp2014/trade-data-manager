// 저장 필터 — 배치 보드·시트 공용. 예전엔 한 줄을 통째로 먹는 칩 바였는데, 상단이 이미 빽빽해서
// **컨트롤 줄에 버튼 두 개**(저장 / 불러오기 팝오버)로 줄였다. 목록은 개수가 늘어도 안 무너진다.
//
// 저장 단위는 **필터 전체 스냅샷**(밴드+날짜+시간+태그)이다. 예전엔 밴드만 담아서 불러와도 저장한
// 그 화면이 재현되지 않았다 — 저장의 뜻이 "그대로 다시 보기"라 부분 저장은 의미가 없다.
import { useState, type CSSProperties } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { savedFilterSnapshot } from "../../store/rankViewSlice.js";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { isTagExprEmpty } from "./tagFilter.js";

export function SavedFilterControls({ axes }: { axes: { id: string; name: string }[] }): JSX.Element {
    const rankBands = useWorkbench((s) => s.rankBands);
    const axisValueRanges = useWorkbench((s) => s.axisValueRanges);
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const tagExpr = useWorkbench((s) => s.tagExpr);
    const saved = useWorkbench((s) => s.savedFilters);
    const saveFilter = useWorkbench((s) => s.saveFilter);
    const [open, setOpen] = useState<{ x: number; y: number } | null>(null);

    const active = Object.keys(rankBands).length > 0 || Object.keys(axisValueRanges).length > 0 || dateRanges.length > 0 || timeRanges.length > 0 || !isTagExprEmpty(tagExpr);
    // 자동 이름 — 걸린 차원을 그대로 읽어준다(축 이름 우선, 없으면 어떤 차원이 걸렸는지).
    const autoLabel = (): string => {
        const parts = axes.filter((a) => rankBands[a.id] || axisValueRanges[a.id]).map((a) => a.name);
        if (dateRanges.length > 0) parts.push("날짜");
        if (timeRanges.length > 0) parts.push("시간");
        if (!isTagExprEmpty(tagExpr)) parts.push("태그");
        return parts.join(" · ") || "필터";
    };

    return (
        <>
            <button
                onClick={() => { if (!active) return; const n = prompt("저장 필터 이름", autoLabel()); if (n && n.trim()) saveFilter(n.trim(), { bands: rankBands, axisValueRanges, dateRanges, timeRanges, tagExpr }); }}
                disabled={!active}
                title={active ? "지금 필터(밴드·값구간·날짜·시간·태그)를 이름 붙여 저장" : "먼저 필터를 거세요"}
                style={{ ...miniBtn, opacity: active ? 1 : 0.45, cursor: active ? "pointer" : "default", borderStyle: "dashed" }}
            >필터 저장</button>
            <button onClick={(e) => setOpen({ x: e.clientX, y: e.clientY })} disabled={saved.length === 0}
                title={saved.length > 0 ? "저장한 필터 불러오기" : "저장한 필터가 없습니다"}
                style={{ ...miniBtn, opacity: saved.length > 0 ? 1 : 0.45, cursor: saved.length > 0 ? "pointer" : "default" }}
            >불러오기{saved.length > 0 ? ` ${saved.length}` : ""}</button>
            {open && <SavedFilterMenu anchor={open} onClose={() => setOpen(null)} />}
        </>
    );
}

function SavedFilterMenu({ anchor, onClose }: { anchor: { x: number; y: number }; onClose: () => void }): JSX.Element {
    const saved = useWorkbench((s) => s.savedFilters);
    const applyRankFilter = useWorkbench((s) => s.applyRankFilter);
    const renameFilter = useWorkbench((s) => s.renameFilter);
    const deleteFilter = useWorkbench((s) => s.deleteFilter);
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={200} maxWidth={280} maxHeight="min(56vh, 380px)" padding={0} placement="beside" offset={6}>
            <MenuLabel>저장 필터 · 클릭 = 그대로 불러오기</MenuLabel>
            {saved.map((f) => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px 2px 10px", borderTop: "1px solid var(--border-subtle)" }}>
                    <button onClick={() => { applyRankFilter(savedFilterSnapshot(f)); onClose(); }}
                        style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "5px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</button>
                    <button onClick={() => { const n = prompt("필터 이름", f.name); if (n && n.trim()) renameFilter(f.id, n.trim()); }} title="이름 변경" style={iconBtn}>✎</button>
                    <button onClick={() => deleteFilter(f.id)} title="삭제" style={iconBtn}>×</button>
                </div>
            ))}
        </AnchoredPopover>
    );
}

const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" };
const iconBtn: CSSProperties = { border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 2px", flexShrink: 0 };
