// 필터 깔때기 패널 — **조건의 중앙 관리소**이자 집계판. 조건은 여기서만 걸고 풀고 저장한다.
// 다른 패널(골격·시트·배치·분석)은 결과 집합을 구독만 한다 — 조건을 나눠 주면 패널마다 판정을
// 재구현해 서로 다른 답을 내는데, 그게 옛 필터 UI 가 두 곳이라 생겼던 문제와 정확히 같은 종류다.
//
// 화면 구조:
//   · 층위 칸 둘(하루 → 타점) — **칸이 곧 선언**: 그 칸의 + 단계는 그 층위 조건만 보여준다. 하루가
//     늘 앞이라 "새로 죽임"이 넓은 조건부터 세어진다(순서는 결과가 아니라 서술을 정한다).
//   · 단계 행은 2줄 — 막대가 한 줄을 통째로(칸 최소 폭과 폭 다툼을 안 하게), 조건·수치·컨트롤이 아랫줄.
//   · 드래그 재정렬은 같은 칸 안에서만 — 칸을 넘는 이동은 조건의 층위를 바꾸는 일이라 뜻이 없다.
//
// ⚠ **막대 길이가 전부 같다.** 순차 깔때기처럼 짧아지게 그리면 그림이 "앞에서 걸러낸 뒤 남은 것만
// 평가한다"고 말하는데 모델은 그 반대다(전체 유니버스 독립 평가). 좁혀지는 느낌은 생존 칸이 줄어드는 것.
//
// 칸 클릭 = **시선**(다중 가능 — 생존+근접 탈락을 겹쳐 "이번 통과 전부"). 짚은 집합이 곧 구독 집합이라
// 깔때기가 네비게이션이 된다. 안 짚으면 최종 생존.
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FunnelCell, StageTally } from "@trade-data-manager/market/domain";
import { stocksMetaQuery } from "../api/queries.js";
import { useWorkbench } from "../store/workbench.js";
import type { FunnelSelection } from "../store/filterFunnelSlice.js";
import { TextToggle } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { useFilterFunnel, type FunnelView } from "./filter/useFilterFunnel.js";
import { GroupStageEditor } from "./filter/StageEditor.js";
import { AxisStageEditor } from "./filter/AxisStageEditor.js";
import { RangeStageEditor } from "./filter/RangeStageEditor.js";
import { kindLabel, stageLabel } from "./filter/label.js";
import { isPredicateEmpty, stageKind, type FilterPredicate, type FilterStage, type Grain } from "./filter/stage.js";
import type { GroupExpr } from "./rank/groupFilter.js";
import { FAIL, GROUP_PLAIN, HOVER, IGNORED_CANDLE, STRONG } from "../styles/palette.js";

const CELLS: { cell: FunnelCell; label: string; color: string; hint: string }[] = [
    { cell: "survive", label: "생존", color: STRONG, hint: "이번 통과 + 상류 전부 통과" },
    { cell: "nearMiss", label: "근접 탈락", color: HOVER, hint: "이번은 통과인데 앞 단계에서 죽음 — 앞이 과했는지는 여기서만 알 수 있다" },
    { cell: "upstreamPending", label: "상류 보류", color: GROUP_PLAIN, hint: "이번 통과 + 상류에 미배치(탈락은 없음) — 배치하면 생존이 될 수도" },
    { cell: "fail", label: "이번 탈락", color: FAIL, hint: "이 단계가 떨궜다" },
    { cell: "pending", label: "이번 미배치", color: IGNORED_CANDLE, hint: "이 단계로는 판단할 재료가 없다(안 맞은 게 아니다)" },
];
/** "이번 통과 전부" — 상류 상태만 다른 세 칸. */
const PASS_CELLS: FunnelCell[] = ["survive", "nearMiss", "upstreamPending"];

const MAX_ROWS = 200; // 목록은 훑어보는 용도 — 전부 그리면 스크롤만 길어진다

/**
 * 0 이 아닌 칸의 최소 폭(px). 5119건 중 3건은 0.06% 라 정직하게 그리면 **누를 수가 없다**.
 * 대가: 엄밀한 비례가 아니게 된다 — 이 막대의 일은 비율 재기가 아니라 칸을 눌러 보게 하는 것이고,
 * 정확한 수는 칸 안 숫자·툴팁·목록에 있다. 칸이 최대 다섯이라 왜곡 상한도 5×MIN_SEG.
 */
