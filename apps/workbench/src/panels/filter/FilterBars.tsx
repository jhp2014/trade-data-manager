// 걸린 필터 막대 — **아래에서 올라오는 서랍**. 접히면 요약 한 줄, 펼치면 층위 칸 둘(하루 → 타점).
//
// 왜 아래인가: 이 패널의 본론은 보드(조건을 긋는 판)고, 막대는 그 결과를 되읽는 자리다. 위에 두면
// 보드가 늘 아래로 밀려 "먼저 읽고 나중에 만지는" 순서를 화면이 강요하는데, 실제 손은 반대로 간다.
//
// 접힌 줄이 그냥 손잡이가 아니라 **요약**인 이유: 머리글에서 뺀 후보 분모가 여기로 왔다. 전체 → 생존은
// 한 줄로 붙어 있을 때만 뜻이 있다(따로 떨어진 두 숫자는 관계가 안 읽힌다).
//
// 하루가 늘 앞이라 "새로 죽임"이 넓은 조건부터 세어진다(순서는 결과가 아니라 서술을 정한다).
// 칸 클릭 = 시선(다중 가능) — 결과 목록은 없다: 멤버 열람은 구독 패널들의 몫이다.
import { useState } from "react";
import type { FunnelCell } from "@trade-data-manager/market/domain";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { Legend, PASS_CELLS } from "./cells.js";
import { FilterRow } from "./FilterRow.js";
import { useFunnel } from "./FunnelContext.js";
import { GrainSection } from "./grain.js";
import { stageLabel } from "./label.js";
import type { Grain } from "./stage.js";

const GRAINS: Grain[] = ["day", "point"];

export function FilterBars({ open, onToggle, onReveal }: {
    open: boolean;
    onToggle: () => void;
    /** 이름 클릭 — 보드의 그 줄로 데려간다(편집 입구는 보드 하나뿐이다). */
    onReveal: (stageId: string) => void;
}): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench(selectFilterStages);
    const selection = useWorkbench((s) => s.funnelSelection);
    const setSelection = useWorkbench((s) => s.setFunnelSelection);
    const toggleStage = useWorkbench((s) => s.toggleFilterStage);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const moveStage = useWorkbench((s) => s.moveFilterStage);

    const [dragId, setDragId] = useState<string | null>(null);
    // 놓일 자리 표시 — 드래그가 되는 줄도 모르던 게 이 목록의 첫 문제였다(손잡이와 이 선이 한 쌍).
    const [overId, setOverId] = useState<string | null>(null);

    const activeIndexOf = (id: string): number => v.active.findIndex((s) => s.id === id);
    const grainOf = (id: string): Grain => v.stagesOrdered.find((e) => e.stage.id === id)?.grain ?? "day";

    // 칸 클릭 — 같은 필터면 칸 토글(누적), 다른 필터면 그 칸 하나로 갈아탄다.
    // 결과는 목록이 아니라 **연동 패널들**이 보여준다(짚는 순간 선택 포인터가 작업 깔때기로 복귀).
    const clickCell = (stageId: string, cell: FunnelCell): void => {
        if (selection?.stageId === stageId) {
            const cells = selection.cells.includes(cell) ? selection.cells.filter((c) => c !== cell) : [...selection.cells, cell];
            setSelection(cells.length > 0 ? { stageId, cells } : null);
        } else setSelection({ stageId, cells: [cell] });
    };

    // 드래그 재정렬 — 같은 칸(층위) 안에서만. store 배열 인덱스로 옮긴다(칸 표시는 파생이라 따라온다).
    const canDropOn = (targetId: string): boolean =>
        dragId !== null && dragId !== targetId && grainOf(dragId) === grainOf(targetId);
    const dropOn = (targetId: string): void => {
        if (!canDropOn(targetId)) return;
        const from = stages.findIndex((s) => s.id === dragId);
        const to = stages.findIndex((s) => s.id === targetId);
        if (from >= 0 && to >= 0) moveStage(from, to);
        setDragId(null);
        setOverId(null);
    };
    const endDrag = (): void => { setDragId(null); setOverId(null); };

    let rowNo = 0;

    return (
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-strong)", background: "var(--bg-secondary)" }}>
            {/* 요약 줄 — 늘 서 있다. 이게 서랍의 손잡이이자 "전체 → 생존"을 말하는 자리다. */}
            <button onClick={onToggle} title={open ? "막대 접기 — 요약 한 줄만 남는다" : "막대 펼치기 — 필터마다 5칸과 새로 죽임"}
                style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "transparent",
                    padding: "3px 10px", cursor: "pointer", font: "inherit", fontSize: 11, color: "var(--text-secondary)", textAlign: "left",
                }}>
                <span style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>{open ? "▾" : "▴"}</span>
                <span style={{ flexShrink: 0 }}>필터 {v.active.length}{stages.length > v.active.length ? ` / ${stages.length}` : ""}</span>
                <span className="tabular" style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>
                    {v.isLoading ? "…" : `${v.universe.toLocaleString("ko-KR")} → ${(v.result?.survivors.length ?? v.universe).toLocaleString("ko-KR")}`}
                </span>
                {v.deadStageIds.length === 0 && v.active.length === 0 && !v.isLoading && (
                    <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>조건 없음 — 보드에서 레일을 그으면 여기 생깁니다</span>
                )}
            </button>

            {open && (
                <div style={{ maxHeight: "42vh", overflowY: "auto", padding: "0 8px 4px", borderTop: "1px solid var(--border-subtle)" }}>
                    {v.isLoading && <div style={{ padding: 10, fontSize: 12, color: "var(--text-tertiary)" }}>불러오는 중…</div>}
                    {!v.isLoading && GRAINS.map((grain) => {
                        const entries = v.stagesOrdered.filter((e) => e.grain === grain);
                        return (
                            <GrainSection key={grain} grain={grain}>
                                {entries.length === 0 && (
                                    <div style={{ padding: "4px 10px", fontSize: 10.5, color: "var(--text-tertiary)" }}>
                                        없음 — <b>보드</b>에서 레일을 그으면 여기 생깁니다
                                    </div>
                                )}
                                {entries.map(({ stage }) => {
                                    rowNo++;
                                    const ai = activeIndexOf(stage.id);
                                    return (
                                        <FilterRow
                                            key={stage.id}
                                            no={rowNo}
                                            stage={stage}
                                            tally={ai >= 0 ? (v.result?.stages[ai] ?? null) : null}
                                            universe={v.universe}
                                            label={stageLabel(stage, v.labelLook)}
                                            dead={v.deadStageIds.includes(stage.id)}
                                            pickedCells={selection?.stageId === stage.id ? selection.cells : []}
                                            dragging={dragId === stage.id}
                                            dropTarget={overId === stage.id && canDropOn(stage.id)}
                                            onPick={(cell) => clickCell(stage.id, cell)}
                                            onPickPass={() => setSelection({ stageId: stage.id, cells: [...PASS_CELLS] })}
                                            onReveal={() => onReveal(stage.id)}
                                            onToggle={() => toggleStage(stage.id)}
                                            onRemove={() => removeStage(stage.id)}
                                            onDragStart={() => setDragId(stage.id)}
                                            onDragEnd={endDrag}
                                            onDragOver={() => setOverId(stage.id)}
                                            onDropOn={() => dropOn(stage.id)}
                                        />
                                    );
                                })}
                            </GrainSection>
                        );
                    })}
                    <Legend />
                </div>
            )}
        </div>
    );
}
