// 깔때기 머리글 — 분모(후보 수)·해상도 손잡이·저장본. 조건 자체는 여기서 못 만진다(보드의 일).
import { useState } from "react";
import { TextToggle, PanelHeader } from "../../components/ControlChrome.js";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { useWorkbench } from "../../store/workbench.js";
import { FAIL } from "../../styles/palette.js";
import { GRAIN_UNIT } from "./grain.js";
import type { FunnelView } from "./useFilterFunnel.js";

export function FunnelHeader({ v, expandToPoints, setExpand, barsOpen, onToggleBars }: {
    v: FunnelView;
    expandToPoints: boolean;
    setExpand: (on: boolean) => void;
    /** 막대(걸린 필터 목록) 접기 — 접히는 건 막대뿐이라 손잡이가 머리글에 산다(목록·보드는 늘 열려 있다). */
    barsOpen: boolean;
    onToggleBars: () => void;
}): JSX.Element {
    const stages = useWorkbench((s) => s.filterStages);
    const saved = useWorkbench((s) => s.savedFunnels);
    const saveSet = useWorkbench((s) => s.saveFunnelSet);
    const applySet = useWorkbench((s) => s.applyFunnelSet);
    const deleteSet = useWorkbench((s) => s.deleteFunnelSet);
    // 슬롯 — 이름 없는 고정 3칸. 저장본(이름 붙인 보관)과 역할이 다르다: 슬롯은 오늘 이 세션의
    // A/B 비교·"잠깐 이 그룹만 보기" 용 작업면이다. 빈 칸으로 갈아타면 "잠시 필터 없음"이 공짜로 나온다.
    const slots = useWorkbench((s) => s.filterSlots);
    const slotIndex = useWorkbench((s) => s.filterSlotIndex);
    const setSlot = useWorkbench((s) => s.setFilterSlot);
    const clearStages = useWorkbench((s) => s.clearFilterStages);
    const [setsOpen, setSetsOpen] = useState<{ x: number; y: number } | null>(null);

    return (
        <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>후보</span>
            {/* 분모는 편집에 따라 조용히 변한다(앵커 하나 지우면 그 하루가 빠진다) — 그래서 상시 표시. */}
            <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", flexShrink: 0 }} title="손이 닿은 흔적(앵커·그룹·타점)이 하나라도 있는 (종목·날짜). 편집에 따라 변한다.">
                {v.universe.toLocaleString("ko-KR")}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>{GRAIN_UNIT[v.grain]}</span>
            {v.canExpandToPoints && (
                <TextToggle active={expandToPoints} onClick={() => setExpand(!expandToPoints)}
                    title="결과를 타점까지 펼친다 — 하루 조건은 그날 타점 전부에 같은 값이라 정직한 반복이다. 반대(타점→하루)는 롤업 규칙이 없어 막혀 있다.">
                    타점으로
                </TextToggle>
            )}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {v.deadStageIds.length > 0 && (
                    <span style={{ fontSize: 10.5, color: FAIL, flexShrink: 0 }} title="지워진 그룹·축을 가리키는 조건이 있습니다. 그 필터는 판단 불가(미배치)로 잡힙니다.">
                        죽은 참조 {v.deadStageIds.length}
                    </span>
                )}
                {/* 슬롯 1·2·3 — 조건 한 벌씩. 찬 칸은 점으로 표시(어디에 뭐가 있는지 눌러보기 전에 보이게). */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }} title="필터 슬롯 — 칸마다 조건 한 벌. 빈 칸으로 갈아타면 잠시 필터 없는 상태가 됩니다">
                    {slots.map((sl, i) => {
                        const on = i === slotIndex;
                        return (
                            <button key={i} onClick={() => setSlot(i)}
                                title={`슬롯 ${i + 1} — 필터 ${sl.length}개${on ? " (지금)" : ""}`}
                                style={{
                                    ...headerBtn, minWidth: 22, padding: "1px 0", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 2,
                                    borderStyle: "solid", borderColor: on ? "var(--accent-primary)" : "var(--border-default)",
                                    color: on ? "var(--accent-primary)" : sl.length > 0 ? "var(--text-secondary)" : "var(--text-tertiary)",
                                    fontWeight: on ? 700 : 400,
                                }}>
                                {i + 1}
                                {sl.length > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor" }} />}
                            </button>
                        );
                    })}
                </span>
                <button disabled={stages.length === 0} onClick={clearStages}
                    title={stages.length > 0 ? "이 슬롯의 필터 전부 지우기(다른 슬롯은 그대로)" : "지울 필터가 없습니다"}
                    style={{ ...headerBtn, opacity: stages.length > 0 ? 1 : 0.45 }}>비우기</button>
                <button disabled={stages.length === 0}
                    onClick={() => { const n = prompt("깔때기 이름", `필터 ${stages.length}개`); if (n?.trim()) saveSet(n.trim()); }}
                    title={stages.length > 0 ? "지금 필터들을 이름 붙여 저장" : "먼저 필터를 거세요"}
                    style={{ ...headerBtn, opacity: stages.length > 0 ? 1 : 0.45 }}>저장</button>
                <button disabled={saved.length === 0} onClick={(e) => setSetsOpen({ x: e.clientX, y: e.clientY })}
                    title={saved.length > 0 ? "저장한 깔때기 불러오기(지금 필터를 통째로 교체)" : "저장한 깔때기가 없습니다"}
                    style={{ ...headerBtn, opacity: saved.length > 0 ? 1 : 0.45 }}>불러오기{saved.length > 0 ? ` ${saved.length}` : ""}</button>
                <button onClick={onToggleBars} title={barsOpen ? "필터 막대 접기 — 목록·보드에 화면을 다 준다" : "필터 막대 펼치기"}
                    style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "2px 4px" }}>
                    {barsOpen ? "▴" : "▾"}
                </button>
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
        </PanelHeader>
    );
}

const headerBtn: React.CSSProperties = {
    fontSize: 10.5, padding: "1px 8px", borderRadius: 4, border: "1px dashed var(--border-default)",
    background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
};