const MIN_SEG = 16;

const STAGE_DND = "application/x-funnel-stage";

/** 편집기 라우팅 — stageId 없으면 생성(그 칸의 + 단계), 있으면 그 단계 교체. */
type EditorState =
    | { kind: "group"; grain: Grain; stageId?: string; x: number; y: number }
    | { kind: "axis"; grain: Grain; stageId?: string; x: number; y: number }
    | { kind: "date" | "time"; stageId?: string; x: number; y: number };

export function FilterFunnelPanel(): JSX.Element {
    const v = useFilterFunnel();
    const stages = useWorkbench((s) => s.filterStages);
    const selection = useWorkbench((s) => s.funnelSelection);
    const setSelection = useWorkbench((s) => s.setFunnelSelection);
    const expandToPoints = useWorkbench((s) => s.filterExpandToPoints);
    const setExpand = useWorkbench((s) => s.setFilterExpandToPoints);
    const addStage = useWorkbench((s) => s.addFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const toggleStage = useWorkbench((s) => s.toggleFilterStage);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const moveStage = useWorkbench((s) => s.moveFilterStage);

    const [kindMenu, setKindMenu] = useState<{ grain: Grain; x: number; y: number } | null>(null);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [draft, setDraft] = useState<GroupExpr>({ groups: [] }); // 그룹 생성 흐름의 임시 식
    const [dragId, setDragId] = useState<string | null>(null);

    const activeIndexOf = (id: string): number => v.active.findIndex((s) => s.id === id);
    const grainOf = (id: string): Grain => v.stagesOrdered.find((e) => e.stage.id === id)?.grain ?? "day";

    // 칸 클릭 — 같은 단계면 칸 토글(누적), 다른 단계면 그 칸 하나로 갈아탄다.
    const clickCell = (stageId: string, cell: FunnelCell): void => {
        if (selection?.stageId === stageId) {
            const cells = selection.cells.includes(cell) ? selection.cells.filter((c) => c !== cell) : [...selection.cells, cell];
            setSelection(cells.length > 0 ? { stageId, cells } : null);
        } else setSelection({ stageId, cells: [cell] });
    };

    // 드래그 재정렬 — 같은 칸(층위) 안에서만. store 배열 인덱스로 옮긴다(칸 표시는 파생이라 따라온다).
    const dropOn = (targetId: string): void => {
        if (!dragId || dragId === targetId) return;
        if (grainOf(dragId) !== grainOf(targetId)) return;
        const from = stages.findIndex((s) => s.id === dragId);
        const to = stages.findIndex((s) => s.id === targetId);
        if (from >= 0 && to >= 0) moveStage(from, to);
        setDragId(null);
    };

    const openEditorFor = (stage: FilterStage, x: number, y: number): void => {
        const k = stageKind(stage);
        const grain = grainOf(stage.id);
        if (k === "group") { setEditor({ kind: "group", grain, stageId: stage.id, x, y }); return; }
        if (k === "axisBand" || k === "axisValue") { setEditor({ kind: "axis", grain, stageId: stage.id, x, y }); return; }
        if (k === "date" || k === "time") { setEditor({ kind: k, stageId: stage.id, x, y }); return; }
        setKindMenu({ grain, x, y }); // 빈 단계 — 종류부터 고른다
    };

    // 그룹 생성 흐름 — 편집기가 열린 동안 draft 에 쌓고, 닫을 때 내용이 있으면 그때 단계가 된다.
    // ⚠ ref 가드: Escape 한 번에 input 핸들러와 팝오버 dismiss 가 **둘 다** onClose 를 부른다 —
    // 같은 이벤트 안이라 state 는 아직 그대로여서, 가드 없이는 draft 가 두 번 커밋돼 단계가 복제된다.
    const draftCommitted = useRef(false);
    const closeGroupCreate = (): void => {
        if (!draftCommitted.current && draft.groups.length > 0) {
            draftCommitted.current = true;
            addStage([{ kind: "group", expr: draft }]);
        }
        setDraft({ groups: [] });
        setEditor(null);
    };

    const editingStage = editor?.stageId ? stages.find((s) => s.id === editor.stageId) : undefined;
    const sections: { grain: Grain; title: string; hint: string }[] = [
        { grain: "day", title: "하루", hint: "종목·날짜 — 차트 그룹·하루 축·날짜" },
        { grain: "point", title: "타점", hint: "종목·날짜·시각 — 타점 그룹·타점 축·시간" },
    ];
    let rowNo = 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <Header v={v} expandToPoints={expandToPoints} setExpand={setExpand} />

            <div style={{ flex: "0 0 auto", maxHeight: "58%", overflowY: "auto", padding: "2px 10px 6px" }}>
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && sections.map(({ grain, title, hint }) => {
                    const entries = v.stagesOrdered.filter((e) => e.grain === grain);
                    return (
                        <div key={grain}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0 3px" }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }} title={hint}>{title}</span>
                                <span style={{ flex: 1, borderTop: "1px solid var(--border-subtle)" }} />
                                <button onClick={(e) => setKindMenu({ grain, x: e.clientX, y: e.clientY })}
                                    title={`${title} 층위 조건으로 단계 추가`}
                                    style={{ fontSize: 10.5, padding: "1px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                                    + 단계
                                </button>
                            </div>
                            {entries.length === 0 && <div style={{ padding: "1px 0 3px", fontSize: 10.5, color: "var(--text-tertiary)" }}>없음</div>}
                            {entries.map(({ stage }) => {
                                rowNo++;
                                const ai = activeIndexOf(stage.id);
                                return (
                                    <StageRow
                                        key={stage.id}
                                        no={rowNo}
                                        stage={stage}
                                        tally={ai >= 0 ? (v.result?.stages[ai] ?? null) : null}
                                        universe={v.universe}
                                        label={stageLabel(stage, v.labelLook)}
                                        dead={v.deadStageIds.includes(stage.id)}
                                        pickedCells={selection?.stageId === stage.id ? selection.cells : []}
                                        dragging={dragId === stage.id}
                                        onPick={(cell) => clickCell(stage.id, cell)}
                                        onPickPass={() => setSelection({ stageId: stage.id, cells: [...PASS_CELLS] })}
                                        onEdit={(x, y) => openEditorFor(stage, x, y)}
                                        onToggle={() => toggleStage(stage.id)}
                                        onRemove={() => removeStage(stage.id)}
                                        onDragStart={() => setDragId(stage.id)}
                                        onDragEnd={() => setDragId(null)}
                                        onDropOn={() => dropOn(stage.id)}
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            <Legend />
            <ResultList v={v} selection={selection} />

            {kindMenu && (
                <AnchoredPopover anchor={kindMenu} onClose={() => setKindMenu(null)} minWidth={170} padding={0} placement="beside" offset={6}>
                    <MenuLabel>{kindMenu.grain === "day" ? "하루" : "타점"} 층위 조건</MenuLabel>
                    <MenuItem onClick={() => { setDraft({ groups: [] }); draftCommitted.current = false; setEditor({ kind: "group", grain: kindMenu.grain, x: kindMenu.x, y: kindMenu.y }); setKindMenu(null); }}>그룹</MenuItem>
                    <MenuItem onClick={() => { setEditor({ kind: "axis", grain: kindMenu.grain, x: kindMenu.x, y: kindMenu.y }); setKindMenu(null); }}>축</MenuItem>
                    {kindMenu.grain === "day"
                        ? <MenuItem onClick={() => { setEditor({ kind: "date", x: kindMenu.x, y: kindMenu.y }); setKindMenu(null); }}>날짜</MenuItem>
                        : <MenuItem onClick={() => { setEditor({ kind: "time", x: kindMenu.x, y: kindMenu.y }); setKindMenu(null); }}>시간</MenuItem>}
                </AnchoredPopover>
            )}

            {editor?.kind === "group" && (
                editor.stageId && editingStage
                    ? <GroupStageEditor anchor={editor} scope={editor.grain}
                        expr={(editingStage.predicates.find((p) => p.kind === "group") as Extract<FilterPredicate, { kind: "group" }> | undefined)?.expr ?? { groups: [] }}
                        onChange={(next) => setPredicates(editor.stageId!, [{ kind: "group", expr: next }])}
                        onClose={() => setEditor(null)} />
                    : <GroupStageEditor anchor={editor} scope={editor.grain} expr={draft} onChange={setDraft} onClose={closeGroupCreate} />
            )}
            {editor?.kind === "axis" && (
                <AxisStageEditor anchor={editor} scope={editor.grain}
                    initial={editingStage?.predicates.find((p) => p.kind === "axisBand" || p.kind === "axisValue") as
                        Extract<FilterPredicate, { kind: "axisBand" } | { kind: "axisValue" }> | undefined}
                    onCommit={(p) => (editor.stageId ? setPredicates(editor.stageId, [p]) : addStage([p]))}
                    onClose={() => setEditor(null)} />
            )}
            {(editor?.kind === "date" || editor?.kind === "time") && (
                <RangeStageEditor anchor={editor} kind={editor.kind}
                    initial={(editingStage?.predicates.find((p) => p.kind === editor.kind) as
                        Extract<FilterPredicate, { kind: "date" } | { kind: "time" }> | undefined)?.ranges}
                    onCommit={(p) => (editor.stageId ? setPredicates(editor.stageId, [p]) : addStage([p]))}
                    onClose={() => setEditor(null)} />
            )}
        </div>
    );
}

function Header({ v, expandToPoints, setExpand }: { v: FunnelView; expandToPoints: boolean; setExpand: (on: boolean) => void }): JSX.Element {
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
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                {v.grain === "day" ? "종목 · 날짜" : "종목 · 날짜 · 시각"}
            </span>
            {v.canExpandToPoints && (
                <TextToggle active={expandToPoints} onClick={() => setExpand(!expandToPoints)}
                    title="결과를 타점까지 펼친다 — 하루 조건은 그날 타점 전부에 같은 값이라 정직한 반복이다. 반대(타점→하루)는 롤업 규칙이 없어 막혀 있다.">
                    타점으로
                </TextToggle>
            )}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                {v.deadStageIds.length > 0 && (
                    <span style={{ fontSize: 10.5, color: FAIL }} title="지워진 그룹·축을 가리키는 조건이 있습니다. 그 단계는 판단 불가(미배치)로 잡힙니다.">
                        죽은 참조 {v.deadStageIds.length}
                    </span>
                )}
                <button disabled={stages.length === 0}
                    onClick={() => { const n = prompt("깔때기 이름", `단계 ${stages.length}개`); if (n?.trim()) saveSet(n.trim()); }}
                    title={stages.length > 0 ? "지금 단계들을 이름 붙여 저장" : "먼저 단계를 만드세요"}
                    style={{ ...headerBtn, opacity: stages.length > 0 ? 1 : 0.45 }}>저장</button>
                <button disabled={saved.length === 0} onClick={(e) => setSetsOpen({ x: e.clientX, y: e.clientY })}
                    title={saved.length > 0 ? "저장한 깔때기 불러오기(현재 단계를 통째로 교체)" : "저장한 깔때기가 없습니다"}
                    style={{ ...headerBtn, opacity: saved.length > 0 ? 1 : 0.45 }}>불러오기{saved.length > 0 ? ` ${saved.length}` : ""}</button>
            </span>
            {setsOpen && (
                <AnchoredPopover anchor={setsOpen} onClose={() => setSetsOpen(null)} minWidth={200} maxWidth={280} maxHeight="min(56vh, 380px)" padding={0} placement="beside" offset={6}>
                    <MenuLabel>저장한 깔때기 · 클릭 = 통째로 교체</MenuLabel>
                    {saved.map((f) => (
                        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px 0 0", borderTop: "1px solid var(--border-subtle)" }}>
                            <button onClick={() => { applySet(f.id); setSetsOpen(null); }}
                                style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "6px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {f.name} <span style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>{f.stages.length}단계</span>
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

function StageRow({ no, stage, tally, universe, label, dead, pickedCells, dragging, onPick, onPickPass, onEdit, onToggle, onRemove, onDragStart, onDragEnd, onDropOn }: {
    no: number;
    stage: FilterStage;
    /** 평가에 안 들어간 단계(조건이 비었거나 꺼짐)는 null — 행은 남고 막대만 없다. */
    tally: StageTally | null;
    universe: number;
    label: string;
    dead: boolean;
    pickedCells: FunnelCell[];
    dragging: boolean;
    onPick: (cell: FunnelCell) => void;
    onPickPass: () => void;
    onEdit: (x: number, y: number) => void;
    onToggle: () => void;
    onRemove: () => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    onDropOn: () => void;
}): JSX.Element {
    // 장식 판정 — 새로 죽인 게 없으면 이 단계는 겉보기 탈락이 아무리 커도 아무 일도 안 한 것이다.
    const decorative = tally !== null && tally.newlyKilled === 0;
    const empty = stage.predicates.every(isPredicateEmpty);
    return (
        <div
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(STAGE_DND, stage.id); e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
            onDragEnd={onDragEnd}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(STAGE_DND)) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); onDropOn(); }}
            style={{ padding: "3px 0 5px", opacity: dragging ? 0.4 : !stage.enabled ? 0.4 : decorative ? 0.55 : 1 }}
        >
            {/* 1줄 — 막대가 폭을 통째로. ⚠ 길이는 언제나 유니버스 전체(단계가 늘어도 짧아지지 않는다). */}
            <div style={{ display: "flex", height: 20, borderRadius: 3, overflow: "hidden", background: "var(--bg-secondary)" }}>
                {tally === null ? (
                    <span style={{ display: "flex", alignItems: "center", padding: "0 7px", fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        {empty ? "조건을 고르세요" : "꺼짐"}
                    </span>
                ) : CELLS.map(({ cell, label: cl, color, hint }) => {
                    const n = tally.counts[cell];
                    if (n === 0) return null; // 0 은 자리를 안 먹는다 — 최소 폭은 "있는 것"에만
                    const pct = universe === 0 ? 0 : (n / universe) * 100;
                    const on = pickedCells.includes(cell);
                    return (
                        <button
                            key={cell}
                            onClick={() => onPick(cell)}
                            title={`${cl} ${n.toLocaleString("ko-KR")} — ${hint} · 클릭 = 겹쳐 보기`}
                            style={{
                                // 최소 폭(basis) + 남는 폭을 건수 비례로(grow). 좁으면 다 같이 줄어든다(shrink).
                                flex: `${n} 1 ${MIN_SEG}px`, minWidth: 0, border: "none", padding: 0, cursor: "pointer",
                                background: color, color: "#fff", fontSize: 10, lineHeight: 1,
                                fontVariantNumeric: "tabular-nums", overflow: "hidden", whiteSpace: "nowrap",
                                outline: on ? "2px solid var(--text-primary)" : "none", outlineOffset: -2,
                            }}
                        >{pct >= 7 ? n.toLocaleString("ko-KR") : ""}</button>
                    );
                })}
            </div>

            {/* 2줄 — 조건·수치·컨트롤. 막대와 폭 다툼이 없어 라벨이 숨 쉰다. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2, minWidth: 0 }}>
                <span title="끌어서 순서 바꾸기(같은 층위 안)" style={{ cursor: "grab", color: "var(--text-tertiary)", fontSize: 10, flexShrink: 0 }}>⠿</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 10.5, flexShrink: 0 }}>{no}</span>
                <button onClick={(e) => onEdit(e.clientX, e.clientY)} title={`${label} — 클릭 = 조건 편집`}
                    style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "none", background: "transparent", padding: 0, font: "inherit", cursor: "pointer", fontSize: 11.5, color: dead ? FAIL : "var(--text-primary)", textAlign: "left" }}>
                    {label}
                </button>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>{kindLabel(stageKind(stage))}</span>
                {tally !== null && (
                    <button onClick={onPickPass} title="이번 통과 전부 보기(생존+근접 탈락+상류 보류)"
                        style={{ flexShrink: 0, fontSize: 10, padding: "0 6px", borderRadius: 3, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                        통과 전부
                    </button>
                )}
                <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}
                    title="이 단계가 새로 죽인 수(상류 전부 통과였는데 이번에 탈락). 0 이면 장식이다 — 겉보기 탈락과 다를 수 있다.">
                    새로 죽임 <span style={{ color: decorative ? "var(--text-tertiary)" : "var(--text-primary)", fontSize: 11.5 }}>{tally === null ? "—" : tally.newlyKilled.toLocaleString("ko-KR")}</span>
                </span>
                {/* 끄기는 지우기와 다르다 — 잠깐 빼보는 게 한계 기여도를 눈으로 확인하는 손짓이다. */}
                <button onClick={onToggle} title={stage.enabled ? "이 단계 끄기(빼고 보기)" : "다시 켜기"} style={iconBtn}>{stage.enabled ? "◉" : "○"}</button>
                <button onClick={onRemove} title="이 단계 지우기" style={{ ...iconBtn, color: FAIL }}>✕</button>
            </div>
        </div>
    );
}

function Legend(): JSX.Element {
    return (
        <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: "3px 12px", padding: "6px 10px", borderTop: "1px solid var(--border-subtle)", fontSize: 10.5, color: "var(--text-secondary)" }}>
            {CELLS.map(({ cell, label, color, hint }) => (
                <span key={cell} title={hint} style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: color, verticalAlign: -1, marginRight: 4 }} />
                    {label}
                </span>
            ))}
        </div>
    );
}

function ResultList({ v, selection }: { v: FunnelView; selection: FunnelSelection | null }): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const items = v.viewedItems;
    const shown = items.slice(0, MAX_ROWS);
    const names = useQuery(stocksMetaQuery(shown.map((i) => i.stockCode)));
    const nameOf = (code: string): string => names.data?.find((m) => m.stockCode === code)?.name ?? code;

    const stageIndex = selection ? v.active.findIndex((s) => s.id === selection.stageId) : -1;
    const stageNo = selection ? v.stagesOrdered.findIndex((e) => e.stage.id === selection.stageId) + 1 : 0;
    const cellMeta = (c: FunnelCell): { label: string; color: string } => CELLS.find((x) => x.cell === c)!;
    // 막힌 단계는 근접 탈락에서만 뜻이 있다 — 다른 칸은 상류가 안 막았거나 이번 단계가 원인이다.
    const showBlocked = selection !== null && selection.cells.includes("nearMiss") && stageIndex >= 0;

    return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", borderTop: "1px solid var(--border-strong)" }}>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", whiteSpace: "nowrap", overflow: "hidden" }}>
                {selection === null ? (
                    <span style={{ background: STRONG, color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 11 }}>최종 생존</span>
                ) : (
                    <>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>{stageNo}단계</span>
                        {selection.cells.map((c) => {
                            const m = cellMeta(c);
                            return <span key={c} style={{ background: m.color, color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 11, flexShrink: 0 }}>{m.label}</span>;
                        })}
                    </>
                )}
                <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {items.length.toLocaleString("ko-KR")}건{selection === null && " — 전 단계 통과(순서 무관)"}
                </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {items.length === 0 && <Note>비어 있습니다.</Note>}
                {items.length > 0 && (
                    <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                        <thead>
                            <tr style={{ color: "var(--text-tertiary)", fontSize: 10.5, textAlign: "left" }}>
                                <th style={{ width: 74, fontWeight: 400, padding: "3px 10px" }}>날짜</th>
                                {v.grain === "point" && <th style={{ width: 52, fontWeight: 400, padding: "3px 0" }}>시각</th>}
                                <th style={{ fontWeight: 400, padding: "3px 0" }}>종목</th>
                                {showBlocked && <th style={{ width: 110, fontWeight: 400, padding: "3px 0" }}>막힌 단계</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((it) => (
                                <tr key={`${it.stockCode}|${it.date}|${it.time ?? ""}`}
                                    onClick={() => it.time && goToPoint({ date: it.date, code: it.stockCode, time: it.time }, "filter-funnel")}
                                    style={{ borderTop: "1px solid var(--border-subtle)", cursor: it.time ? "pointer" : "default" }}>
                                    <td style={{ padding: "3px 10px", color: "var(--text-secondary)" }}>{it.date.slice(2).replace(/-/g, ".")}</td>
                                    {v.grain === "point" && <td style={{ padding: "3px 0", color: "var(--accent-primary)" }}>{it.time?.slice(0, 5) ?? "—"}</td>}
                                    <td style={{ padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(it.stockCode)}</td>
                                    {showBlocked && (
                                        <td style={{ padding: "3px 0", color: FAIL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {v.blockedLabels(it, stageIndex).join(" · ")}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {items.length > MAX_ROWS && (
                    <div style={{ padding: "4px 10px", color: "var(--text-tertiary)", fontSize: 10.5 }}>…외 {(items.length - MAX_ROWS).toLocaleString("ko-KR")}건</div>
                )}
            </div>
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={{ padding: 12, fontSize: 12, color: "var(--text-tertiary)" }}>{children}</div>;
}

const iconBtn: React.CSSProperties = {
    border: "none", background: "transparent", color: "var(--text-tertiary)",
    cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "1px 2px", flexShrink: 0,
};
