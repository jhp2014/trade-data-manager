// 깔때기 머리글 — 분모(후보 수)·해상도 손잡이·저장본. 조건 자체는 여기서 못 만진다(보드의 일).
import { useState } from "react";
import { TextToggle } from "../../components/ControlChrome.js";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { useWorkbench } from "../../store/workbench.js";
import { FAIL } from "../../styles/palette.js";
import { GRAIN_UNIT } from "./grain.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v, expandToPoints, setExpand }: {
    v: FunnelView;
    expandToPoints: boolean;
    setExpand: (on: boolean) => void;
}): JSX.Element {
    const stages = useWorkbench((s) => s.filterStages);
    const saved = useWorkbench((s) => s.savedFunnels);
    const saveSet = useWorkbench((s) => s.saveFunnelSet);
    const applySet = useWorkbench((s) => s.applyFunnelSet);
    const deleteSet = useWorkbench((s) => s.deleteFunnelSet);
    const [setsOpen, setSetsOpen] = useState<{ x: number; y: number } | null>(null);

    return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>후보</span>
            {/* 분모는 편집에 따라 조용히 변한다(앵커 하나 지우면 그 하루가 빠진다) — 그래서 상시 표시. */}
            <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }} title="손이 닿은 흔적(앵커·그룹·타점)이 하나라도 있는 (종목·날짜). 편집에 따라 변한다.">
                {v.universe.toLocaleString("ko-KR")}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{GRAIN_UNIT[v.grain]}</span>
            {v.canExpandToPoints && (
                <TextToggle active={expandToPoints} onClick={() => setExpand(!expandToPoints)}
                    title="결과를 타점까지 펼친다 — 하루 조건은 그날 타점 전부에 같은 값이라 정직한 반복이다. 반대(타점→하루)는 롤업 규칙이 없어 막혀 있다.">
                    타점으로
                </TextToggle>
            )}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                {v.deadStageIds.length > 0 && (
                    <span style={{ fontSize: 10.5, color: FAIL }} title="지워진 그룹·축을 가리키는 조건이 있습니다. 그 필터는 판단 불가(미배치)로 잡힙니다.">
                        죽은 참조 {v.deadStageIds.length}
                    </span>
                )}
                <button disabled={stages.length === 0}
                    onClick={() => { const n = prompt("깔때기 이름", `필터 ${stages.length}개`); if (n?.trim()) saveSet(n.trim()); }}
                    title={stages.length > 0 ? "지금 필터들을 이름 붙여 저장" : "먼저 필터를 거세요"}
                    style={{ ...headerBtn, opacity: stages.length > 0 ? 1 : 0.45 }}>저장</button>
                <button disabled={saved.length === 0} onClick={(e) => setSetsOpen({ x: e.clientX, y: e.clientY })}
                    title={saved.length > 0 ? "저장한 깔때기 불러오기(지금 필터를 통째로 교체)" : "저장한 깔때기가 없습니다"}
                    style={{ ...headerBtn, opacity: saved.length > 0 ? 1 : 0.45 }}>불러오기{saved.length > 0 ? ` ${saved.length}` : ""}</button>
            </span>
            {setsOpen && (
                <AnchoredPopover anchor={setsOpen} onClose={() => setSetsOpen(null)} minWidth={200} maxWidth={280} maxHeight="min(56vh, 380px)" padding={0} placement="beside" offset={6}>
                    <MenuLabel>저장한 깔때기 · 클릭 = 통째로 교체</MenuLabel>
                    {saved.map((f) => (
                        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px 0 0", borderTop: "1px solid var(--border-subtle)" }}>
                            <button onClick={() => { applySet(f.id); setSetsOpen(null); }}
                                style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "6px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {f.name} <span style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>필터 {f.stages.length}</span>
                            </button>
                            <button onClick={() => deleteSet(f.id)} title="이 저장본 삭제" style={{ border: "none", background: "transparent", color: FAIL, cursor: "pointer", fontSize: 10, padding: "2px 4px" }}>✕</button>
                        </div>
                    ))}
                </AnchoredPopover>
            )}
        </div>
    );
}

const headerBtn: React.CSSProperties = {
    fontSize: 10.5, padding: "1px 8px", borderRadius: 4, border: "1px dashed var(--border-default)",
    background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
};
