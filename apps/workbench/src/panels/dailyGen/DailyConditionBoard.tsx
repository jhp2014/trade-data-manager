// 일별 타점[조건]의 조건 보드 — 옛 「집합 편성」 ConditionBoard 의 **하루 부분만** 새로 지은 것
// (2026-09-24, decisions 「Daily 타점 생성 = 돌파 사슬」). 줄 쌓임·칩·아랫줄 편집면의 문법은 그대로다 —
// 규칙 전문은 decisions 「집합 편성 — 가로 드릴다운 줄」.
//
// 빠진 것(종단 전용 — 종단 보류): 타점 정의 머리·계산 축·날짜·결과·급타점·그룹·테마 강도 입구.
// 모드는 하루 고정이라 팔레트에 회색이 없다 — 여기 있는 종류는 전부 하루에서 산다.
//
// ## 「돌파」 줄 — 값의 편집면은 그 자리 팝오버(2026-09-26, 옛 격자판·연동 모델 폐지)
// 테마 줄과 같은 문법: 칩 = 요약 라벨(breakoutText — predicateLabel 이 짓는다), 클릭 = 팝오버.
// 값의 주인은 줄(집합) — 팝오버는 stageId 로 최신 술어를 스토어에서 읽고 그 줄에 바로 쓴다.
import { useCallback, useMemo, useState } from "react";
import { DEFAULT_BREAKOUT, DEFAULT_THEME_ZONE, type CellPredicate, type CellValueRange } from "@trade-data-manager/market/domain";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { allStagesOf, selectEditingExpr, selectEditingStages, useWorkbench } from "../../store/workbench.js";
import { CellStageFields } from "../filter/CellPredicateFields.js";
import { RailEditors, type RailEditor } from "../filter/ConditionEditors.js";
import { ExprRow, type RowHandlers } from "../filter/ExprRow.js";
import { FilterRow } from "../filter/FilterRow.js";
import { activeExpr, hasCycle, idOf, leavesOf, mapLeaves, negateGroupAt, negateTerm, refsOf, removeGroupAt, removeTerm, setOpAt, toggleBoundaryGroup, type SetExpr, type SetTerm } from "../filter/expr.js";
import { setDisplayName, stageLabel } from "../filter/label.js";
import { stageKind, type FilterPredicate, type FilterStage } from "../filter/stage.js";
import { stageDeficiency } from "../filter/universe.js";
import { BreakoutCondEditor } from "./BreakoutCondEditor.js";
import { ThemeCondEditor } from "./ThemeCondEditor.js";
import { FAIL, PIN } from "../../styles/palette.js";
import { LinkIcon } from "../../components/icons.js";

const UNIVERSE = "daily" as const;
type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

