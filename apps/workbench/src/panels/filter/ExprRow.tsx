// 가로 드릴다운 **줄** — 집합 편성 화면의 유일한 모양이다(2026-09-21).
// 규칙 전문은 `.claude/decisions.md` 「집합 편성 — 가로 드릴다운 줄」·「괄호는 손의 것」.
//
// ## 줄 하나 = 한 묶음의 내용
// 조건과 묶음이 **한 줄에 섞여** 가로로 선다. 칩을 누르면 그 내용이 **아랫줄**에 열리고, 열린 칩은
// 액센트 + 왼쪽 `▼` 를 단다. `▼` 는 "골랐다"가 아니라 **"펼쳐져 있다"** 를 말한다(트리의 펼침 삼각형).
// 다시 누르면 닫힌다 — 조건 칩도 묶음 칩도 같은 토글이다.
//
// ## 줄 쌓임 자체가 경로다 — 빵부스러기가 없다
// 옛 2층(위 지도 + 아래 편집면)은 항이 하나일 때 **같은 것을 두 번 그렸다**. 여기서는 위 줄의 열린
// 칩이 곧 아랫줄의 이름이라 그 중복이 원리적으로 없다.
//
// ## 좌클릭은 열고/바꾸고, 우클릭은 **구조를 손본다** (2026-09-22)
//   · 칩 좌클릭 = 아랫줄에 연다   · 칩 우클릭 = NOT · 끄기 · 빼기
//   · 연산자 좌클릭 = AND ↔ OR    · 연산자 우클릭 = **이 경계 괄호 안/밖**
//   · 괄호 우클릭 = NOT · 괄호 풀기
// 아랫줄은 **값만** 맡는다 — 같은 일이 두 자리에 있지 않게 종류로 가른다(옛 "편집면이 두 곳"과 다르다).
//
// ## 줄 높이는 모든 칸이 같다
// 칩마다 화살표 슬롯을 두면 화살표 없는 칩까지 위로 쏠려 줄이 비뚤어진다 — `▼` 는 칩 **안쪽 왼쪽**이다.
//
// ## 가로 스크롤은 줄마다 독립이다
// 한 줄이 길다고 다른 줄이 같이 밀리면 "자리가 곧 경로"라는 뜻이 깨진다.
import { useRef, useState, type MouseEvent } from "react";
import { useDismiss } from "../../ui/useDismiss.js";
import { FAIL, PIN, POINT_DEF } from "../../styles/palette.js";
import { renderExpr } from "./exprRender.js";
import { canSetOpAt, canToggleBoundary, groupAtBoundary, type Op, type SetExpr } from "./expr.js";

export interface RefChipInfo {
    name: string;
    named: boolean;
    broken: boolean;
    usedBy: number;
}

export interface RowHandlers {
    /** 조건 칩의 이름 — 한 곳에서 짓는다(두 곳이면 같은 조건이 두 이름으로 선다). */
    labelOf: (id: string) => string;
    refInfo: (setId: string) => RefChipInfo;
    /** 조건 칩 클릭 — 그 조건의 값 편집면을 **아랫줄에** 연다(다시 누르면 닫힌다). */
    onPickLeaf: (setId: string, leafId: string) => void;
    /**
     * 참조 칩 클릭 — 그 집합으로 내려간다(줄이 하나 더 쌓인다. 다시 누르면 닫힌다).
     * `rowSetId` 는 **누른 줄**, `targetSetId` 는 내려갈 집합이다 — 윗줄을 누르면 거기까지
     * 경로를 줄인 뒤 내려가야 해서 둘 다 필요하다.
     */
    onDrill: (rowSetId: string, targetSetId: string) => void;
    /** 연산자 바꾸기 — 괄호가 없으면 자동으로 박히고, 있으면 한 겹을 깨는 변경은 거절된다. */
    onSetOp: (setId: string, at: number, op: Op) => void;
    /** 이 경계를 괄호 안/밖으로 — 만들기·넓히기·자르기·풀기가 이 하나다. */
    onToggleBoundary: (setId: string, at: number) => void;
    /** 괄호 NOT 토글 — `at` 은 그 괄호 안의 아무 경계. */
    onNegateGroup: (setId: string, at: number) => void;
    /** 괄호 통째 풀기 — NOT 이 붙어 있으면 거절된다. */
    onUngroup: (setId: string, from: number) => void;
    /** 항 NOT 토글(조건·묶음 공통). */
    onNegateTerm: (setId: string, termId: string) => void;
    /** 조건 켜기/끄기 — 묶음에는 없다(꺼짐이라는 개념이 없다). */
    onToggleTerm: (setId: string, stageId: string) => void;
    /** 이 자리에서 빼기 — 묶음이면 집합 자체는 안 지워진다. */
    onRemoveTerm: (setId: string, termId: string) => void;
}

