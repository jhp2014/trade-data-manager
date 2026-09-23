// Daily 타점 생성소의 조건 보드 — 옛 「집합 편성」 ConditionBoard 의 **하루 부분만** 새로 지은 것
// (2026-09-24, decisions 「Daily 타점 생성 = 돌파 사슬」). 줄 쌓임·칩·아랫줄 편집면의 문법은 그대로다 —
// 규칙 전문은 decisions 「집합 편성 — 가로 드릴다운 줄」.
//
// 빠진 것(종단 전용 — 종단 보류): 타점 정의 머리·계산 축·날짜·결과·급타점·그룹·테마 강도 입구.
// 모드는 하루 고정이라 팔레트에 회색이 없다 — 여기 있는 종류는 전부 하루에서 산다.
//
// ## 「돌파」 줄 ↔ 격자판 — pull · 1:1 · 영속
// 테마 조건판과 **같은 연동 맵**(`themeBindings` — stageId → panelId, 종류 무관)을 쓴다. 새 슬라이스를
// 만들면 슬롯 발급·복제에서 연동 청소를 둘 다 불러야 하는데(컴파일러가 못 잡는 자리) 그걸 빠뜨리기 쉽다.
// 노브(zigzag·밴드·이름표)의 편집면은 **격자판 하나**다 — 줄에는 요약과 전이 칩만 있다.
import { useCallback, useMemo, useRef, useState } from "react";
import { DEFAULT_BREAKOUT, type CellValueRange } from "@trade-data-manager/market/domain";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { createPanelSlot, openPanelExact } from "../../lib/openPanel.js";
import { selectEditingExpr, selectEditingStages, useWorkbench } from "../../store/workbench.js";
import { useDock } from "../../store/dock.js";
import { slotTitleOf } from "../../shell/panelCatalog.js";
import { parseSlotId } from "../../shell/panelSlots.js";
import { useDismiss } from "../../ui/useDismiss.js";
import { CellStageFields } from "../filter/CellPredicateFields.js";
import { RailEditors, type RailEditor } from "../filter/ConditionEditors.js";
import { ExprRow, type RowHandlers } from "../filter/ExprRow.js";
import { FilterRow } from "../filter/FilterRow.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { Note } from "../filter/grain.js";
import { hasCycle, idOf, leavesOf, mapLeaves, negateGroupAt, negateTerm, refsOf, removeGroupAt, removeTerm, setOpAt, toggleBoundaryGroup, type SetExpr, type SetTerm } from "../filter/expr.js";
import { setDisplayName, stageLabel } from "../filter/label.js";
import { stageKind, type FilterPredicate, type FilterStage } from "../filter/stage.js";
import { stageDeficiency } from "../filter/universe.js";
import { DAILY_GRID_BASE } from "./dailyPanelIds.js";

const UNIVERSE = "daily" as const;

