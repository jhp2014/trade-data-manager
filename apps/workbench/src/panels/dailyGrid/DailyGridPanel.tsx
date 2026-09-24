// Daily 타점 조건 - 격자 — 생성소 「돌파」 줄의 **편집면**(①격자 밴드 · ②사슬 zigzag · ③사슬 필터)이자 그 규칙의
// **그림 도움말**. 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// 판은 층 배지 ①②③ 로 노브·수 줄·그림을 잇는다(A안): 노브 줄 → "그날 거래 봉 → 사슬·사슬 봉 → 후보" 수 →
// 하루 전체 차트(밴드 계단 = ①, 사슬 띠 = ②, ▼ + 레인 = ③). 차트는 **늘 하루 전체 캔들**이다 — 격자는 하루
// 전체에서 서므로 사슬만 떼어 보이면 "왜 여기서 사건인가"가 안 보인다. 좁혀 보기는 확대·이동으로 한다.
//
// ## 연동 — pull · 1:1 · 영속(테마 조건판과 같은 맵)
// 연동 손잡이는 생성소 줄에 있다. 판은 **나를 가리키는 편집 집합의 돌파 행**을 역참조하고, 노브 쓰기는
// 그 행의 술어를 직접 고친다(사본 없음). ⚠ 역참조는 편집 집합 안에서만 한다 — 쓰기(`setFilterStagePredicates`)가
// 편집 집합에만 닿으므로, 밖의 행에 붙어 보이면 노브가 조용히 먹힌다. 미연동이면 기본 노브를 로컬로 그린다.
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_BREAKOUT, activeChecksOf, minuteOfDayOf, minuteToHms, type CellPredicate } from "@trade-data-manager/market/domain";
import { PanelHeader } from "../../components/ControlChrome.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { useDock } from "../../store/dock.js";
import { selectEditingStages, useWorkbench } from "../../store/workbench.js";
import { useBoundSet } from "../filter/useBoundSet.js";
import { DAILY_GEN_PANEL_ID } from "../dailyGen/dailyPanelIds.js";
import { GridChart } from "./GridChart.js";
import { GridKnobs, LAYER } from "./GridKnobs.js";
import { labelColor, type GridSpan } from "./gridLayers.js";
import { useBreakoutView } from "./useBreakoutView.js";
import { chainSpanOf, initialSpan, wholeSpan } from "./viewport.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

const fmt = (v: number): string => v.toLocaleString("ko-KR");
/** "HH:MM:SS" → 자정기준 분. */
const minuteOfHms = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hmOf = (unix: number): string => minuteToHms(minuteOfDayOf(unix)).slice(0, 5);

