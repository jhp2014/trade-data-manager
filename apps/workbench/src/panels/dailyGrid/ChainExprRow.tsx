// 사슬 필터 **식 줄** — 조건판 줄(`ExprRow`)과 같은 문법·같은 손짓(2026-09-24):
//   · 칩 좌클릭 = 아랫줄에서 값·순번 고치기   · 칩 우클릭 = NOT · 지우기
//   · 연산자 좌클릭 = AND ↔ OR               · 연산자 우클릭 = 이 경계 괄호 안/밖
//   · 괄호 우클릭 = NOT · 순번 · 괄호 풀기     · 괄호 뒤 순번 꼬리표 클릭 = 같은 판
// 구조 규칙(한 겹 괄호·숨은 우선순위 없음·수식어 괄호)은 core `flatExpr` 한 벌이다 — 이 줄은 그리기와 손만.
// 항 종류가 달라(봉 조건) ExprRow 를 그대로 못 쓰고, 판 껍데기(Panel·Item·Sep)만 같은 것을 쓴다.
import { useState, type MouseEvent } from "react";
import {
    absorbChainGroup,
    canRemoveChainTerm,
    canSetOpAt,
    canToggleBoundary,
    groupAtBoundary,
    negateGroupAt,
    pruneFlat,
    removeGroupAt,
    setGroupFirstK,
    setOpAt,
    toggleBoundaryGroup,
    xorNeg,
    type ChainExpr,
    type ChainTerm,
    type Op,
} from "@trade-data-manager/market/domain";
import { FAIL } from "../../styles/palette.js";
import { NumField } from "../../components/NumField.js";
import { Item, Panel, Sep } from "../filter/ExprRow.js";
import { COND_HINT, condText, firstKText } from "./chainChecks.js";

const ROW_H = 30;
const chipBase = {
    font: "inherit", fontSize: 11, padding: "3px 8px", borderRadius: 4,
    whiteSpace: "nowrap" as const, flexShrink: 0, cursor: "pointer", lineHeight: 1.35,
};
const openChip = { ...chipBase, background: "var(--accent-primary)", color: "#fff", border: "1px solid var(--accent-primary)" };
const rankTag = {
    fontSize: 10, padding: "0 5px", borderRadius: 7, marginLeft: 5,
    background: "var(--accent-soft)", color: "var(--accent-primary)", fontWeight: 600,
} as const;

type Ctx =
    | { kind: "term"; id: string; neg: boolean; x: number; y: number }
    | { kind: "op"; at: number; x: number; y: number }
    | { kind: "opPick"; at: number; x: number; y: number }
    | { kind: "paren"; at: number; x: number; y: number };