export function DailyConditionBoard(): JSX.Element {
    const stages = useWorkbench(selectEditingStages);
    const setStage = useWorkbench((s) => s.setFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
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

    const [railEditor, setRailEditor] = useState<RailEditor | null>(null);
    /** 테마·돌파 팝오버 — 줄에서 연다(값의 편집면, 2026-09-26). stageId 로 최신 술어를 스토어에서 읽는다. */
    const [themeEdit, setThemeEdit] = useState<{ stageId: string; x: number; y: number } | null>(null);
    const [breakoutEdit, setBreakoutEdit] = useState<{ stageId: string; x: number; y: number } | null>(null);
    const [picked, setPicked] = useState<string | null>(null);

    /** 조건 만들기의 **유일한 입구** — 만든 조건 id 를 돌려준다(돌파·테마는 곧바로 팝오버를 편다). */
    const addStageHere = (predicates: FilterPredicate[]): string | undefined => {
        const before = new Set(selectEditingStages(useWorkbench.getState()).map((x) => x.id));
        addStage(predicates);
        return selectEditingStages(useWorkbench.getState()).find((x) => !before.has(x.id))?.id;
    };

    /** 줄 이름 클릭 — 그 종류의 편집면으로(시각·테마·돌파 = 그 자리 팝오버). */
    const openEditor = (stage: FilterStage, e: React.MouseEvent): void => {
        switch (stageKind(stage)) {
            case "time":
                setRailEditor({ kind: "time", stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            case "theme":
                setThemeEdit({ stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            case "breakout":
                setBreakoutEdit({ stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            default:
                return; // 셀 값·캔들 등 — 줄 안에서 만진다.
        }
    };

    // ── 칩 이름·참조 표시 — 옛 보드와 같은 자(두 곳이면 같은 조건이 두 이름으로 선다) ──
    const labelById = useMemo(() => {
        const m = new Map<string, string>();
        for (const f of savedSets) for (const st of leavesOf(f.expr)) if (!m.has(st.id)) m.set(st.id, stageLabel(st));
        return m;
    }, [savedSets]);
    const chipLabelOf = useCallback((id: string) => labelById.get(id) ?? "(지워진 조건)", [labelById]);
    const refInfo = useCallback((setId: string) => {
        const set = savedSets.find((x) => x.id === setId);
        const usedBy = savedSets.filter((x) => refsOf(x.expr).includes(setId)).length;
        return {
            name: set ? setDisplayName(set, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)") : "(지워진 집합)",
            named: set?.name !== undefined,
            broken: set === undefined,
            usedBy,
        };
    }, [savedSets]);

    /** ＋ 집합 판의 세 칸 — 올라와 있음 · 붙일 수 있음 · 붙일 수 없음(이유). 거절은 스토어가 한 번 더. */
    const setPicker = useMemo(() => setPickerOf(savedSets, editingSetId, expr, editPath), [savedSets, expr, editingSetId, editPath]);
    /** 이름 없는 집합을 붙이려는 중 — 그 줄에 이름 칸이 열린다(두 곳에서 쓰는 순간 "개념"이라 이름을 받는다). */
    const [namingSet, setNamingSet] = useState<string | null>(null);
    /** Esc 로 이름 칸을 걷은 줄 — 포커스를 그 줄로 되돌린다(안 돌리면 몸통으로 떨어져 다음 Esc 가 판을 닫는다). */
    const [refocusSet, setRefocusSet] = useState<string | null>(null);

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

    /** 돌파 줄 id 집합 — 칩 클릭 = 팝오버 가름(모든 집합에서 본다: 윗줄 칩도 같은 칩이다). */
    const breakoutById = useMemo(() => {
        const m = new Map<string, BreakoutPred>();
        for (const st of allStagesOf(savedSets)) {
            const p = st.predicates.find((x): x is BreakoutPred => x.kind === "breakout");
            if (p) m.set(st.id, p);
        }
        return m;
    }, [savedSets]);

    const rowHandlers: RowHandlers = useMemo(() => ({
        labelOf: chipLabelOf,
        refInfo,
        onPickLeaf: (sid, leafId, at) => {
            const i = rows.indexOf(sid);
            if (i >= 0 && sid !== editingSetId) popTo(i);
            // 돌파 칩 = 그 자리 팝오버 — 아랫줄을 열지 않는다(사슬 필터 식은 팝오버가 층 문법째 든다).
            // ⚠ 쓰기는 **편집 집합의** 줄에 닿으므로 위에서 popTo 로 그 줄의 집합을 편집 대상으로 먼저 세운다.
            if (breakoutById.has(leafId)) {
                setBreakoutEdit({ stageId: leafId, ...at });
                return;
            }
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
    }), [chipLabelOf, refInfo, rows, editingSetId, popTo, drillInto, actOn, renameSet, deleteSet, breakoutById]);

    const openTerm = useMemo(() => {
        if (picked === null) return null;
        const t = expr.of.find((x) => idOf(x) === picked);
        return t?.kind === "cond" ? t : null;
    }, [picked, expr]);

    const condRow = (t: Extract<SetTerm, { kind: "cond" }>): JSX.Element => {
        return (
            <FilterRow
                key={t.stage.id}
                no={exprOfSet(editingSetId).of.findIndex((x) => idOf(x) === t.stage.id) + 1}
                stage={t.stage}
                label={stageLabel(t.stage)}
                dead={false}
                deficiency={stageDeficiency(t.stage, UNIVERSE)}
                cellFields={<CellStageFields stage={t.stage} onPatch={setStage} />}
                neg={t.neg === true}
                onOpen={(e) => openEditor(t.stage, e)}
            />
        );
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {(
                    <div style={{ marginBottom: 3 }}>
                        {rows.map((sid, i) => (
                            <ExprRow key={sid} setId={sid} expr={exprOfSet(sid)} h={rowHandlers}
                                open={i < rows.length - 1 ? rows[i + 1]! : picked} />
                        ))}
                    </div>
                )}

                {/* 열린 항의 편집면 — 편집면은 한 곳이다. */}
                {openTerm !== null && condRow(openTerm)}

                {(
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                        <AddCondition
                            onCell={(p) => { addStageHere([p]); }}
                            onBreakout={(e) => {
                                // 행을 만들고 곧바로 팝오버 — 값의 편집면이 팝오버 하나라서다(테마와 같은 결).
                                const made = addStageHere([{ kind: "breakout", ...DEFAULT_BREAKOUT }]);
                                if (made) setBreakoutEdit({ stageId: made, x: e.clientX, y: e.clientY });
                            }}
                            onTheme={(e) => {
                                // 행을 만들고 곧바로 팝오버 — 값의 편집면이 팝오버 하나라서다(시각 조건과 같은 결).
                                const made = addStageHere([{ kind: "theme", ...DEFAULT_THEME_ZONE }]);
                                if (made) setThemeEdit({ stageId: made, x: e.clientX, y: e.clientY });
                            }}
                        />
                        {/* 새로 만드는 손(조건·묶음)이 앞, 있는 것을 가져오는 손(집합)이 뒤다. */}
                        <button onClick={() => addGroupTerm()} title="새 묶음 — 빈 집합을 만들어 이 식에 붙이고 그 안으로 내려갑니다" style={addBtn}>
                            ＋ 묶음
                        </button>
                        {/* ⚠ 늘 열린다 — 붙일 게 없어도 **왜 없는지**를 판이 말한다. 규칙(2026-09-25): **절대 안 되는 것은
                            안 보이고**(열린 집합·경로 위 조상·종단 — 이 판은 Daily 전용), **상황 때문에 안 되는 것만** 회색 +
                            이유(나를 쓰는 집합 · 빈 집합). 식 칩 우클릭 판 Item 의 "숨기지 않고 회색 + 이유"는 후자에만 걸린다. */}
                        <HeaderPopover width={260} align="start" closeOnOutside
                            trigger={(open, toggle) => (
                                <button onClick={() => { setNamingSet(null); setRefocusSet(null); toggle(); }}
                                    title="이미 있는 집합을 이 식에 한 항으로 붙입니다 — 고치면 그 집합을 쓰는 곳이 전부 같이 바뀝니다"
                                    style={addBtn}>
                                    ＋ 집합 {open ? "▴" : "▾"}
                                </button>
                            )}>
                            {(close) => {
                                const { attached, broken, attachable, blocked } = setPicker;
                                const head = (text: string, first: boolean): JSX.Element => (
                                    <div style={{ padding: "4px 10px 1px", fontSize: 10, color: "var(--text-tertiary)", ...(first ? {} : { borderTop: "0.5px solid var(--border-subtle)", marginTop: 3, paddingTop: 5 }) }}>{text}</div>
                                );
                                // 쓰는 곳 = 🔗N — 집합 목록 판과 같은 표기(비어 있음 = 아무도 안 씀).
                                const used = (id: string): JSX.Element | null => (refInfo(id).usedBy >= 1
                                    ? <span title={`이 집합을 쓰는 집합 ${refInfo(id).usedBy}개 — 고치면 같이 바뀝니다`}
                                        style={{ marginLeft: "auto", paddingLeft: 8, display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9.5, color: "var(--text-tertiary)" }}>
                                        <LinkIcon />{refInfo(id).usedBy}
                                    </span>
                                    : null);
                                const row = { ...menuItem, display: "flex", alignItems: "center", gap: 6 } as const;
                                const check = (on: boolean): JSX.Element => <span style={{ width: 10, flexShrink: 0, color: "var(--accent-primary)", fontSize: 11 }}>{on ? "✓" : ""}</span>;
                                if (attached.length + broken.length + attachable.length + blocked.length === 0) {
                                    return <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-tertiary)" }}>저장된 다른 집합이 없습니다 — ＋ 묶음으로 만들 수 있습니다</div>;
                                }
                                let first = true;
                                const section = (text: string): JSX.Element => { const h = head(text, first); first = false; return h; };
                                return (
                                    <div style={{ maxHeight: 280, overflowY: "auto", padding: "3px 0" }}>
                                        {attached.length + broken.length > 0 && section("이 식에 올라와 있음")}
                                        {attached.map((f) => (
                                            // 칩 클릭과 같은 손짓 — 그 묶음을 연다. 빼기는 칩 우클릭(구조 손은 우클릭).
                                            <button key={f.id} role="menuitem" onClick={() => { rowHandlers.onDrill(editingSetId, f.id); close(); }}
                                                title={`${refInfo(f.id).name} — 이미 이 식에 붙어 있습니다. 누르면 그 묶음을 엽니다(빼기는 칩 우클릭)`} style={row}>
                                                {check(true)}<span style={{ ...pickName, color: PIN }}>{refInfo(f.id).name}</span>{used(f.id)}
                                            </button>
                                        ))}
                                        {broken.map((id) => (
                                            <button key={id} role="menuitem" disabled title="가리키는 집합이 지워졌습니다 — 칩 우클릭으로 이 자리를 뺄 수 있습니다"
                                                style={{ ...row, cursor: "default", color: FAIL }}>
                                                {check(true)}<span>(지워진 집합)</span>
                                            </button>
                                        ))}
                                        {attachable.length > 0 && section("붙일 수 있음")}
                                        {attachable.map((f) => {
                                            const unnamed = f.name === undefined;
                                            if (namingSet === f.id) {
                                                return (
                                                    <NameAndAttach key={f.id} autoName={refInfo(f.id).name}
                                                        taken={(n) => savedSets.some((x) => x.id !== f.id && x.name === n)}
                                                        onAttach={(n) => { if (n !== "") renameSet(f.id, n); addSetRef(f.id); setNamingSet(null); close(); }}
                                                        onCancel={() => { setNamingSet(null); setRefocusSet(f.id); }} />
                                                );
                                            }
                                            return (
                                                // 이름 없는 집합 = 누르면 그 자리에 이름 칸(강제 아님 — 비우고 Enter 면 그대로 붙는다).
                                                <button key={f.id} role="menuitem" autoFocus={refocusSet === f.id}
                                                    onClick={() => { if (unnamed) setNamingSet(f.id); else { addSetRef(f.id); close(); } }}
                                                    title={unnamed
                                                        ? `${refInfo(f.id).name} — 이름이 없는 집합입니다. 누르면 이름을 짓고 붙입니다(비우면 그대로)`
                                                        : `${refInfo(f.id).name} — 이 식에 한 항으로 붙입니다`}
                                                    style={row}>
                                                    {check(false)}
                                                    <span style={{ ...pickName, ...(unnamed ? { color: PIN, opacity: 0.65, borderBottom: `1px dashed ${PIN}` } : { color: PIN }) }}>{refInfo(f.id).name}</span>
                                                    {unnamed && <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>이름 없음</span>}
                                                    {used(f.id)}
                                                </button>
                                            );
                                        })}
                                        {blocked.length > 0 && section("붙일 수 없음")}
                                        {blocked.map(({ set: f, why }) => (
                                            <button key={f.id} role="menuitem" disabled title={BLOCK_HINT[why]}
                                                style={{ ...row, cursor: "default", color: "var(--text-tertiary)" }}>
                                                {check(false)}<span style={pickName}>{refInfo(f.id).name}</span>
                                                <span style={{ marginLeft: "auto", paddingLeft: 8, fontSize: 9.5 }}>{BLOCK_TEXT[why]}</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            }}
                        </HeaderPopover>
                    </div>
                )}
                <div style={{ height: 8 }} />
            </div>

            {themeEdit !== null && (() => {
                const st = stages.find((x) => x.id === themeEdit.stageId);
                const pred = st?.predicates.find((x): x is Extract<FilterPredicate, { kind: "theme" }> => x.kind === "theme");
                if (!st || !pred) return null; // 줄이 지워졌으면 조용히 닫힌다
                return (
                    <ThemeCondEditor at={themeEdit} pred={pred} onClose={() => setThemeEdit(null)}
                        onWrite={(next) => setPredicates(st.id, st.predicates.map((x) => (x.kind === "theme" ? next : x)))} />
                );
            })()}

            {breakoutEdit !== null && (() => {
                const st = stages.find((x) => x.id === breakoutEdit.stageId);
                const pred = st?.predicates.find((x): x is BreakoutPred => x.kind === "breakout");
                if (!st || !pred) return null; // 줄이 지워졌으면 조용히 닫힌다
                return (
                    // key = 줄 id — 팝오버 안 "열린 칩" 상태가 다른 줄의 같은 칩 id(m0·m1…)로 새지 않게.
                    <BreakoutCondEditor key={st.id} at={breakoutEdit} pred={pred} onClose={() => setBreakoutEdit(null)}
                        onWrite={(next) => setPredicates(st.id, st.predicates.map((x) => (x.kind === "breakout" ? next : x)))} />
                );
            })()}

            {/* 시각 조건 팝오버 — 주소(stageId)를 반드시 준다(없으면 "첫 잎" 규칙으로 떨어져 `시각A ∨ 시각B` 를 못 만든다). */}
            <RailEditors editor={railEditor} stages={stages}
                write={(key, predicate, stageId) => applyRail(key, predicate, stageId ?? null)}
                onClose={() => setRailEditor(null)} />
        </div>
    );
}

type PickerSet = { id: string; name?: string; expr: SetExpr; universe: string };
/** 상황 때문에 못 붙이는 이유 — 회색 칸에 선다(절대 안 되는 것은 아예 안 선다). */
type BlockWhy = "usesMe" | "empty";
const BLOCK_TEXT: Record<BlockWhy, string> = { usesMe: "이 집합을 쓰고 있음", empty: "비어 있음" };
const BLOCK_HINT: Record<BlockWhy, string> = {
    usesMe: "그 집합이 이미 지금 집합을 쓰고 있습니다 — 붙이면 서로를 품게 됩니다(순환)",
    empty: "조건이 없는 집합입니다 — 붙여도 제한이 없습니다. 조건을 채우면 붙일 수 있습니다",
};

/**
 * ＋ 집합 판의 세 칸 — 순수부(테스트 표면). 올라와 있음 = 이 식에 이미 붙은 참조(식 순서) · 붙일 수 있음 ·
 * 붙일 수 없음(나를 쓰는 집합 → 빈 집합 순으로 첫 이유 하나).
 * **아예 안 서는 것**(무조건 불가 — 2026-09-25 사용자): 편집 중인 집합 자신 · 경로 위 조상(`path` — 묶음 안에서 볼 때
 * 위 집합들, 나를 품는다) · 종단 집합(이 판은 Daily 전용 — 하루 모드는 부팅 때 고정이라 스토어의 `filterMode` 검사와
 * 같은 답이다). 스토어 `addSetRef` 보다 **한 가지 더 엄격**하다: 빈 집합은 스토어가 받지만(부재 = 제한 없음) 판은 회색으로 세운다.
 * 지워진 집합을 가리키는 참조는 `broken` 으로 따로 낸다 — 칩 줄이 「(지워진 집합)」으로 세우는 것을 판이 숨기면 둘이 엇갈린다.
 */
export function setPickerOf<T extends PickerSet>(savedSets: readonly T[], editingSetId: string, expr: SetExpr, path: readonly string[] = []): {
    attached: T[];
    broken: string[];
    attachable: T[];
    blocked: { set: T; why: BlockWhy }[];
} {
    const exprOfSet = (id: string): SetExpr | undefined => savedSets.find((x) => x.id === id)?.expr;
    const mine = refsOf(expr);
    const attached = mine.map((id) => savedSets.find((x) => x.id === id)).filter((x): x is T => x !== undefined);
    const broken = mine.filter((id) => !savedSets.some((x) => x.id === id));
    const attachable: T[] = [];
    const blocked: { set: T; why: BlockWhy }[] = [];
    for (const f of savedSets) {
        if (mine.includes(f.id) || f.id === editingSetId || path.includes(f.id) || f.universe !== UNIVERSE) continue;
        const why: BlockWhy | null = hasCycle(editingSetId, f.expr, exprOfSet) ? "usesMe"
            // 빈 집합(꺼진 조건뿐인 것 포함 — 평가에선 부재)은 붙여도 제한이 없다.
            : activeExpr(f.expr).of.length === 0 ? "empty"
            : null;
        if (why === null) attachable.push(f);
        else blocked.push({ set: f, why });
    }
    return { attached, broken, attachable, blocked };
}

/** 이름 없는 집합 붙이기 — 이름 칸 + 붙이기. Enter = 붙이기(비우면 이름 없이) · Esc = 취소 · 이름 충돌이면 안 붙인다. */
function NameAndAttach({ autoName, taken, onAttach, onCancel }: {
    autoName: string;
    taken: (name: string) => boolean;
    onAttach: (name: string) => void;
    onCancel: () => void;
}): JSX.Element {
    const [draft, setDraft] = useState("");
    const clash = draft.trim() !== "" && taken(draft.trim());
    const submit = (): void => { if (!clash) onAttach(draft.trim()); };
    return (
        <div style={{ padding: "3px 10px 5px" }}>
            <div style={{ fontSize: 10.5, color: PIN, opacity: 0.65, marginBottom: 3 }}>{autoName}</div>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input autoFocus value={draft} placeholder="이름 (비우면 그대로)" aria-label="붙일 집합 이름"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); submit(); }
                        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
                    }}
                    style={{
                        flex: 1, minWidth: 0, fontSize: 11.5, padding: "2px 6px", borderRadius: 4, font: "inherit",
                        border: `1px solid ${clash ? FAIL : "var(--border-default)"}`, background: "var(--bg-primary)", color: "var(--text-primary)",
                    }} />
                <button onClick={submit} disabled={clash}
                    style={{ fontSize: 10.5, padding: "1px 8px", borderRadius: 4, cursor: clash ? "default" : "pointer", border: "1px solid var(--accent-primary)", background: "transparent", color: "var(--accent-primary)" }}>
                    붙이기
                </button>
            </div>
            {clash && <div style={{ fontSize: 10, color: FAIL, marginTop: 2 }}>같은 이름의 집합이 있습니다</div>}
        </div>
    );
}

/** ＋ 집합 판의 이름 칸 — 돌파 요약이 든 자동 이름이 길어 줄바꿈으로 🔗N·사유가 밀리지 않게 자른다. */
const pickName: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

const addBtn: React.CSSProperties = {
    fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent",
    color: "var(--text-secondary)", cursor: "pointer",
};
const menuItem: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)",
    cursor: "pointer", font: "inherit", fontSize: 11.5, padding: "5px 10px",
};

/**
 * ＋ 조건 — 하루 종류만. 생성기(돌파)가 맨 위, 그 아래가 후보에 거는 필터들이다(필터는 구조를 안 바꾼다).
 * ⚠ 판은 **포털 + fixed**(HeaderPopover) — 스크롤 컨테이너 안 absolute 는 탭 스트립에 덮였다(2026-09-19 실측).
 */
function AddCondition({ onCell, onBreakout, onTheme }: {
    onCell: (p: FilterPredicate) => void;
    onBreakout: (e: React.MouseEvent) => void;
    onTheme: (e: React.MouseEvent) => void;
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
                    <button onClick={toggle} title="조건 만들기 — 생성기(돌파)와 후보 필터" style={addBtn}>
                        ＋ 조건 {open ? "▴" : "▾"}
                    </button>
                )}>
                {(close) => (
                    <div style={{ overflowY: "auto", padding: "3px 0" }}>
                        {head("생성기")}
                        {item(close, "돌파", "돌파 사슬 후보 — 고가(와 기준선) 밴드 사건에서 사슬이 서고, 눌림(zigzag) 전까지 대금이 커진 봉이 후보. 값은 팝오버에서", onBreakout)}
                        {head("후보 필터")}
                        {item(close, "분봉 대금", "그 분 봉 자신의 거래대금(억) — 돌파 대금 필터", () => onCell({ kind: "cellValue", field: "minuteAmountEok", ranges: [atLeast(30)] }))}
                        {item(close, "양봉", "캔들 모양 — 종가 > 시가(줄에서 음봉으로 바꿀 수 있다)", () => onCell({ kind: "candleShape", shape: "bull" }))}
                        {item(close, "시각", "장중 시각 창 — 09:00~10:30 처럼", () => onCell({ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }))}
                        {item(close, "등락률", "그 분의 등락률(UN %) — 값은 줄에서 만집니다", () => onCell({ kind: "cellValue", field: "ratePct", ranges: [atLeast(5)] }))}
                        {item(close, "누적대금", "그 분까지의 세션 누적 거래대금(억)", () => onCell({ kind: "cellValue", field: "cumAmountEok", ranges: [atLeast(100)] }))}
                        {item(close, "분봉고가", "그 분 봉의 고가(UN %)", () => onCell({ kind: "cellValue", field: "minuteHighPct", ranges: [atLeast(5)] }))}
                        {item(close, "테마", "테마 존(대금·등락 상위 무리) 판정 — 분 단면을 굽는 비싼 재료입니다. 값은 팝오버에서", onTheme)}
                        {item(close, "전고 돌파", "직전 W 거래일 고가를 분봉 고가가 넘는 분(당일 제외)", () => onCell({ kind: "priorHighBreak", days: 20 }))}
                    </div>
                )}
            </HeaderPopover>
        </div>
    );
}
