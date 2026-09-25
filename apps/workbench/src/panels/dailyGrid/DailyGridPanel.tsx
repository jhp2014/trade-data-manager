// Daily 타점 조건 [격자] — 생성소 「돌파」 줄의 **편집면**. 두 층(2026-09-24):
//   ① 격자 정의 — 밴드·zigzag(하루 전체에서 서는 구조)
//   ② 사슬 필터 — 그 격자의 사슬 봉 위에 거는 식(생성소와 같은 문법: 칩 AND/OR · 한 겹 괄호 · NOT) +
//      칩·괄호·식 전체 순번(「처음 K개」 — 붙은 자리가 곧 뜻)
// **조건 설정만** 한다(2026-09-25) — 그림은 기본 분봉 차트의 사슬 층, 수는 생성소 머리글이 말한다(보는 곳 ≠ 고치는 곳).
// 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// ## 연동 — pull · 1:1 · 영속(테마 조건판과 같은 맵)
// 연동 손잡이는 생성소 줄에 있다. 판은 **나를 가리키는 편집 집합의 돌파 행**을 역참조하고, 쓰기는 그 행의 술어를
// 직접 고친다(사본 없음). ⚠ 역참조는 편집 집합 안에서만 한다 — 쓰기(`setFilterStagePredicates`)가 편집 집합에만
// 닿으므로, 밖의 행에 붙어 보이면 노브가 조용히 먹힌다.
// **값의 주인은 줄, 판은 창**이다(gridLink 머리 주석) — 비출 줄이 없으면 고칠 것도 없다. 미연동 판은 편집면을 안
// 세운다(옛 "로컬 기본 노브"는 새로고침에 사라지는 값을 만지게 해 보이는 것 ≠ 저장되는 것이었다).
import { useEffect, useMemo, useState } from "react";
import {
    BREAKOUT_BAND_MAX_PCT,
    BREAKOUT_ZIGZAG_MAX_PCT,
    BREAKOUT_ZIGZAG_MIN_PCT,
    CHAIN_COND_KINDS,
    DEFAULT_BREAKOUT,
    appendFlat,
    newChainTermId,
    type CellPredicate,
    type ChainExpr,
    type ChainTerm,
} from "@trade-data-manager/market/domain";
import { PanelHeader } from "../../components/ControlChrome.js";
import { NumField } from "../../components/NumField.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { useDock } from "../../store/dock.js";
import { allStagesOf, selectEditingStages, useWorkbench } from "../../store/workbench.js";
import { Item, Panel } from "../filter/ExprRow.js";
import { DAILY_GEN_PANEL_ID } from "../dailyGen/dailyPanelIds.js";
import { ChainCondEditor } from "./ChainCondEditor.js";
import { ChainExprRow, RankPick } from "./ChainExprRow.js";
import { COND_HINT, COND_NAME, defaultCond } from "./chainChecks.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;
const PLACEHOLDER: BreakoutPred = { kind: "breakout", ...DEFAULT_BREAKOUT };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function DailyGridPanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);

    // ── 연동 행 — 나를 가리키는 **편집 집합의** 돌파 행(고아·다른 종류·집합 밖은 미연동).
    const bindings = useWorkbench((s) => s.themeBindings);
    const stages = useWorkbench(selectEditingStages);
    const savedSets = useWorkbench((s) => s.savedSets);
    const boundStageId = useMemo(() => Object.entries(bindings).find(([, pid]) => pid === panelId)?.[0], [bindings, panelId]);
    const linked = useMemo(() => {
        if (boundStageId === undefined) return null;
        const st = stages.find((s) => s.id === boundStageId);
        const p = st?.predicates.find((x): x is BreakoutPred => x.kind === "breakout");
        return st && p ? { stage: st, pred: p } : null;
    }, [boundStageId, stages]);
    /** 연동된 줄이 **편집 집합 밖**(드릴인 중 윗집합 등)에 있나 — "연동 없음"과 다른 사실이라 따로 말한다. */
    const elsewhere = linked === null && boundStageId !== undefined
        && allStagesOf(savedSets).some((st) => st.id === boundStageId && st.predicates.some((p) => p.kind === "breakout"));
    // 미연동이면 편집면이 없다(아래) — pred 는 연동 줄의 것만 쓴다. 기본값은 훅 순서를 지키려는 자리채움이다.
    const pred = linked?.pred ?? PLACEHOLDER;
    const writePred = (next: BreakoutPred): void => {
        if (linked) setPredicates(linked.stage.id, linked.stage.predicates.map((p) => (p.kind === "breakout" ? next : p)));
    };
    const setExpr = (expr: ChainExpr): void => writePred({ ...pred, chain: { ...pred.chain, expr } });

    // 탭 제목 = 카탈로그 이름(복제 번호 포함) — 옛 배치 정규화 겸.
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    // 아랫줄에 열린 칩 — 지워졌으면 닫힌다.
    const [openId, setOpenId] = useState<string | null>(null);
    // 연동 행이 바뀌면 닫는다 — 다른 줄의 같은 id(옮겨 읽은 저장물은 m0·m1…)가 엉뚱하게 열리지 않게.
    const linkedStageId = linked?.stage.id ?? null;
    useEffect(() => setOpenId(null), [linkedStageId]);
    const openTerm = pred.chain.expr.of.find((t) => t.id === openId) ?? null;
    const [addAt, setAddAt] = useState<{ x: number; y: number } | null>(null);
    const addCond = (kind: ChainTerm["cond"]["kind"]): void => {
        const t: ChainTerm = { kind: "check", id: newChainTermId(), cond: defaultCond(kind) };
        setExpr(appendFlat(pred.chain.expr, t));
        setOpenId(t.id);
        setAddAt(null);
    };
    const hasInnerRank = pred.chain.expr.of.some((t) => t.firstK !== undefined) || pred.chain.expr.groups.some((g) => g.firstK !== undefined);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="4px 10px" style={{ whiteSpace: "nowrap" }}>
                {linked !== null || elsewhere ? (
                    <span style={{ fontSize: 10.5, color: "var(--accent-primary)", border: "1px solid var(--accent-primary)", background: "var(--accent-soft)", borderRadius: 8, padding: "0 6px" }}
                        title="생성소의 「돌파」 줄과 연동 중 — 여기서 만지는 값이 그 줄을 직접 고친다(사본 없음). 연동 변경·해제는 생성소 칩 우클릭">
                        ▣ 생성소 연동
                    </span>
                ) : (
                    <button onClick={() => openAndFocus(DAILY_GEN_PANEL_ID)}
                        style={{ fontSize: 10.5, color: "var(--warning)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        title="연동은 생성소의 「돌파」 칩에서 건다 — 클릭 = 생성소 열기">
                        ○ 연동 없음
                    </button>
                )}
            </PanelHeader>

            {linked === null ? (
                <div style={{ padding: "12px 10px", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                    {elsewhere
                        ? "이 판에 연동된 「돌파」 줄이 지금 편집 중인 집합 밖에 있습니다. 생성소에서 그 줄이 있는 집합으로 가면 여기서 고칩니다."
                        : "이 판을 쓰는 「돌파」 줄이 없습니다. 생성소에서 「돌파」 칩을 눌러 이 판을 연결하면 그 줄의 값이 여기 뜹니다."}
                </div>
            ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                <Layer n="1" title="격자 정의" hint="하루 전체에서 서는 구조 — 밴드에 닿으면 사건, 사슬 고점에서 zigzag 만큼 눌리면 사슬 끝">
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px", fontSize: 11 }}>
                        <NumField label="밴드" suffix="%" value={pred.bandPct} min={0}
                            title={`고가(와 기준선) 아래 이 폭 안에 닿으면 사건(0~${BREAKOUT_BAND_MAX_PCT}%)`}
                            normalize={(v) => clamp(v, 0, BREAKOUT_BAND_MAX_PCT)} onCommit={(v) => writePred({ ...pred, bandPct: v })} />
                        <NumField label="zigzag" suffix="%" value={pred.zigzagPct} min={BREAKOUT_ZIGZAG_MIN_PCT}
                            title={`사슬 끝 — 사슬 고점에서 이만큼 눌리면 끝(${BREAKOUT_ZIGZAG_MIN_PCT}~${BREAKOUT_ZIGZAG_MAX_PCT}%)`}
                            normalize={(v) => clamp(v, BREAKOUT_ZIGZAG_MIN_PCT, BREAKOUT_ZIGZAG_MAX_PCT)}
                            onCommit={(v) => writePred({ ...pred, zigzagPct: v })} />
                    </div>
                </Layer>

                <Layer n="2" title="사슬 필터" hint="격자 위 사슬 봉을 거르는 식 — 칩 좌클릭 = 값·순번, 우클릭 = NOT·지우기, 연산자 클릭 = AND/OR, 연산자 우클릭 = 괄호, 괄호 우클릭 = NOT·순번">
                    <ChainExprRow expr={pred.chain.expr} open={openTerm?.id ?? null}
                        onPick={(id) => setOpenId((cur) => (cur === id ? null : id))}
                        onChange={setExpr}
                        tail={
                            <button onClick={(e) => setAddAt({ x: e.clientX, y: e.clientY })} title="봉 조건 더하기 — 줄의 바깥 연산자로 이어 붙는다"
                                style={{ fontSize: 10.5, padding: "0 8px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px dashed var(--border-strong)", color: "var(--text-secondary)", lineHeight: "18px" }}>
                                ＋ 조건 ▾
                            </button>
                        } />
                    {openTerm !== null && (
                        <ChainCondEditor term={openTerm}
                            onChange={(next) => setExpr({ ...pred.chain.expr, of: pred.chain.expr.of.map((t) => (t.id === next.id ? next : t)) })} />
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, borderTop: "1px dashed var(--border-subtle)", marginTop: 6, paddingTop: 2 }}
                        title={hasInnerRank && pred.chain.firstK !== null
                            ? `식 전체도 ${pred.chain.firstK}개로 잘리는 중 — 칩·괄호마다 순번을 쓸 때는 보통 「전부」로 둔다`
                            : "위 식을 통과한 봉 중 사슬마다 처음 K개(기본 처음 1 — 사슬마다 첫 봉)"}>
                        <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>식 전체</span>
                        <RankPick value={pred.chain.firstK ?? undefined} onChange={(k) => { if ((k ?? null) !== pred.chain.firstK) writePred({ ...pred, chain: { ...pred.chain, firstK: k ?? null } }); }} />
                        {hasInnerRank && pred.chain.firstK !== null && <span style={{ fontSize: 10, color: "var(--warning)" }}>ⓘ</span>}
                    </div>
                </Layer>

            </div>
            )}

            {addAt !== null && (
                <Panel at={addAt} onClose={() => setAddAt(null)}>
                    {CHAIN_COND_KINDS.map((k) => (
                        <Item key={k} label={COND_NAME[k]} title={COND_HINT[k]} onPick={() => addCond(k)} />
                    ))}
                </Panel>
            )}
        </div>
    );
}

function Layer({ n, title, hint, children }: { n: string; title: string; hint: string; children: React.ReactNode }): JSX.Element {
    return (
        <section style={{ border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "6px 8px" }}>
            <div title={hint} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>
                <span style={{
                    display: "inline-flex", width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center",
                    fontSize: 10, background: "var(--accent-soft)", color: "var(--accent-primary)",
                }}>{n}</span>
                {title}
            </div>
            {children}
        </section>
    );
}
