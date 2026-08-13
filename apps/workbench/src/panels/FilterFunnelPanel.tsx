// 필터 패널 — **조건의 중앙 관리소**이자 집계판. 조건은 여기서만 걸고 풀고 저장한다.
// 다른 패널(골격·시트·배치·분석)은 결과 집합을 구독만 한다 — 조건을 나눠 주면 패널마다 판정을
// 재구현해 서로 다른 답을 내는데, 그게 옛 필터 UI 가 두 곳이라 생긴 문제와 정확히 같은 종류다.
//
// 화면은 위아래 둘이다:
//   · 위 — **걸린 필터들의 막대**(층위 칸 둘: 하루 → 타점). 하루가 늘 앞이라 "새로 죽임"이 넓은
//     조건부터 세어진다(순서는 결과가 아니라 서술을 정한다). 칸 클릭 = 시선(다중 가능).
//   · 아래 — **결과 목록**과 **필터 보드**를 탭으로. 보드에서 레일을 그으면 위 막대가 그 자리에서
//     움직인다. 조건을 정하는 일과 그 대가를 보는 일이 한 화면에 있어야 한다는 게 이 배치의 전부다.
//
// ⚠ 어휘 — **화면에서는 "필터"**로 통일한다. 코드의 `stage`(단계)는 core 깔때기 정산의 모델 낱말이라
// 그대로 둔다(상류·새로 죽임이 그 순서에 매여 있다). 표시 이름과 모델 이름이 다른 흔한 경우다.
import { useState } from "react";
import { useWorkbench } from "../store/workbench.js";
import { TextToggle } from "../components/ControlChrome.js";
import { usePanelUi } from "../store/usePanelUi.js";
import type { FunnelCell } from "@trade-data-manager/market/domain";
import { useFunnel } from "./filter/FunnelContext.js";
import { FilterBoard, type BoardReveal } from "./filter/FilterBoard.js";
import { FilterRow } from "./filter/FilterRow.js";
import { FunnelHeader } from "./filter/FunnelHeader.js";
import { Legend, PASS_CELLS } from "./filter/cells.js";
import { GrainSection } from "./filter/grain.js";
import { ResultList } from "./filter/ResultList.js";
import { stageLabel } from "./filter/label.js";
import type { Grain } from "./filter/stage.js";

type BottomTab = "result" | "board";

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

    // 탭은 패널별 영속 — 조건을 손보는 중에 프리셋을 바꿔도 보드가 열린 채로 돌아온다.
    const [tab, setTab] = usePanelUi<BottomTab>(panelId, "bottomTab", "result");
    // 보드의 "걸린 것만"은 **컨트롤 바에** 산다 — 보드 안에 있으면 목록의 일부처럼 보여 눌러야 할 자리로 안 읽힌다.
    const [onlyActive, setOnlyActive] = usePanelUi(panelId, "boardOnlyActive", false);
    const [reveal, setReveal] = useState<BoardReveal | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    // 놓일 자리 표시 — 드래그가 되는 줄도 모르던 게 이 목록의 첫 문제였다(손잡이와 이 선이 한 쌍).
    const [overId, setOverId] = useState<string | null>(null);

    const activeIndexOf = (id: string): number => v.active.findIndex((s) => s.id === id);
    const grainOf = (id: string): Grain => v.stagesOrdered.find((e) => e.stage.id === id)?.grain ?? "day";

    /** 보드를 열고 그 조건이 사는 줄로 데려간다 — 편집 입구는 보드 하나뿐이다. */
    const revealIn = (stageId: string): void => {
        setTab("board");
        setReveal({ stageId, at: Date.now() });
    };

    /**
     * 칸을 짚었으면 **그 결과를 보여준다** — 보드를 열어 둔 채 칸을 눌러 놓고 아무 일도 안 일어나면
     * 눌러도 되는 자리인지부터 의심하게 된다. 칸 짚기의 목적이 곧 목록 보기라 탭을 따라 옮긴다.
     */
    const showResult = (): void => setTab("result");

    // 칸 클릭 — 같은 필터면 칸 토글(누적), 다른 필터면 그 칸 하나로 갈아탄다.
    const clickCell = (stageId: string, cell: FunnelCell): void => {
        showResult();
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
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <FunnelHeader v={v} expandToPoints={expandToPoints} setExpand={setExpand} />

            <div style={{ flex: "0 0 auto", maxHeight: "46%", overflowY: "auto", padding: "2px 8px 6px" }}>
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
                                        onPickPass={() => { showResult(); setSelection({ stageId: stage.id, cells: [...PASS_CELLS] }); }}
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
            </div>

            <Legend />

            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {/* 아래 절반의 컨트롤 바 — 다른 패널 머리글과 같은 결(bg-secondary + 경계선)이라야 "여기서 고르는 자리"로 읽힌다. */}
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3, padding: "3px 8px 0", borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" }}>
                    <Tab on={tab === "result"} onClick={() => setTab("result")} title="지금 보는 집합(구독 패널들이 보는 것과 같다)">결과 목록</Tab>
                    <Tab on={tab === "board"} onClick={() => setTab("board")} title="조건을 거는 판 — 레일을 끌면 위 막대가 그 자리에서 움직인다">필터 보드</Tab>
                    {/* 탭마다 딸린 컨트롤은 그 탭일 때만 — 안 쓰는 손잡이가 늘 떠 있으면 바가 장식이 된다. */}
                    {tab === "board" && (
                        <span style={{ marginLeft: "auto", paddingBottom: 3 }}>
                            <TextToggle active={onlyActive} activeColor="var(--accent-primary)" onClick={() => setOnlyActive(!onlyActive)}
                                title="조건이 걸린 줄만 보기">걸린 것만</TextToggle>
                        </span>
                    )}
                </div>
                {tab === "result"
                    ? <ResultList v={v} selection={selection} />
                    : <FilterBoard reveal={reveal} onlyActive={onlyActive} />}
            </div>
        </div>
    );
}

/** 탭 — 고른 쪽이 아래 내용과 **같은 바탕색**으로 이어 붙는다(도킹 탭과 같은 문법). */
function Tab({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }): JSX.Element {
    return (
        <button onClick={onClick} title={title}
            style={{
                border: "1px solid var(--border-default)", borderBottom: "none", borderRadius: "5px 5px 0 0",
                background: on ? "var(--bg-primary)" : "transparent",
                color: on ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: on ? 700 : 400, padding: "4px 11px",
                borderColor: on ? "var(--border-default)" : "transparent",
                position: "relative", top: 1, // 아래 경계선을 덮어 내용과 이어지게
            }}>
            {children}
        </button>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>{children}</div>;
}
