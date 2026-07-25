import { type CSSProperties } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { useHorizontalWheel } from "../../lib/useHorizontalWheel.js";

// 저장 필터 바 — 배치 보드·시트 공용. 현재 밴드를 이름 붙여 담고(store 공유·영속), 칩 클릭으로 불러와 비교.
//  · 밴드는 공유 rankBands 라 어느 패널에서 저장/적용해도 양쪽 반영. 라벨=밴드 걸린 축 이름 자동(더블클릭 변경).

export function SavedFilterBar({ axes }: { axes: { id: string; name: string }[] }): JSX.Element {
    const rankBands = useWorkbench((s) => s.rankBands);
    const applyRankBands = useWorkbench((s) => s.applyRankBands);
    const saved = useWorkbench((s) => s.savedFilters);
    const saveFilter = useWorkbench((s) => s.saveFilter);
    const renameFilter = useWorkbench((s) => s.renameFilter);
    const deleteFilter = useWorkbench((s) => s.deleteFilter);
    const bandsActive = Object.keys(rankBands).length > 0;
    const autoLabel = (): string => axes.filter((a) => rankBands[a.id]).map((a) => a.name).join(" · ") || "필터";
    const wheelRef = useHorizontalWheel<HTMLDivElement>(true); // hover 시 휠 = 가로 스크롤
    return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", minWidth: 0, minHeight: 30 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", flexShrink: 0 }}>저장 필터</span>
            <div ref={wheelRef} className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", flex: 1, minWidth: 0 }}>
                {saved.length === 0 && <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>밴드 걸고 "현재 저장" → 칩 클릭으로 불러와 비교</span>}
                {saved.map((f) => (
                    <SavedChip key={f.id} name={f.name} onApply={() => applyRankBands(f.bands)} onRename={(nm) => renameFilter(f.id, nm)} onDelete={() => deleteFilter(f.id)} />
                ))}
            </div>
            <button onClick={() => bandsActive && saveFilter(autoLabel(), rankBands)} disabled={!bandsActive} title={bandsActive ? "현재 밴드를 저장 필터로 담기" : "먼저 밴드를 거세요"}
                style={{ ...miniBtn, flexShrink: 0, opacity: bandsActive ? 1 : 0.45, cursor: bandsActive ? "pointer" : "default", borderStyle: "dashed" }}>+ 현재 저장</button>
        </div>
    );
}

function SavedChip({ name, onApply, onRename, onDelete }: { name: string; onApply: () => void; onRename: (n: string) => void; onDelete: () => void }): JSX.Element {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 8px", borderRadius: 12, background: "var(--accent-soft)", border: "1px solid var(--border-default)", flexShrink: 0, whiteSpace: "nowrap" }}>
            <button onClick={onApply} onDoubleClick={() => { const n = prompt("필터 이름", name); if (n && n.trim()) onRename(n.trim()); }} title="클릭=불러오기 · 더블클릭=이름변경" style={{ border: "none", background: "transparent", color: "var(--accent-primary)", cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0 }}>{name}</button>
            <button onClick={onDelete} title="삭제" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 1px" }}>×</button>
        </span>
    );
}

const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer" };
