// Daily 타점 조건 [격자] — 생성소 「돌파」 줄의 **편집면**. 두 층(2026-09-24):
//   ① 격자 정의 — 밴드·zigzag(하루 전체에서 서는 구조)
//   ② 사슬 필터 — 그 격자의 사슬 봉 위에 거는 식(생성소와 같은 문법: 칩 AND/OR · 한 겹 괄호 · NOT) +
//      칩·괄호·식 전체 순번(「처음 K개」 — 붙은 자리가 곧 뜻)
// 그림은 **기본 분봉 차트의 사슬 층**이 그린다(보는 곳 = 차트, 고치는 곳 = 여기). 수는 후보가 앞에 서고
// 사슬 수·사슬 봉 수는 부가 정보(hover)다. 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// ## 연동 — pull · 1:1 · 영속(테마 조건판과 같은 맵)
// 연동 손잡이는 생성소 줄에 있다. 판은 **나를 가리키는 편집 집합의 돌파 행**을 역참조하고, 쓰기는 그 행의 술어를
// 직접 고친다(사본 없음). ⚠ 역참조는 편집 집합 안에서만 한다 — 쓰기(`setFilterStagePredicates`)가 편집 집합에만
// 닿으므로, 밖의 행에 붙어 보이면 노브가 조용히 먹힌다. 미연동이면 기본 노브를 로컬로 쓴다.
import { useEffect, useMemo, useState } from "react";
import {
    BREAKOUT_BAND_MAX_PCT,
    BREAKOUT_ZIGZAG_MAX_PCT,
    BREAKOUT_ZIGZAG_MIN_PCT,
    CHAIN_COND_KINDS,
    DEFAULT_BREAKOUT,
    appendFlat,
    newChainTermId,
    minuteOfDayOf,
    minuteToHms,
    type CellPredicate,
    type ChainExpr,
    type ChainTerm,
} from "@trade-data-manager/market/domain";
import { PanelHeader } from "../../components/ControlChrome.js";
import { NumField } from "../../components/NumField.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { useDock } from "../../store/dock.js";
import { selectEditingStages, useWorkbench } from "../../store/workbench.js";
import { Item, Panel } from "../filter/ExprRow.js";
import { useBoundSet } from "../filter/useBoundSet.js";
import { DAILY_GEN_PANEL_ID } from "../dailyGen/dailyPanelIds.js";
import { BREAKOUT_BASE, BREAKOUT_HIGH } from "../../styles/palette.js";
import { ChainCondEditor } from "./ChainCondEditor.js";
import { ChainExprRow, RankPick } from "./ChainExprRow.js";
import { COND_HINT, COND_NAME, defaultCond } from "./chainChecks.js";
import { useBreakoutView } from "./useBreakoutView.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

