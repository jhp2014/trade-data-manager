// 필터 패널 — **집합 공장**. 조건은 여기서만 걸고 풀고, 집합(산출물)도 여기서만 태어난다.
// 다른 패널(골격·시트·배치·분석)은 집합을 구독만 한다 — 조건을 나눠 주면 패널마다 판정을
// 재구현해 서로 다른 답을 내는데, 그게 옛 필터 UI 가 두 곳이라 생긴 문제와 정확히 같은 종류다.
//
// 화면은 세 기둥이다:
//   · 위 — **걸린 필터들의 막대**(층위 칸 둘: 하루 → 타점). 하루가 늘 앞이라 "새로 죽임"이 넓은
//     조건부터 세어진다(순서는 결과가 아니라 서술을 정한다). 칸 클릭 = 시선(다중 가능).
//   · 아래 — **필터 보드**(상시). 레일을 그으면 위 막대가 그 자리에서 움직인다. 결과 목록은 없다 —
//     멤버 열람은 각 소비 패널의 집합 사이드바가 한다(여기는 만드는 곳이지 읽는 곳이 아니다).
//   · 오른쪽 — **집합 목록**. 저장(게시)·선택(연동 패널이 따라옴)·열기·덮어쓰기·삭제.
//
// ⚠ 어휘 — **필터는 과정, 집합은 산출물.** 보드·레일·막대에는 "필터"가, 목록·바인딩·피커에는 "집합"만
// 보인다. 코드의 `stage`(단계)는 core 깔때기 정산의 모델 낱말이라 그대로 둔다(상류·새로 죽임이 그
// 순서에 매여 있다).
import { useState } from "react";
import { useWorkbench } from "../store/workbench.js";
import { TextToggle, PanelHeader } from "../components/ControlChrome.js";
import { usePanelUi } from "../store/usePanelUi.js";
import type { FunnelCell } from "@trade-data-manager/market/domain";
import { useFunnel } from "./filter/FunnelContext.js";
import { FilterBoard, type BoardReveal } from "./filter/FilterBoard.js";
import { FilterRow } from "./filter/FilterRow.js";
import { FunnelHeader } from "./filter/FunnelHeader.js";
import { Legend, PASS_CELLS } from "./filter/cells.js";
import { GrainSection } from "./filter/grain.js";
import { SetListSidebar } from "./filter/SetListSidebar.js";
import { stageLabel } from "./filter/label.js";
import type { Grain } from "./filter/stage.js";

export function FilterFunnelPanel({ panelId }: { panelId: string }): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench((s) => s.filterStages);
    const selection = useWorkbench((s) => s.funnelSelection);
    const setSelection = useWorkbench((s) => s.setFunnelSelection);
    const expandToPoints = useWorkbench((s) => s.filterExpandToPoints);
    const setExpand = useWorkbench((s) => s.setFilterExpandToPoints);
    const toggleStage = useWorkbench((s) => s.toggleFilterStage);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const moveStage = useWorkbench((s) => s.moveFilterStage);

    // 보드의 "걸린 것만"은 **컨트롤 바에** 산다 — 보드 안에 있으면 목록의 일부처럼 보여 눌러야 할 자리로 안 읽힌다.
    const [onlyActive, setOnlyActive] = usePanelUi(panelId, "boardOnlyActive", false);
    // **막대(걸린 필터 목록) 접기** — 보드로 일하는 동안 막대에 화면을 내주기 싫을 때. 접는 쪽이
    // 아래에서 위로 뒤집혔다(사용자 확정): 보드는 늘 열려 있고, 접히는 건 막대뿐이다.
    const [barsOpen, setBarsOpen] = usePanelUi(panelId, "barsOpen", true);
    const [reveal, setReveal] = useState<BoardReveal | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    // 놓일 자리 표시 — 드래그가 되는 줄도 모르던 게 이 목록의 첫 문제였다(손잡이와 이 선이 한 쌍).
    const [overId, setOverId] = useState<string | null>(null);

    const activeIndexOf = (id: string): number => v.active.findIndex((s) => s.id === id);
    const grainOf = (id: string): Grain => v.stagesOrdered.find((e) => e.stage.id === id)?.grain ?? "day";

    /** 보드의 그 조건이 사는 줄로 데려간다 — 편집 입구는 보드 하나뿐이다(보드는 상시 열려 있다). */
    const revealIn = (stageId: string): void => setReveal({ stageId, at: Date.now() });

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

    const grains: Grain[] = ["day", "point"];
    let rowNo = 0;

    return (
        <div style={{ display: "flex", height: "100%", background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <FunnelHeader v={v} expandToPoints={expandToPoints} setExpand={setExpand} barsOpen={barsOpen} onToggleBars={() => setBarsOpen(!barsOpen)} />

                {barsOpen && <div style={{ flex: "0 0 auto", maxHeight: "46%", overflowY: "auto", padding: "2px 8px 6px" }}>
                    {v.isLoading && <Note>불러오는 중…</Note>}
                    {!v.isLoading && grains.map((grain) => {
                        const entries = v.stagesOrdered.filter((e) => e.grain === grain);
                        return (
                            <GrainSection key={grain} grain={grain}>
                                {entries.length === 0 && (
                                    <div style={{ padding: "4px 10px", fontSize: 10.5, color: "var(--text-tertiary)" }}>
                                        없음 — <b>필터 보드</b>에서 레일을 그으면 여기 생깁니다
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
                                            onReveal={() => revealIn(stage.id)}
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
                </div>}

                {barsOpen && <Legend />}

                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {/* 보드의 컨트롤 바 — 다른 패널 머리글과 같은 결(bg-secondary + 경계선)이라야 "여기서 고르는 자리"로 읽힌다. */}
                    <PanelHeader gap={3} padding="3px 8px" style={{ borderTop: "1px solid var(--border-strong)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }} title="조건을 거는 판 — 레일을 끌면 위 막대가 그 자리에서 움직인다">
                            필터 보드
                        </span>
                        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <TextToggle active={onlyActive} activeColor="var(--accent-primary)" onClick={() => setOnlyActive(!onlyActive)}
                                title="조건이 걸린 줄만 보기">걸린 것만</TextToggle>
                        </span>
                    </PanelHeader>
                    <FilterBoard reveal={reveal} onlyActive={onlyActive} />
                </div>
            </div>

            <SetListSidebar />
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>{children}</div>;
}
