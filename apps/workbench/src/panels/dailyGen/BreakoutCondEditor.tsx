// 돌파 술어의 **편집면** — 조건판 돌파 줄에서 여는 팝오버(2026-09-26, 옛 격자판·연동 모델 폐지).
// 값은 술어 payload 에 산다 — 줄에서 열리므로 "어느 행을 비추나" 주소 문제가 없다(테마 팝오버와 같은 문법).
// 두 층은 옛 격자판 그대로: ① 격자 정의(밴드·zigzag) → ② 사슬 필터(식 줄 + 칩 아랫줄 편집 + 식 전체 순번).
// ⚠ 「＋ 조건」 판은 **팝오버 DOM 안**에 둔다 — useDismiss 가 ref.contains 로 안/밖을 가르므로, 밖(형제)에
//   두면 판 항목의 mousedown 이 팝오버를 먼저 닫아 클릭이 사라진다. 호출부는 key={stageId} 로 세운다 —
//   열린 칩 상태가 다른 줄의 같은 id(옮겨 읽은 저장물 m0·m1…)로 새지 않게.
import { useRef, useState } from "react";
import {
    BREAKOUT_BAND_MAX_PCT,
    BREAKOUT_ZIGZAG_MAX_PCT,
    BREAKOUT_ZIGZAG_MIN_PCT,
    CHAIN_COND_KINDS,
    appendFlat,
    newChainTermId,
    type CellPredicate,
    type ChainExpr,
    type ChainTerm,
} from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import { useDismiss } from "../../ui/useDismiss.js";
import { Item, Panel } from "../filter/ExprRow.js";
import { ChainCondEditor } from "../breakout/ChainCondEditor.js";
import { ChainExprRow, RankPick } from "../breakout/ChainExprRow.js";
import { COND_HINT, COND_NAME, defaultCond } from "../breakout/chainChecks.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function BreakoutCondEditor({ at, pred, onWrite, onClose }: {
    at: { x: number; y: number };
    pred: BreakoutPred;
    onWrite: (next: BreakoutPred) => void;
    onClose: () => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, onClose, true);
    const setExpr = (expr: ChainExpr): void => onWrite({ ...pred, chain: { ...pred.chain, expr } });

    // 아랫줄에 열린 칩 — 지워졌으면 닫힌다(수명은 팝오버와 같다 — 호출부의 key={stageId}).
    const [openId, setOpenId] = useState<string | null>(null);
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
        <div ref={ref} role="dialog" style={{
            position: "fixed", top: Math.min(at.y + 6, window.innerHeight - 320), left: Math.min(at.x - 6, window.innerWidth - 420),
            zIndex: 300, width: 400, maxHeight: Math.max(240, window.innerHeight - 60), overflowY: "auto",
            background: "var(--bg-primary)", border: "1px solid var(--border-default)",
            borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", padding: "8px 12px 10px",
            display: "flex", flexDirection: "column", gap: 8, fontSize: 12,
        }}>
            <Layer n="1" title="격자 정의" hint="하루 전체에서 서는 구조 — 밴드에 닿으면 사건, 사슬 고점에서 zigzag 만큼 눌리면 사슬 끝">
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px", fontSize: 11 }}>
                    <NumField label="밴드" suffix="%" value={pred.bandPct} min={0}
                        title={`고가(와 기준선) 아래 이 폭 안에 닿으면 사건(0~${BREAKOUT_BAND_MAX_PCT}%)`}
                        normalize={(v) => clamp(v, 0, BREAKOUT_BAND_MAX_PCT)} onCommit={(v) => onWrite({ ...pred, bandPct: v })} />
                    <NumField label="zigzag" suffix="%" value={pred.zigzagPct} min={BREAKOUT_ZIGZAG_MIN_PCT}
                        title={`사슬 끝 — 사슬 고점에서 이만큼 눌리면 끝(${BREAKOUT_ZIGZAG_MIN_PCT}~${BREAKOUT_ZIGZAG_MAX_PCT}%)`}
                        normalize={(v) => clamp(v, BREAKOUT_ZIGZAG_MIN_PCT, BREAKOUT_ZIGZAG_MAX_PCT)}
                        onCommit={(v) => onWrite({ ...pred, zigzagPct: v })} />
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
                    <RankPick value={pred.chain.firstK ?? undefined} onChange={(k) => { if ((k ?? null) !== pred.chain.firstK) onWrite({ ...pred, chain: { ...pred.chain, firstK: k ?? null } }); }} />
                    {hasInnerRank && pred.chain.firstK !== null && <span style={{ fontSize: 10, color: "var(--warning)" }}>ⓘ</span>}
                </div>
            </Layer>

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