const ROW_H = 30;

/** 칩 공통 — 줄 높이를 안 흔드는 값들(패딩·줄바꿈 금지). */
const chipBase = {
    font: "inherit", fontSize: 11, padding: "3px 8px", borderRadius: 4,
    whiteSpace: "nowrap" as const, flexShrink: 0, cursor: "pointer", lineHeight: 1.35,
};

/** 열린 칩 — 액센트로 채우고 `▼` 를 단다. 이 줄의 **아랫줄이 곧 이 칩의 내용**이다. */
const openChip = { ...chipBase, background: POINT_DEF, color: "#fff", border: `1px solid ${POINT_DEF}` };

/** 우클릭으로 뜬 판 — 무엇을 눌렀나에 따라 항목이 갈린다. */
type Ctx =
    | { kind: "term"; termId: string; cond: boolean; enabled: boolean; neg: boolean; x: number; y: number }
    | { kind: "op"; at: number; x: number; y: number }
    | { kind: "paren"; from: number; neg: boolean; x: number; y: number };

export function ExprRow({ setId, expr, h, open, tail }: {
    setId: string;
    expr: SetExpr;
    h: RowHandlers;
    /** 이 줄에서 **펼쳐진** 항의 주소 — 아랫줄이 그 내용이다. 없으면 null. */
    open: string | null;
    /** 줄 끝 손잡이(＋ 조건·＋ 집합·＋ 묶음) — 줄마다 붙어 "어느 층에 더하는지"가 자리로 드러난다. */
    tail?: JSX.Element;
}): JSX.Element {
    const [menu, setMenu] = useState<{ at: number; x: number; y: number } | null>(null);
    const [ctx, setCtx] = useState<Ctx | null>(null);
    const pieces = renderExpr(expr, h.labelOf, (id) => h.refInfo(id).name);
    /** 우클릭 공통 — 브라우저 기본 메뉴를 막고 우리 판을 연다. */
    const rc = (make: (e: MouseEvent) => Ctx) => (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
        setCtx(make(e));
    };

    return (
        <div data-row={setId} style={{
            display: "flex", alignItems: "center", height: ROW_H, gap: 0,
            padding: "0 8px", overflowX: "auto", overflowY: "hidden",
            borderBottom: "0.5px solid var(--border-subtle)",
        }}>
            {pieces.length === 0 && (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                    조건 없음 — 제한이 없습니다
                </span>
            )}
            {pieces.map((p, i) => {
                if (p.kind === "open" || p.kind === "close") {
                    const from = p.at;
                    const neg = p.kind === "open" && p.neg;
                    return (
                        <span key={`p${i}`} data-paren={from}
                            onContextMenu={rc((e) => ({ kind: "paren", from, neg: groupAtBoundary(expr, from)?.neg === true, x: e.clientX, y: e.clientY }))}
                            title="괄호 — 우클릭으로 NOT 을 걸거나 풉니다"
                            style={{
                                fontSize: 14, padding: "0 2px", flexShrink: 0, cursor: "context-menu",
                                color: neg ? FAIL : "var(--text-secondary)",
                            }}>
                            {neg && <span style={{ fontSize: 10, fontWeight: 600, marginRight: 2 }}>NOT</span>}
                            {p.kind === "open" ? "(" : ")"}
                        </span>
                    );
                }
                if (p.kind === "op") {
                    return (
                        <button key={`o${p.at}`} data-op={p.at}
                            onClick={(e) => { setCtx(null); setMenu({ at: p.at, x: e.clientX, y: e.clientY }); }}
                            onContextMenu={rc((e) => ({ kind: "op", at: p.at, x: e.clientX, y: e.clientY }))}
                            title="연산자 — 눌러서 AND ↔ OR · 우클릭으로 이 자리를 괄호 안/밖으로"
                            style={{
                                font: "inherit", fontSize: 10, letterSpacing: "0.04em", padding: "0 7px",
                                border: "none", background: "transparent", cursor: "pointer", flexShrink: 0,
                                color: p.inGroup ? "var(--text-tertiary)" : "var(--text-secondary)",
                            }}>
                            {p.op === "and" ? "AND" : "OR"}
                        </button>
                    );
                }
                if (p.kind === "leaf") {
                    const isOpen = open === p.id;
                    return (
                        <button key={p.id} data-chip="leaf" onClick={() => h.onPickLeaf(setId, p.id)}
                            onContextMenu={rc((e) => ({ kind: "term", termId: p.id, cond: true, enabled: p.enabled, neg: p.neg, x: e.clientX, y: e.clientY }))}
                            title={`${p.label}${p.enabled ? "" : " (꺼짐)"} — 눌러서 아랫줄에서 값을 고칩니다. 우클릭 = NOT·끄기·빼기`}
                            style={{
                                ...(isOpen ? openChip : { ...chipBase, background: "var(--bg-tertiary)", border: "1px solid transparent" }),
                                ...(p.enabled ? {} : { textDecoration: "line-through", opacity: 0.65 }),
                            }}>
                            {isOpen && <span style={{ fontSize: 8, marginRight: 5, verticalAlign: 1 }}>▼</span>}
                            {p.neg && <span style={{ color: isOpen ? "#fff" : FAIL, fontWeight: 600, marginRight: 4 }}>NOT</span>}
                            {p.label}
                        </button>
                    );
                }
                const info = h.refInfo(p.setId);
                const isOpen = open === p.setId;
                return (
                    <button key={p.id} data-chip="ref" disabled={info.broken}
                        onClick={() => !info.broken && h.onDrill(setId, p.setId)}
                        onContextMenu={rc((e) => ({ kind: "term", termId: p.id, cond: false, enabled: true, neg: p.neg, x: e.clientX, y: e.clientY }))}
                        title={info.broken
                            ? "가리키는 집합이 지워졌습니다 — 우클릭으로 이 자리를 뺄 수 있습니다"
                            : `${info.name} — 눌러서 이 묶음의 내용을 아랫줄에 엽니다${info.usedBy >= 2 ? `. 쓰는 곳 ${info.usedBy} — 고치면 ${info.usedBy}곳이 같이 바뀝니다` : ""}`}
                        style={isOpen ? openChip : {
                            ...chipBase, background: "transparent",
                            // 손 이름 = 실선 · 자동 이름 = 점선(아직 생각이 안 굳었다는 뜻).
                            border: `1px ${info.named ? "solid" : "dashed"} ${info.broken ? FAIL : PIN}`,
                            color: info.broken ? FAIL : PIN,
                            cursor: info.broken ? "context-menu" : "pointer",
                        }}>
                        {isOpen && <span style={{ fontSize: 8, marginRight: 5, verticalAlign: 1 }}>▼</span>}
                        {p.neg && <span style={{ color: isOpen ? "#fff" : FAIL, fontWeight: 600, marginRight: 4 }}>NOT</span>}
                        {info.name}
                        {info.usedBy >= 2 && <span style={{ opacity: 0.7, marginLeft: 4 }}>·{info.usedBy}</span>}
                    </button>
                );
            })}
            {tail !== undefined && <span style={{ marginLeft: "auto", display: "flex", gap: 4, paddingLeft: 8, flexShrink: 0 }}>{tail}</span>}
            {menu !== null && (
                <Panel at={menu} onClose={() => setMenu(null)}>
                    {(["and", "or"] as const).map((op) => (
                        <Item key={op} label={op === "and" ? "AND — 모두 만족" : "OR — 하나라도"}
                            bold={expr.ops[menu.at] === op}
                            disabled={!canSetOpAt(expr, menu.at, op)}
                            why="괄호 안이나 밖이 섞입니다 — 괄호를 먼저 푸세요(한 겹이라 안쪽에 또 칠 자리가 없습니다)"
                            onPick={() => { h.onSetOp(setId, menu.at, op); setMenu(null); }} />
                    ))}
                </Panel>
            )}
            {ctx !== null && (
                <Panel at={ctx} onClose={() => setCtx(null)}>
                    {ctx.kind === "term" && (
                        <>
                            <Item label={ctx.neg ? "NOT 떼기" : "NOT — 이 항을 부정"}
                                onPick={() => { h.onNegateTerm(setId, ctx.termId); setCtx(null); }} />
                            {ctx.cond && (
                                <Item label={ctx.enabled ? "끄기 — 평가에서 뺀다" : "켜기"}
                                    onPick={() => { h.onToggleTerm(setId, ctx.termId); setCtx(null); }} />
                            )}
                            <Item label={ctx.cond ? "지우기" : "이 자리에서 빼기"}
                                onPick={() => { h.onRemoveTerm(setId, ctx.termId); setCtx(null); }} />
                        </>
                    )}
                    {ctx.kind === "op" && (
                        <Item label={groupAtBoundary(expr, ctx.at) === null ? "( ) 괄호로 묶기" : "이 자리에서 괄호 자르기"}
                            disabled={!canToggleBoundary(expr, ctx.at)}
                            why="NOT 이 붙은 괄호는 자를 수 없습니다(NOT 이 갈 곳이 없습니다) — NOT 을 먼저 떼세요"
                            onPick={() => { h.onToggleBoundary(setId, ctx.at); setCtx(null); }} />
                    )}
                    {ctx.kind === "paren" && (
                        <>
                            <Item label={ctx.neg ? "NOT 떼기" : "NOT — 이 괄호를 부정"}
                                onPick={() => { h.onNegateGroup(setId, ctx.from); setCtx(null); }} />
                            <Item label="괄호 풀기" disabled={ctx.neg}
                                why="NOT 이 걸려 있습니다 — 풀면 NOT 이 갈 곳이 없으니 먼저 떼세요"
                                onPick={() => { h.onUngroup(setId, ctx.from); setCtx(null); }} />
                        </>
                    )}
                </Panel>
            )}
        </div>
    );
}