export function ChainExprRow({ expr, open, onPick, onChange, tail }: {
    expr: ChainExpr;
    /** 아랫줄에 열린 항 id(없으면 null). */
    open: string | null;
    onPick: (id: string) => void;
    onChange: (next: ChainExpr) => void;
    tail?: JSX.Element;
}): JSX.Element {
    const [ctx, setCtx] = useState<Ctx | null>(null);
    const close = (): void => setCtx(null);
    const rc = (make: (e: MouseEvent) => Ctx) => (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCtx(make(e));
    };
    const commit = (next: ChainExpr): void => {
        if (next !== expr) onChange(next);
        close();
    };
    const opens = new Map(expr.groups.map((g) => [g.from, g] as const));
    const closes = new Map(expr.groups.map((g) => [g.to, g] as const));

    const pieces: JSX.Element[] = [];
    expr.of.forEach((t, i) => {
        if (i > 0) {
            const closed = closes.get(i - 1);
            if (closed) pieces.push(<Paren key={`paren-close-${i}`} side=")" g={closed} onCtx={rc((e) => ({ kind: "paren", at: closed.from, x: e.clientX, y: e.clientY }))} />);
            const at = i - 1;
            const inGroup = groupAtBoundary(expr, at) !== null;
            pieces.push(
                <button key={`op-${at}`} data-op={at}
                    onClick={(e) => setCtx({ kind: "opPick", at, x: e.clientX, y: e.clientY })}
                    onContextMenu={rc((e) => ({ kind: "op", at, x: e.clientX, y: e.clientY }))}
                    title="연산자 — 눌러서 AND ↔ OR · 우클릭으로 이 자리를 괄호 안/밖으로"
                    style={{
                        font: "inherit", fontSize: 10, letterSpacing: "0.04em", padding: "0 7px", border: "none",
                        background: "transparent", cursor: "pointer", flexShrink: 0,
                        color: inGroup ? "var(--text-tertiary)" : "var(--text-secondary)",
                    }}>
                    {expr.ops[at] === "or" ? "OR" : "AND"}
                </button>,
            );
        }
        const opened = opens.get(i);
        if (opened) pieces.push(<Paren key={`paren-open-${i}`} side="(" g={opened} onCtx={rc((e) => ({ kind: "paren", at: opened.from, x: e.clientX, y: e.clientY }))} />);
        const isOpen = open === t.id;
        pieces.push(
            <button key={`term-${t.id}`} data-chip={t.id} onClick={() => onPick(t.id)}
                onContextMenu={rc((e) => ({ kind: "term", id: t.id, neg: t.neg === true, x: e.clientX, y: e.clientY }))}
                title={`${COND_HINT[t.cond.kind]} — 눌러서 아랫줄에서 값·순번을 고칩니다. 우클릭 = NOT·지우기`}
                style={isOpen ? openChip : { ...chipBase, background: "var(--bg-tertiary)", border: "1px solid transparent", color: "var(--text-primary)" }}>
                {t.neg === true && <span style={{ color: isOpen ? "#fff" : FAIL, fontWeight: 600, marginRight: 4 }}>NOT</span>}
                {condText(t.cond)}
                {t.firstK !== undefined && <span style={isOpen ? { ...rankTag, background: "rgba(255,255,255,0.25)", color: "#fff" } : rankTag}>{firstKText(t.firstK)}</span>}
            </button>,
        );
    });
    const last = closes.get(expr.of.length - 1);
    if (last) pieces.push(<Paren key="paren-close-last" side=")" g={last} onCtx={rc((e) => ({ kind: "paren", at: last.from, x: e.clientX, y: e.clientY }))} />);

    const term = ctx?.kind === "term" ? expr.of.find((x) => x.id === ctx.id) ?? null : null;
    const paren = ctx?.kind === "paren" ? groupAtBoundary(expr, ctx.at) : null;

    return (
        <div style={{ display: "flex", alignItems: "center", minHeight: ROW_H, overflowX: "auto", overflowY: "hidden" }}>
            {pieces.length === 0 && (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}
                    title="사슬 봉 전부가 식을 통과합니다 — 아래 식 전체 순번만 걸립니다">조건 없음</span>
            )}
            {pieces}
            {tail !== undefined && <span style={{ marginLeft: 8, display: "flex", gap: 4, flexShrink: 0 }}>{tail}</span>}

            {ctx?.kind === "opPick" && (
                <Panel at={ctx} onClose={close}>
                    {(["and", "or"] as const).map((op: Op) => (
                        <Item key={op} label={op === "and" ? "AND" : "OR"} check={expr.ops[ctx.at] === op}
                            title={op === "and" ? "모두 만족" : "하나라도 만족"}
                            disabled={!canSetOpAt(expr, ctx.at, op)}
                            why="괄호 안이나 밖이 섞입니다 — 괄호를 먼저 푸세요(한 겹이라 안쪽에 또 칠 자리가 없습니다)"
                            onPick={() => commit(setOpAt(expr, ctx.at, op))} />
                    ))}
                </Panel>
            )}
            {ctx?.kind === "op" && (
                <Panel at={ctx} onClose={close}>
                    <Item label={groupAtBoundary(expr, ctx.at) === null ? "괄호 묶기" : "괄호 자르기"}
                        disabled={!canToggleBoundary(expr, ctx.at)}
                        title="이 자리를 괄호 안/밖으로 — 만들기·넓히기·자르기·풀기가 이 하나입니다"
                        why="NOT·순번이 붙은 괄호는 자를 수 없습니다(갈 곳이 없습니다) — 먼저 떼세요"
                        onPick={() => commit(toggleBoundaryGroup(expr, ctx.at))} />
                </Panel>
            )}
            {ctx?.kind === "term" && term !== null && (
                <Panel at={ctx} onClose={close}>
                    <Item label="NOT" check={term.neg === true} title="이 조건을 부정합니다(순번이 있으면 순번이 먼저, NOT 이 나중)"
                        onPick={() => commit({ ...expr, of: expr.of.map((x) => (x.id === term.id ? xorNeg(x, true) : x)) })} />
                    <Sep />
                    <Item label="지우기" danger title="이 조건을 없앱니다"
                        disabled={!canRemoveChainTerm(expr, term.id)}
                        why="순번 괄호에 NOT 조건 하나만 남게 됩니다 — 순번이 갈 곳이 없으니 괄호 순번을 먼저 떼세요"
                        onPick={() => commit(pruneFlat(expr, (x: ChainTerm) => x.id !== term.id, absorbChainGroup))} />
                </Panel>
            )}
            {ctx?.kind === "paren" && paren !== null && (
                <Panel at={ctx} onClose={close}>
                    <Item label="NOT" check={paren.neg === true} title="이 괄호를 부정합니다(순번이 있으면 순번이 먼저, NOT 이 나중)"
                        onPick={() => commit(negateGroupAt(expr, ctx.at))} />
                    <RankPick value={paren.firstK} onChange={(k) => { const next = setGroupFirstK(expr, ctx.at, k); if (next !== expr) onChange(next); }} />
                    <Sep />
                    <Item label="괄호 풀기" disabled={paren.neg === true || paren.firstK !== undefined}
                        why="NOT·순번이 걸려 있습니다 — 풀면 갈 곳이 없으니 먼저 떼세요"
                        onPick={() => commit(removeGroupAt(expr, paren.from))} />
                </Panel>
            )}
        </div>
    );
}