export function DailyConditionBoard(): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench(selectEditingStages);
    const setStage = useWorkbench((s) => s.setFilterStage);
    const addStage = useWorkbench((s) => s.addFilterStage);
    const applyRail = useWorkbench((s) => s.applyFilterRail);
    const expr = useWorkbench(selectEditingExpr);
    const savedSets = useWorkbench((s) => s.savedSets);
    const drillInto = useWorkbench((s) => s.drillInto);
    const popTo = useWorkbench((s) => s.popTo);
    const addGroupTerm = useWorkbench((s) => s.addGroupTerm);
    const addSetRef = useWorkbench((s) => s.addSetRef);
    const renameSet = useWorkbench((s) => s.renameSet);
    const deleteSet = useWorkbench((s) => s.deleteSet);
    const editPath = useWorkbench((s) => s.editPath);
    const editingSetId = useWorkbench((s) => s.editingSetId);

    // ── 격자판 연동 ──
    const bindings = useWorkbench((s) => s.themeBindings);
    const bindTheme = useWorkbench((s) => s.bindTheme);
    const unbindTheme = useWorkbench((s) => s.unbindTheme);
    const dockSlots = useDock((s) => s.slots);
    const [gridLink, setGridLink] = useState<{ stageId: string; x: number; y: number } | null>(null);
    // 바인딩이 가리키는 판이 **슬롯 대장에 살아 있을 때만** 연동(고아 = 미연동 — 테마 보드와 같은 규칙).
    const livePanelOf = useCallback((stageId: string): string | undefined => {
        const pid = bindings[stageId];
        return pid !== undefined && dockSlots.includes(pid) && parseSlotId(pid)?.base === DAILY_GRID_BASE ? pid : undefined;
    }, [bindings, dockSlots]);

    const [railEditor, setRailEditor] = useState<RailEditor | null>(null);
    const [picked, setPicked] = useState<string | null>(null);

    /** 조건 만들기의 **유일한 입구** — 만든 조건 id 를 돌려준다(돌파는 곧바로 연동 메뉴를 편다). */
    const addStageHere = (predicates: FilterPredicate[]): string | undefined => {
        const before = new Set(selectEditingStages(useWorkbench.getState()).map((x) => x.id));
        addStage(predicates);
        return selectEditingStages(useWorkbench.getState()).find((x) => !before.has(x.id))?.id;
    };

    /** 줄 이름 클릭 — 그 종류의 편집면으로. 시각 = 그 자리 팝오버, 돌파 = 연동 격자판(미연동이면 연동 메뉴). */
    const openEditor = (stage: FilterStage, e: React.MouseEvent): void => {
        switch (stageKind(stage)) {
            case "breakout": {
                const bound = livePanelOf(stage.id);
                if (bound !== undefined) openPanelExact(bound);
                else setGridLink({ stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            }
            case "time":
                setRailEditor({ kind: "time", stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            default:
                return; // 셀 값·캔들 등 — 줄 안에서 만진다.
        }
    };

    // ── 칩 이름·참조 표시 — 옛 보드와 같은 자(두 곳이면 같은 조건이 두 이름으로 선다) ──
    const labelById = useMemo(() => {
        const m = new Map<string, string>();
        for (const f of savedSets) for (const st of leavesOf(f.expr)) if (!m.has(st.id)) m.set(st.id, stageLabel(st, v.labelLook));
        return m;
    }, [savedSets, v.labelLook]);
    const chipLabelOf = useCallback((id: string) => labelById.get(id) ?? "(지워진 조건)", [labelById]);
    const refInfo = useCallback((setId: string) => {
        const set = savedSets.find((x) => x.id === setId);
        const usedBy = savedSets.filter((x) => refsOf(x.expr).includes(setId)).length;
        return {
            name: set ? setDisplayName(set, v.labelLook, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)") : "(지워진 집합)",
            named: set?.name !== undefined,
            broken: set === undefined,
            usedBy,
        };
    }, [savedSets, v.labelLook]);

    /** 붙일 수 있는 집합 — 같은 모드(하루)만·자기·이미 붙은 것·순환 제외(거절은 스토어가 한 번 더). */
    const attachable = useMemo(() => {
        const exprOfSet = (id: string): SetExpr | undefined => savedSets.find((x) => x.id === id)?.expr;
        const mine = refsOf(expr);
        return savedSets.filter((f) => f.id !== editingSetId && !mine.includes(f.id)
            && f.universe === UNIVERSE && !hasCycle(editingSetId, f.expr, exprOfSet));
    }, [savedSets, expr, editingSetId]);

    const rows = editPath.length > 0 ? editPath : [editingSetId];
    const exprOfSet = useCallback((sid: string): SetExpr => savedSets.find((x) => x.id === sid)?.expr ?? expr, [savedSets, expr]);
    /** 윗줄을 만지면 거기가 편집 대상 — ⚠ 화면에 없는 줄이면 아무것도 안 한다(남의 집합에 덮어쓰기 방지). */
    const actOn = useCallback((sid: string, fn: (e: SetExpr) => SetExpr): void => {
        const i = rows.indexOf(sid);
        if (i < 0) return;
        if (sid !== editingSetId) popTo(i);
        const st = useWorkbench.getState();
        const cur = st.savedSets.find((x) => x.id === sid)?.expr;
        if (cur) st.setFilterExpr(fn(cur));
    }, [rows, editingSetId, popTo]);

    const rowHandlers: RowHandlers = useMemo(() => ({
        labelOf: chipLabelOf,
        refInfo,
        onPickLeaf: (sid, leafId) => {
            const i = rows.indexOf(sid);
            if (i >= 0 && sid !== editingSetId) popTo(i);
            setPicked((cur) => (cur === leafId ? null : leafId));
        },
        onDrill: (sid, target) => {
            const i = rows.indexOf(sid);
            if (i < 0) return;
            // 이미 열린 묶음을 다시 누르면 닫는다(조건 칩의 짚기 토글과 같은 손짓).
            if (rows[i + 1] === target) { setPicked(null); popTo(i); return; }
            if (sid !== editingSetId) popTo(i);
            setPicked(null);
            drillInto(target);
        },
        onSetOp: (sid, at, op) => actOn(sid, (e) => setOpAt(e, at, op)),
        onToggleBoundary: (sid, at) => actOn(sid, (e) => toggleBoundaryGroup(e, at)),
        onNegateGroup: (sid, at) => actOn(sid, (e) => negateGroupAt(e, at)),
        onUngroup: (sid, from) => actOn(sid, (e) => removeGroupAt(e, from)),
        onNegateTerm: (sid, termId) => actOn(sid, (e) => negateTerm(e, termId)),
        onToggleTerm: (sid, stageId) => actOn(sid, (e) => mapLeaves(e, (x) => (x.id === stageId ? { ...x, enabled: !x.enabled } : x))),
        onRemoveTerm: (sid, termId) => { actOn(sid, (e) => removeTerm(e, termId)); setPicked(null); },
        onRenameSet: (targetId, name) => renameSet(targetId, name),
        onDeleteSet: (targetId) => deleteSet(targetId),
    }), [chipLabelOf, refInfo, rows, editingSetId, popTo, drillInto, actOn, renameSet, deleteSet]);

    const openTerm = useMemo(() => {
        if (picked === null) return null;
        const t = expr.of.find((x) => idOf(x) === picked);
        return t?.kind === "cond" ? t : null;
    }, [picked, expr]);

    const condRow = (t: Extract<SetTerm, { kind: "cond" }>): JSX.Element => {
        const isBreakout = stageKind(t.stage) === "breakout";
        const bound = isBreakout ? livePanelOf(t.stage.id) : undefined;
        return (
            <FilterRow
                key={t.stage.id}
                no={exprOfSet(editingSetId).of.findIndex((x) => idOf(x) === t.stage.id) + 1}
                stage={t.stage}
                label={stageLabel(t.stage, v.labelLook)}
                dead={v.deadStageIds.includes(t.stage.id)}
                deficiency={stageDeficiency(t.stage, UNIVERSE)}
                cellFields={<CellStageFields stage={t.stage} onPatch={setStage} />}
                neg={t.neg === true}
                linked={false}
                linkedLabel={isBreakout ? (bound !== undefined ? slotTitleOf(bound) : "미연동") : undefined}
                onLinkedClick={(e) => setGridLink({ stageId: t.stage.id, x: e.clientX, y: e.clientY })}
                onOpen={(e) => openEditor(t.stage, e)}
            />
        );
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && (
                    <div style={{ marginBottom: 3 }}>
                        {rows.map((sid, i) => (
                            <ExprRow key={sid} setId={sid} expr={exprOfSet(sid)} h={rowHandlers}
                                open={i < rows.length - 1 ? rows[i + 1]! : picked} />
                        ))}
                    </div>
                )}

                {/* 열린 항의 편집면 — 편집면은 한 곳이다. */}
                {!v.isLoading && openTerm !== null && condRow(openTerm)}

                {!v.isLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                        <AddCondition
                            onCell={(p) => { addStageHere([p]); }}
                            onBreakout={(e) => {
                                // 행을 만들고 곧바로 연동 메뉴를 편다 — 노브의 편집면이 격자판이라서다(무시하면 미연동 행).
                                const made = addStageHere([{ kind: "breakout", ...DEFAULT_BREAKOUT }]);
                                if (made) setGridLink({ stageId: made, x: e.clientX, y: e.clientY });
                            }}
                        />
                        <HeaderPopover width={240} align="start" closeOnOutside
                            trigger={(open, toggle) => (
                                <button onClick={toggle} disabled={attachable.length === 0}
                                    title={attachable.length === 0 ? "붙일 다른 집합이 없습니다" : "이미 있는 집합을 이 식에 한 항으로 붙입니다 — 고치면 그 집합을 쓰는 곳이 전부 같이 바뀝니다"}
                                    style={addBtn(attachable.length === 0)}>
                                    ＋ 집합 {open ? "▴" : "▾"}
                                </button>
                            )}>
                            {(close) => (
                                <div style={{ maxHeight: 240, overflowY: "auto", padding: "3px 0" }}>
                                    {attachable.map((f) => (
                                        <button key={f.id} onClick={() => { addSetRef(f.id); close(); }} title={`${refInfo(f.id).name} — 이 식에 한 항으로 붙입니다`} style={menuItem}>
                                            {refInfo(f.id).name}
                                            {refInfo(f.id).usedBy >= 1 && <span style={{ marginLeft: 5, fontSize: 9.5, color: "var(--text-tertiary)" }}>쓰는 곳 {refInfo(f.id).usedBy}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </HeaderPopover>
                        <button onClick={() => addGroupTerm()} title="새 묶음 — 빈 집합을 만들어 이 식에 붙이고 그 안으로 내려갑니다" style={addBtn(false)}>
                            ＋ 묶음
                        </button>
                    </div>
                )}
                <div style={{ height: 8 }} />
            </div>

            {gridLink !== null && (
                <LinkMenu anchor={gridLink}
                    boundId={livePanelOf(gridLink.stageId)}
                    candidates={dockSlots.filter((id) => {
                        if (parseSlotId(id)?.base !== DAILY_GRID_BASE) return false;
                        // 다른 **살아 있는 돌파 행**이 쓰는 판은 뺀다(1:1). 고아 바인딩은 판을 점유하지 않는다.
                        return !Object.entries(bindings).some(([sid, pid]) => pid === id && sid !== gridLink.stageId
                            && stages.some((st) => st.id === sid && stageKind(st) === "breakout"));
                    })}
                    onPick={(panelId) => { bindTheme(gridLink.stageId, panelId); openPanelExact(panelId); setGridLink(null); }}
                    onNew={() => { const id = createPanelSlot(DAILY_GRID_BASE); bindTheme(gridLink.stageId, id); openPanelExact(id); setGridLink(null); }}
                    onUnbind={() => { unbindTheme(gridLink.stageId); setGridLink(null); }}
                    onClose={() => setGridLink(null)} />
            )}

            {/* 시각 조건 팝오버 — 주소(stageId)를 반드시 준다(없으면 "첫 잎" 규칙으로 떨어져 `시각A ∨ 시각B` 를 못 만든다). */}
            <RailEditors editor={railEditor} stages={stages}
                write={(key, predicate, stageId) => applyRail(key, predicate, stageId ?? null)}
                onClose={() => setRailEditor(null)} />
        </div>
    );
}

const addBtn = (disabled: boolean): React.CSSProperties => ({
    fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent",
    color: "var(--text-secondary)", cursor: disabled ? "default" : "pointer",
});
const menuItem: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)",
    cursor: "pointer", font: "inherit", fontSize: 11.5, padding: "5px 10px",
};

/**
 * ＋ 조건 — 하루 종류만. 생성기(돌파)가 맨 위, 그 아래가 후보에 거는 필터들이다(필터는 구조를 안 바꾼다).
 * ⚠ 판은 **포털 + fixed**(HeaderPopover) — 스크롤 컨테이너 안 absolute 는 탭 스트립에 덮였다(2026-09-19 실측).
 */
function AddCondition({ onCell, onBreakout }: {
    onCell: (p: FilterPredicate) => void;
    onBreakout: (e: React.MouseEvent) => void;
}): JSX.Element {
    const atLeast = (value: number): CellValueRange => ({ from: { kind: "value", value } });
    const item = (close: () => void, label: string, hint: string, run: (e: React.MouseEvent) => void): JSX.Element => (
        <button key={label} onClick={(e) => { close(); run(e); }} title={hint} style={menuItem}>{label}</button>
    );
    const head = (text: string): JSX.Element => (
        <div style={{ padding: "4px 10px 1px", fontSize: 10, color: "var(--text-tertiary)" }}>{text}</div>
    );
    return (
        <div style={{ padding: "6px 2px 2px" }}>
            <HeaderPopover width={230} align="start" closeOnOutside
                trigger={(open, toggle) => (
                    <button onClick={toggle} title="조건 만들기 — 생성기(돌파)와 후보 필터" style={addBtn(false)}>
                        ＋ 조건 {open ? "▴" : "▾"}
                    </button>
                )}>
                {(close) => (
                    <div style={{ overflowY: "auto", padding: "3px 0" }}>
                        {head("생성기")}
                        {item(close, "돌파", "돌파 사슬 후보 — 고가(와 기준선) 밴드 사건에서 사슬이 서고, 눌림(zigzag) 전까지 대금이 커진 봉이 후보. 노브는 격자판에서", onBreakout)}
                        {head("후보 필터")}
                        {item(close, "분봉 대금", "그 분 봉 자신의 거래대금(억) — 돌파 대금 필터", () => onCell({ kind: "cellValue", field: "minuteAmountEok", ranges: [atLeast(30)] }))}
                        {item(close, "양봉", "캔들 모양 — 종가 > 시가(줄에서 음봉으로 바꿀 수 있다)", () => onCell({ kind: "candleShape", shape: "bull" }))}
                        {item(close, "시각", "장중 시각 창 — 09:00~10:30 처럼", () => onCell({ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }))}
                        {item(close, "등락률", "그 분의 등락률(UN %) — 값은 줄에서 만집니다", () => onCell({ kind: "cellValue", field: "ratePct", ranges: [atLeast(5)] }))}
                        {item(close, "누적대금", "그 분까지의 세션 누적 거래대금(억)", () => onCell({ kind: "cellValue", field: "cumAmountEok", ranges: [atLeast(100)] }))}
                        {item(close, "분봉고가", "그 분 봉의 고가(UN %)", () => onCell({ kind: "cellValue", field: "minuteHighPct", ranges: [atLeast(5)] }))}
                        {item(close, "존순위", "테마 존 안 순위(작을수록 위) — 분 단면을 굽는 비싼 재료입니다", () => onCell({ kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 3 } }] }))}
                        {item(close, "전고 돌파", "직전 W 거래일 고가를 분봉 고가가 넘는 분(당일 제외)", () => onCell({ kind: "priorHighBreak", days: 20 }))}
                    </div>
                )}
            </HeaderPopover>
        </div>
    );
}

/** 돌파 행의 연동 메뉴 — 미연동 격자판 + 「＋ 새 격자판」 + (연동 중이면) 해제. 1:1(다른 행이 쓰는 판은 없다). */
function LinkMenu({ anchor, boundId, candidates, onPick, onNew, onUnbind, onClose }: {
    anchor: { x: number; y: number };
    boundId: string | undefined;
    candidates: readonly string[];
    onPick: (panelId: string) => void;
    onNew: () => void;
    onUnbind: () => void;
    onClose: () => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, onClose, true);
    const item = (label: string, hint: string, run: () => void, accent = false): JSX.Element => (
        <button key={label} onClick={run} title={hint}
            style={{ ...menuItem, whiteSpace: "nowrap", color: accent ? "var(--accent-primary)" : "var(--text-primary)" }}>
            {label}
        </button>
    );
    return (
        <div ref={ref}
            style={{
                position: "fixed", top: Math.min(anchor.y + 4, window.innerHeight - 200), left: Math.min(anchor.x, window.innerWidth - 190),
                zIndex: 300, minWidth: 180, background: "var(--bg-primary)", border: "1px solid var(--border-default)",
                borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", padding: "4px 0",
            }}>
            <div style={{ padding: "3px 10px", fontSize: 10, color: "var(--text-tertiary)" }}>연동할 격자판 — 노브는 거기서 만진다</div>
            {candidates.map((id) =>
                item(`${boundId === id ? "◉ " : "○ "}${slotTitleOf(id)}`, boundId === id ? "지금 이 행이 연동된 판" : "이 판에 연동하고 연다",
                    () => onPick(id), boundId === id))}
            {item("＋ 새 격자판", "격자판을 만들어 연동하고 연다", onNew)}
            {boundId !== undefined && item("연동 해제", "판은 남고 기본 노브로 그린다", onUnbind)}
        </div>
    );
}