const fmt = (v: number): string => v.toLocaleString("ko-KR");
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function DailyGridPanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const { nameOf } = useStockNamesDict();
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const setTime = useWorkbench((s) => s.setTime);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);

    // ── 연동 행 — 나를 가리키는 **편집 집합의** 돌파 행(고아·다른 종류·집합 밖은 미연동).
    const bindings = useWorkbench((s) => s.themeBindings);
    const stages = useWorkbench(selectEditingStages);
    const linked = useMemo(() => {
        const stageId = Object.entries(bindings).find(([, pid]) => pid === panelId)?.[0];
        if (stageId === undefined) return null;
        const st = stages.find((s) => s.id === stageId);
        const p = st?.predicates.find((x): x is BreakoutPred => x.kind === "breakout");
        return st && p ? { stage: st, pred: p } : null;
    }, [bindings, stages, panelId]);
    const [local, setLocal] = useState<BreakoutPred>({ kind: "breakout", ...DEFAULT_BREAKOUT });
    const pred = linked?.pred ?? local;
    const transitioned = linked !== null && (linked.stage.transition !== undefined || linked.pred.transition !== undefined);
    const writePred = (next: BreakoutPred): void => {
        if (linked) setPredicates(linked.stage.id, linked.stage.predicates.map((p) => (p.kind === "breakout" ? next : p)));
        else setLocal(next);
    };
    const setExpr = (expr: ChainExpr): void => writePred({ ...pred, chain: { ...pred.chain, expr } });

    // 탭 제목 = 카탈로그 이름(복제 번호 포함) — 옛 배치 정규화 겸.
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    const view = useBreakoutView(code, date, pred);
    const bound = useBoundSet(panelId);

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

    // 집합 수 — 생성소 머리글과 **같은 규칙**(모르는 동안·오류·어긋남·그물은 수가 아니다).
    const d = bound.day;
    const setCount = d.unsupported !== null ? "—" : d.error !== null ? "오류" : d.isLoading ? "…"
        : d.tooWide ? `${fmt(d.matched)}+ 너무 넓음` : fmt(d.matched);
    const ready = view.status === "ready" ? view : null;
    const picked = useMemo(() => (ready ? ready.verdicts.filter((v) => v.picked) : []), [ready]);
    const dayText = view.day === "error" ? "오류" : view.day === null ? "…" : fmt(view.day.picked);
    const layerTitle = [
        ready ? `이 종목 — 사슬 ${fmt(ready.counts.chains)} · 사슬 봉 ${fmt(ready.counts.bars)} → 후보 ${fmt(ready.counts.picked)}` : null,
        view.day !== null && view.day !== "error" ? `그날 — 사슬 ${fmt(view.day.chains)} · 사슬 봉 ${fmt(view.day.bars)} → 후보 ${fmt(view.day.picked)}` : null,
        "후보 = 이 돌파 줄 단독(사슬 필터까지) · 집합 = 생성소의 조건 전부를 통과한 수(작업 대상 목록)",
    ].filter(Boolean).join("\n");

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="4px 10px" style={{ whiteSpace: "nowrap" }}>
                {linked !== null ? (
                    <span style={{ fontSize: 10.5, color: "var(--accent-primary)", border: "1px solid var(--accent-primary)", background: "var(--accent-soft)", borderRadius: 8, padding: "0 6px" }}
                        title="연동 중 — 여기서 만지는 값이 생성소의 이 돌파 줄을 직접 고친다(사본 없음). 연동 변경·해제는 생성소 줄에서">
                        ▣ 연동
                    </span>
                ) : (
                    <button onClick={() => openAndFocus(DAILY_GEN_PANEL_ID)}
                        style={{ fontSize: 10.5, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        title="연동은 생성소의 「돌파」 줄에서 건다 — 미연동이면 값은 이 판에만 산다">
                        미연동 — 연동은 생성소 돌파 줄에서 ▸
                    </button>
                )}
                {transitioned && (
                    <span style={{ fontSize: 10, color: "var(--warning)" }} title="연동 행에 전이 수식어가 있다 — 후보 수는 전이 전이다">
                        전이 있음
                    </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 600 }}>{code ? nameOf(code) : "—"}</span>
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{date}</span>
            </PanelHeader>

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

                <div className="tabular" title={layerTitle}
                    style={{ display: "flex", alignItems: "baseline", gap: 10, borderTop: "1px solid var(--border-default)", paddingTop: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                        후보 <span style={{ color: "var(--accent-primary)" }}>{ready ? fmt(ready.counts.picked) : "—"}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-tertiary)" }}> 이 종목 · </span>
                        <span style={{ color: "var(--accent-primary)" }}>{dayText}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--text-tertiary)" }}> 그날</span>
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-tertiary)" }}>집합 {setCount} · ⓘ</span>
                </div>

                {view.status === "loading" && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>불러오는 중…</div>}
                {view.status === "empty" && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{view.why}</div>}
                {ready && picked.length === 0 && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>이 종목은 후보가 없습니다</div>}
                {ready && picked.length > 0 && (
                    <div>
                        {picked.map((v) => {
                            const hms = minuteToHms(minuteOfDayOf(ready.stock.times[v.bar.i]));
                            return (
                                <button key={v.bar.i} onClick={() => setTime(hms)} title="이 분으로 시각을 옮긴다 — 기본 차트에서 사슬과 함께 본다"
                                    className="tabular"
                                    style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 11, padding: "1px 0", color: "var(--text-primary)" }}>
                                    <span style={{ width: 40 }}>{hms.slice(0, 5)}</span>
                                    <span style={{ width: 56, textAlign: "right" }}>{(v.bar.tv / 1e8).toFixed(1)}억</span>
                                    <span style={{ width: 96, color: "var(--text-tertiary)" }}>사슬 {v.bar.chain + 1} · {v.bar.pos}봉째</span>
                                    <span style={{ color: v.bar.label === "baseline" ? BREAKOUT_BASE : BREAKOUT_HIGH }}>{v.bar.label === "baseline" ? "기준선 돌파" : "고가 돌파"}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

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
