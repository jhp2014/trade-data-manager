// Daily 타점 조건 - 격자 — 생성소 「돌파」 줄의 **편집면**(zigzag·밴드·이름표)이자 그 규칙의 **그림 도움말**.
// 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// 지금 포커스 종목·날짜의 분봉 위에 러닝 밴드(상단 실선·하단 점선)·기준선 밴드·사슬 구간·후보 ▼ 를
// 그린다 — 노브를 바꾸면 그림이 바로 바뀌어 "이 값이 무엇을 바꾸나"가 보인다.
//
// ## 연동 — pull · 1:1 · 영속(테마 조건판과 같은 맵)
// 연동 손잡이는 생성소 줄에 있다. 판은 **나를 가리키는 편집 집합의 돌파 행**을 역참조하고, 노브 쓰기는
// 그 행의 술어를 직접 고친다(사본 없음). ⚠ 역참조는 편집 집합 안에서만 한다 — 쓰기(`setFilterStagePredicates`)가
// 편집 집합에만 닿으므로, 밖의 행에 붙어 보이면 노브가 조용히 먹힌다. 미연동이면 기본 노브를 로컬로 그린다.
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BREAKOUT, minuteOfDayOf, minuteToHms, type CellPredicate } from "@trade-data-manager/market/domain";
import { PanelHeader } from "../../components/ControlChrome.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { useDock } from "../../store/dock.js";
import { selectEditingStages, useWorkbench } from "../../store/workbench.js";
import { CanvasLayers } from "../canvas/CanvasPainter.js";
import { BreakoutFields } from "../filter/CellPredicateFields.js";
import { useBoundSet } from "../filter/useBoundSet.js";
import { DAILY_GEN_PANEL_ID } from "../dailyGen/dailyPanelIds.js";
import { gridLayers, labelColor, viewRangeOf } from "./gridLayers.js";
import { useBreakoutView } from "./useBreakoutView.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;
const PAD = { left: 6, right: 6, top: 8, bottom: 8 };
const REGULAR = { from: 9 * 60, to: 15 * 60 + 30 };

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
    const knobs = linked?.pred ?? local;
    const transitioned = linked !== null && (linked.stage.transition !== undefined || linked.pred.transition !== undefined);
    const writeKnobs = (next: CellPredicate): void => {
        if (next.kind !== "breakout") return;
        if (linked) setPredicates(linked.stage.id, linked.stage.predicates.map((p) => (p.kind === "breakout" ? next : p)));
        else setLocal(next);
    };

    // 탭 제목 = 카탈로그 이름(복제 번호 포함) — 옛 배치 정규화 겸.
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    const view = useBreakoutView(code, date, knobs);
    const bound = useBoundSet(panelId);

    // ── 보는 구간 — 정규장(기본) / 전체.
    const [whole, setWhole] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => setSize({ w: es[0].contentRect.width, h: es[0].contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const box = { left: PAD.left, top: PAD.top, width: Math.max(0, size.w - PAD.left - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };

    const drawn = useMemo(() => {
        if (view.status !== "ready") return null;
        const s = view.stock;
        let from = 0;
        let to = s.times.length - 1;
        if (!whole) {
            const mins = s.times.map(minuteOfDayOf);
            const a = mins.findIndex((m) => m >= REGULAR.from);
            let b = -1;
            for (let i = mins.length - 1; i >= 0; i--) if (mins[i] <= REGULAR.to) { b = i; break; }
            if (a >= 0 && b >= a) { from = a; to = b; }
        }
        const range = viewRangeOf(s, from, to, view.res.baselinePct);
        if (!range) return null;
        return gridLayers(s, view.res, { from, to, ...range }, box);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, whole, box.width, box.height]);

    const shown = view.status === "ready"
        ? view.res.candidates.filter((c) => knobs.label === "all" || c.label === knobs.label)
        : [];

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
                <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    {(["정규장", "전체"] as const).map((t) => (
                        <button key={t} onClick={() => setWhole(t === "전체")}
                            style={{
                                fontSize: 10, padding: "0 6px", borderRadius: 8, cursor: "pointer", background: "transparent",
                                border: `1px solid ${(t === "전체") === whole ? "var(--accent-primary)" : "var(--border-default)"}`,
                                color: (t === "전체") === whole ? "var(--accent-primary)" : "var(--text-tertiary)",
                            }}>{t}</button>
                    ))}
                </span>
            </PanelHeader>

            {/* 노브 — 생성기는 zigzag·밴드 둘뿐, 이름표는 후보 거르기(구조 밖). */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
                <BreakoutFields p={knobs} onChange={writeKnobs} />
            </div>

            <div ref={boxRef} style={{ flex: 1, minHeight: 120, position: "relative" }}>
                {view.status === "loading" && <Center>불러오는 중…</Center>}
                {view.status === "empty" && <Center>{view.why}</Center>}
                {view.status === "ready" && drawn === null && <Center>그 구간에 거래가 없습니다</Center>}
                {drawn !== null && <CanvasLayers layers={drawn} width={size.w} height={size.h} clip={null} />}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", padding: "3px 10px", fontSize: 10.5, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                <span><span style={{ color: labelColor("high") }}>▼</span> 첫 사건 · <span style={{ color: labelColor("high") }}>▽</span> 연장(사슬 최대 대금 이상)</span>
                <span><span style={{ color: labelColor("high") }}>━ ┅</span> 고가 밴드 상단·하단</span>
                <span><span style={{ color: labelColor("baseline") }}>━ ┅</span> 기준선·기준선 밴드 하단 · 보라 = 기준선 돌파</span>
                <span>띠 = 한 사슬(zigzag 만큼 눌리면 끝)</span>
            </div>

            <div style={{ maxHeight: 150, overflowY: "auto", borderTop: "1px solid var(--border-default)", padding: "3px 10px 6px" }}>
                <div className="tabular" style={{ fontSize: 10.5, color: "var(--text-secondary)", marginBottom: 2 }}
                    title="생성기 = 이 돌파 줄 단독(이름표 거르기만) · 집합 = 생성소의 조건 전부를 통과한 수(작업 대상 목록)">
                    그날 생성기 {view.dayTotal !== null ? view.dayTotal.toLocaleString("ko-KR") : "…"}
                    {" · "}집합 {bound.day.isLoading ? "…" : bound.day.matched.toLocaleString("ko-KR")}
                    {view.status === "ready" && ` · 이 종목 ${shown.length}`}
                </div>
                {view.status === "ready" && shown.map((c) => {
                    const hms = minuteToHms(minuteOfDayOf(view.stock.times[c.i]));
                    return (
                        <button key={c.i} onClick={() => setTime(hms)} title="이 분으로 시각을 옮긴다"
                            className="tabular"
                            style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 11, padding: "1px 0", color: "var(--text-primary)" }}>
                            <span style={{ width: 40 }}>{hms.slice(0, 5)}</span>
                            <span style={{ width: 56, textAlign: "right" }}>{(c.tv / 1e8).toFixed(1)}억</span>
                            <span style={{ width: 70, color: "var(--text-tertiary)" }}>사슬 {c.chain + 1}{c.seq === 0 ? " · 첫" : ` · +${c.seq}`}</span>
                            <span style={{ color: labelColor(c.label) }}>{c.label === "baseline" ? "기준선 돌파" : "고가 돌파"}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 11.5, padding: 12, textAlign: "center" }}>
            {children}
        </div>
    );
}