function Paren({ side, g, onCtx }: { side: "(" | ")"; g: { neg?: boolean; firstK?: number }; onCtx: (e: MouseEvent) => void }): JSX.Element {
    const neg = side === "(" && g.neg === true;
    return (
        <span onContextMenu={onCtx} onClick={side === ")" && g.firstK !== undefined ? onCtx : undefined}
            title="괄호 — 우클릭으로 NOT·순번을 걸거나 풉니다"
            style={{ fontSize: 14, padding: "0 2px", flexShrink: 0, cursor: "context-menu", color: g.neg === true ? FAIL : "var(--text-secondary)", display: "inline-flex", alignItems: "center" }}>
            {neg && <span style={{ fontSize: 10, fontWeight: 600, marginRight: 2 }}>NOT</span>}
            {side}
            {side === ")" && g.firstK !== undefined && <span style={{ ...rankTag, cursor: "pointer" }}>{firstKText(g.firstK)}</span>}
        </span>
    );
}

/** 순번 고르기 — 전부 / 처음 K. 칩 아랫줄·괄호 판·식 전체가 같은 모양. */
export function RankPick({ value, onChange, allLabel = "전부" }: {
    value: number | undefined;
    onChange: (k: number | undefined) => void;
    allLabel?: string;
}): JSX.Element {
    const seg = (on: boolean) => ({
        fontSize: 10.5, padding: "0 8px", border: "none", cursor: "pointer", lineHeight: "18px",
        background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent-primary)" : "var(--text-tertiary)",
    });
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", fontSize: 11 }}
            title="이 자리를 통과한 봉 중 사슬마다 처음 K개만(그 봉 이전 봉만 센다 — 미래를 안 본다)">
            <span style={{ color: "var(--text-secondary)" }}>순번</span>
            <span style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
                <button style={seg(value === undefined)} onClick={() => value !== undefined && onChange(undefined)}>{allLabel}</button>
                <button style={seg(value !== undefined)} onClick={() => value === undefined && onChange(1)}>처음</button>
            </span>
            {value !== undefined && (
                <NumField label="" suffix="개" value={value} min={1}
                    normalize={(v) => Math.min(999, Math.max(1, Math.round(v)))} onCommit={(v) => v !== value && onChange(v)} />
            )}
        </span>
    );
}