/**
 * 떠 있는 판 하나 — 좌클릭 연산자 판과 우클릭 판이 **같은 껍데기**를 쓴다(해제 규칙이 갈리지 않게).
 * `position: fixed` 인 이유: 줄이 가로 스크롤 컨테이너라 안쪽 absolute 는 잘린다.
 */
function Panel({ at, onClose, children }: {
    at: { x: number; y: number };
    onClose: () => void;
    children: React.ReactNode;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, onClose);
    return (
        <div ref={ref} role="menu" style={{
            position: "fixed", left: at.x - 6, top: at.y + 8, zIndex: 60, minWidth: 186,
            background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6,
            boxShadow: "0 4px 14px rgba(0,0,0,0.12)", padding: "3px 0",
        }}>{children}</div>
    );
}

/**
 * 판의 한 줄. **못 누르는 항목은 숨기지 않고 회색 + 이유**로 세운다 — 결손 지도와 같은 규칙이다
 * (숨기면 "그런 기능이 없다"가 되어, 왜 안 되는지 알 길이 없다).
 */
function Item({ label, onPick, disabled = false, why, bold = false }: {
    label: string;
    onPick: () => void;
    disabled?: boolean;
    why?: string;
    bold?: boolean;
}): JSX.Element {
    return (
        <button role="menuitem" onClick={disabled ? undefined : onPick} disabled={disabled} title={disabled ? why : undefined}
            style={{
                display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
                font: "inherit", fontSize: 12, padding: "5px 10px", cursor: disabled ? "default" : "pointer",
                fontWeight: bold ? 600 : 400,
                color: disabled ? "var(--text-tertiary)" : "var(--text-primary)",
            }}>{label}</button>
    );
}