export function DailyGridPanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const { nameOf } = useStockNamesDict();
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
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

    // 탭 제목 = 카탈로그 이름(복제 번호 포함) — 옛 배치 정규화 겸.
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    const view = useBreakoutView(code, date, pred);
    const bound = useBoundSet(panelId);
    // 메모 — 매 렌더 새 배열이면 차트 표시목록 메모가 렌더마다 깨진다.
    const checks = useMemo(() => activeChecksOf(pred.chain, pred.label), [pred.chain, pred.label]);

    const ready = view.status === "ready" ? view : null;
    const n = ready?.stock.times.length ?? 0;
    const focusIdx = useMemo(() => {
        if (!ready || !focusTime) return null;
        const m = minuteOfHms(focusTime);
        const i = ready.stock.times.findIndex((t) => minuteOfDayOf(t) === m);
        return i >= 0 ? i : null;
    }, [ready, focusTime]);

    // ── 보는 구간 — 종목·날짜마다 한 번 처음 화면(포커스 시각이 사슬 안이면 그 사슬, 아니면 하루 전체)을 잡고,
    //    그 뒤로는 손짓만 바꾼다(봉 클릭이 시각을 옮겨도 다시 확대하지 않는다).
    const viewKey = `${code}|${date}`;
    const [vp, setVp] = useState<{ key: string; span: GridSpan } | null>(null);
    useEffect(() => {
        if (!ready || vp?.key === viewKey) return;
        setVp({ key: viewKey, span: initialSpan(ready.res.chains, focusIdx, n) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready !== null, viewKey]);
    const span = vp?.key === viewKey ? vp.span : ready ? initialSpan(ready.res.chains, focusIdx, n) : wholeSpan(1);
    const setSpan = (sp: GridSpan): void => setVp({ key: viewKey, span: sp });

    // 집합 수 — 생성소 머리글과 **같은 규칙**(모르는 동안·오류·어긋남·그물은 수가 아니다).
    const d = bound.day;
    const setCount = d.unsupported !== null ? "—" : d.error !== null ? "오류" : d.isLoading ? "…"
        : d.tooWide ? `${fmt(d.matched)}+ 너무 넓음` : fmt(d.matched);
    const picked = useMemo(() => (ready ? ready.verdicts.filter((v) => v.picked) : []), [ready]);
    const perChain = useMemo(() => {
        const m = new Map<number, { bars: number; picked: number }>();
        for (const v of ready?.verdicts ?? []) {
            const e = m.get(v.bar.chain) ?? { bars: 0, picked: 0 };
            e.bars++;
            if (v.picked) e.picked++;
            m.set(v.bar.chain, e);
        }
        return m;
    }, [ready]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="4px 10px" style={{ whiteSpace: "nowrap" }}>
                {linked !== null ? (
                    <span style={{ fontSize: 10.5, color: "var(--accent-primary)", border: "1px solid var(--accent-primary)", background: "var(--accent-soft)", borderRadius: 8, padding: "0 6px" }}
                        title="연동 중 — 여기서 만지는 노브가 생성소의 이 돌파 줄을 직접 고친다(사본 없음). 연동 변경·해제는 생성소 줄에서">
                        ▣ 연동
                    </span>
                ) : (
                    <button onClick={() => openAndFocus(DAILY_GEN_PANEL_ID)}
                        style={{ fontSize: 10.5, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        title="연동은 생성소의 「돌파」 줄에서 건다 — 미연동이면 노브는 이 판에만 산다(그림 보기용)">
                        미연동 — 연동은 생성소 돌파 줄에서 ▸
                    </button>
                )}
                {transitioned && (
                    <span style={{ fontSize: 10, color: "var(--warning)" }} title="연동 행에 전이 수식어가 있다 — 그림의 ▼ 는 전이 전 후보다">
                        전이 있음 — 그림은 전이 전
                    </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 600 }}>{code ? nameOf(code) : "—"}</span>
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{date}</span>
            </PanelHeader>

            <GridKnobs p={pred} onChange={writePred} />

            {/* 층별 수 — 노브 줄과 같은 배지 번호. */}
            <div className="tabular" style={{ display: "flex", flexWrap: "wrap", gap: "1px 14px", padding: "3px 10px", fontSize: 10.5, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}
                title="생성기 수 = 이 돌파 줄 단독(사슬 필터까지) · 집합 = 생성소의 조건 전부를 통과한 수(작업 대상 목록)">
                {ready && (
                    <span data-testid="grid-stock-counts">
                        이 종목 {LAYER.grid} 거래 봉 {fmt(ready.tradingBars)} → {LAYER.chain} 사슬 {fmt(ready.res.chains.length)} · 사슬 봉 {fmt(ready.res.bars.length)}
                        {" → "}{LAYER.filter} <b style={{ color: "var(--text-primary)" }}>후보 {fmt(picked.length)}</b>
                    </span>
                )}
                <span data-testid="grid-day-counts">
                    그날 {view.day === "error" ? "생성기 오류" : view.day === null ? "…" : (
                        <>{LAYER.chain} 사슬 {fmt(view.day.chains)} · 사슬 봉 {fmt(view.day.bars)} → {LAYER.filter} <b style={{ color: "var(--text-primary)" }}>후보 {fmt(view.day.picked)}</b></>
                    )}
                    {" · "}집합 {setCount}
                </span>
            </div>

            {/* 사슬 칩 — 누르면 그 사슬로 확대. */}
            {ready && ready.res.chains.length > 0 && (
                <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
                    <Chip on={span.x0 <= 0 && span.x1 >= n} onClick={() => setSpan(wholeSpan(n))} title="하루 전체(더블클릭과 같다)">하루 전체</Chip>
                    {ready.res.chains.map((c, k) => {
                        const cs = chainSpanOf(c, n);
                        const on = Math.abs(cs.x0 - span.x0) < 0.5 && Math.abs(cs.x1 - span.x1) < 0.5;
                        const e = perChain.get(k) ?? { bars: 0, picked: 0 };
                        return (
                            <Chip key={k} on={on} onClick={() => setSpan(cs)} color={labelColor(c.baselineFrom !== null ? "baseline" : "high")}
                                title={`사슬 ${k + 1} — ${hmOf(ready.stock.times[c.start])}~${c.end !== null ? hmOf(ready.stock.times[c.end]) : "장 끝"} · 사슬 봉 ${e.bars} · 후보 ${e.picked} · 고점 ${c.high.toFixed(2)}%`}>
                                {k + 1} {hmOf(ready.stock.times[c.start])}{e.picked > 0 ? ` ▼${e.picked}` : ""}
                            </Chip>
                        );
                    })}
                </div>
            )}

            {view.status === "loading" && <Center>불러오는 중…</Center>}
            {view.status === "empty" && <Center>{view.why}</Center>}
            {ready && (
                <GridChart stock={ready.stock} res={ready.res} verdicts={ready.verdicts} checks={checks}
                    filter={pred.chain} label={pred.label} span={span} onSpan={setSpan} focusIdx={focusIdx}
                    onPickBar={(i) => setTime(minuteToHms(minuteOfDayOf(ready.stock.times[i])))} />
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", padding: "3px 10px", fontSize: 10.5, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                <span>{LAYER.grid} <span style={{ color: labelColor("high") }}>━ ┅</span> 고가 밴드 상단·하단 · <span style={{ color: labelColor("baseline") }}>━ ┅</span> 기준선·기준선 밴드 하단</span>
                <span>{LAYER.chain} 띠 = 한 사슬(보라 = 기준선 돌파 합류 뒤)</span>
                <span>{LAYER.filter} <span style={{ color: labelColor("high") }}>▼</span> 후보 · 흐린 ▽ = 봉 조건 통과·순번 밖 · 레인 초록 통과/빨강 탈락</span>
            </div>

            <div style={{ maxHeight: 110, overflowY: "auto", borderTop: "1px solid var(--border-default)", padding: "3px 10px 6px", flexShrink: 0 }}>
                {ready && picked.length === 0 && <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>이 종목은 후보가 없습니다</div>}
                {ready && picked.map((v) => {
                    const hms = minuteToHms(minuteOfDayOf(ready.stock.times[v.bar.i]));
                    return (
                        <button key={v.bar.i} onClick={() => setTime(hms)} title="이 분으로 시각을 옮긴다"
                            className="tabular"
                            style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 11, padding: "1px 0", color: "var(--text-primary)" }}>
                            <span style={{ width: 40 }}>{hms.slice(0, 5)}</span>
                            <span style={{ width: 56, textAlign: "right" }}>{(v.bar.tv / 1e8).toFixed(1)}억</span>
                            <span style={{ width: 96, color: "var(--text-tertiary)" }}>사슬 {v.bar.chain + 1} · {v.bar.pos}봉째</span>
                            <span style={{ color: labelColor(v.bar.label) }}>{v.bar.label === "baseline" ? "기준선 돌파" : "고가 돌파"}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Chip({ on, onClick, title, color, children }: { on: boolean; onClick: () => void; title: string; color?: string; children: React.ReactNode }): JSX.Element {
    return (
        <button onClick={onClick} title={title} className="tabular"
            style={{
                flexShrink: 0, fontSize: 10, padding: "0 6px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
                background: on ? "var(--accent-soft)" : "transparent",
                border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                color: on ? "var(--accent-primary)" : color ?? "var(--text-secondary)",
            }}>
            {children}
        </button>
    );
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 11.5, padding: 12, textAlign: "center" }}>
            {children}
        </div>
    );
}
