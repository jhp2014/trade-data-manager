// 가로 드릴다운 **줄** — 집합 편성 화면의 유일한 모양이다(2026-09-21).
// 규칙 전문은 `.claude/decisions.md` 「집합 편성 — 가로 드릴다운 줄」·「괄호는 손의 것」.
//
// ## 줄 하나 = 한 묶음의 내용
// 조건과 묶음이 **한 줄에 섞여** 가로로 선다. 칩을 누르면 그 내용이 **아랫줄**에 열리고, 다시 누르면
// 닫힌다(조건도 묶음도 같은 토글).
//
// ## 열림은 **액센트 채움**, 종류는 `▼` (2026-09-22)
// 선택 색은 조건·묶음이 **같다** — 머리글의 모드 칩과 같은 액센트다. ⚠ 한때 옅은 채움
// (`--accent-soft`)을 썼는데 **미선택 칩(`--bg-tertiary`)과 명도가 거의 같아 안 보였다**(실사용).
// 선택은 눈에 띄어야 하는 상태라 옅게 둘 자리가 아니다.
// ⚠ **`▼` 는 묶음 전용**이다 — 뜻이 "층이 하나 늘었다" 하나여야 한다. 조건 열림은 펼쳐진 내용이
// 있는 게 아니라 **값을 고치는 중**이라 그 기호가 사실과 다르다.
// 채움이 짙어 테두리가 묻히므로, 묶음의 **자동 이름**만 안쪽 점선으로 계속 말한다(그 한 비트가
// "아직 생각이 안 굳음"이라 열렸을 때 특히 볼 값이 있다).
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
// 칩마다 화살표 슬롯을 두면 화살표 없는 칩까지 위로 쏠려 줄이 비뚤어진다 — `▼` 는 칩 **안쪽 왼쪽**이고
// 칩 자체의 높이는 열림/닫힘에 상관없이 같다.
//
// ## 가로 스크롤은 줄마다 독립이다
// 한 줄이 길다고 다른 줄이 같이 밀리면 "자리가 곧 경로"라는 뜻이 깨진다.
import { useRef, useState, type MouseEvent } from "react";
import { useDismiss } from "../../ui/useDismiss.js";
import { FAIL, PIN } from "../../styles/palette.js";
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
    /** 묶음 이름 짓기 — 빈 문자열이면 자동 이름으로 되돌린다. */
    onRenameSet: (setId: string, name: string) => void;
    /** **집합 자체**를 지운다 — 쓰는 곳이 있으면 그 참조들이 깨진다(빼기와 다른 일이다). */
    onDeleteSet: (setId: string) => void;
}

const ROW_H = 30;

/** 칩 공통 — 줄 높이를 안 흔드는 값들(패딩·줄바꿈 금지). */
const chipBase = {
    font: "inherit", fontSize: 11, padding: "3px 8px", borderRadius: 4,
    whiteSpace: "nowrap" as const, flexShrink: 0, cursor: "pointer", lineHeight: 1.35,
};

/** 열림의 **유일한 신호** — 액센트 채움. 조건이든 묶음이든 같다(종류는 `▼` 가 말한다). */
const openChip = {
    ...chipBase,
    background: "var(--accent-primary)", color: "#fff", border: "1px solid var(--accent-primary)",
};

/** 우클릭으로 뜬 판 — 무엇을 눌렀나에 따라 항목이 갈린다. */
type Ctx =
    | { kind: "cond"; termId: string; enabled: boolean; neg: boolean; x: number; y: number }
    /** 묶음 — 이름·쓰는 곳까지 들고 온다(판 머리가 그 **맥락**을 말한다). */
    | { kind: "group"; termId: string; setId: string; name: string; usedBy: number; neg: boolean; x: number; y: number }
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
    /** 「집합 지우기」 무장 — 쓰는 곳이 있을 때만 두 번 누르게 한다(쉴 때 경고가 자리를 안 먹게). */
    const [armed, setArmed] = useState(false);
    const openCtx = (c: Ctx): void => { setMenu(null); setArmed(false); setCtx(c); };
    const pieces = renderExpr(expr, h.labelOf, (id) => h.refInfo(id).name);
    /** 우클릭 공통 — 브라우저 기본 메뉴를 막고 우리 판을 연다. */
    const rc = (make: (e: MouseEvent) => Ctx) => (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openCtx(make(e));
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
                            onContextMenu={rc((e) => ({ kind: "cond", termId: p.id, enabled: p.enabled, neg: p.neg, x: e.clientX, y: e.clientY }))}
                            title={`${p.label}${p.enabled ? "" : " (꺼짐)"} — 눌러서 아랫줄에서 값을 고칩니다. 우클릭 = NOT·끄기·빼기`}
                            style={{
                                ...(isOpen ? openChip : { ...chipBase, background: "var(--bg-tertiary)", border: "1px solid transparent" }),
                                ...(p.enabled ? {} : { textDecoration: "line-through", opacity: 0.65 }),
                            }}>
                            {/* ⚠ 조건에는 `▼` 를 안 단다 — 펼쳐진 내용이 있는 게 아니라 값을 고치는 중이다.
                                `▼` 의 뜻은 **"층이 하나 늘었다"** 하나로 남는다(묶음 전용). */}
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
                        onContextMenu={rc((e) => ({ kind: "group", termId: p.id, setId: p.setId, name: info.name, usedBy: info.usedBy, neg: p.neg, x: e.clientX, y: e.clientY }))}
                        title={info.broken
                            ? "가리키는 집합이 지워졌습니다 — 우클릭으로 이 자리를 뺄 수 있습니다"
                            : `${info.name} — 눌러서 이 묶음의 내용을 아랫줄에 엽니다${info.usedBy >= 2 ? `. 쓰는 곳 ${info.usedBy} — 고치면 ${info.usedBy}곳이 같이 바뀝니다` : ""}`}
                        style={isOpen ? {
                            ...openChip,
                            // 채움이 짙어 테두리가 묻힌다 — **자동 이름만** 안쪽 점선으로 계속 말한다.
                            ...(info.named ? {} : { outline: "1px dashed rgba(255,255,255,0.85)", outlineOffset: "-3px" }),
                        } : {
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
                        <Item key={op} label={op === "and" ? "AND" : "OR"}
                            check={expr.ops[menu.at] === op}
                            title={op === "and" ? "모두 만족" : "하나라도 만족"}
                            disabled={!canSetOpAt(expr, menu.at, op)}
                            why="괄호 안이나 밖이 섞입니다 — 괄호를 먼저 푸세요(한 겹이라 안쪽에 또 칠 자리가 없습니다)"
                            onPick={() => { h.onSetOp(setId, menu.at, op); setMenu(null); }} />
                    ))}
                </Panel>
            )}
            {ctx !== null && (
                <Panel at={ctx} onClose={() => setCtx(null)}>
                    {ctx.kind === "cond" && (
                        <>
                            <Item label="NOT" check={ctx.neg} title="이 항을 부정합니다"
                                onPick={() => { h.onNegateTerm(setId, ctx.termId); setCtx(null); }} />
                            <Item label="끄기" check={!ctx.enabled} title="평가에서 뺍니다 — 지우지 않고 빼보는 손짓"
                                onPick={() => { h.onToggleTerm(setId, ctx.termId); setCtx(null); }} />
                            <Sep />
                            <Item label="지우기" danger title="이 조건을 없앱니다"
                                onPick={() => { h.onRemoveTerm(setId, ctx.termId); setCtx(null); }} />
                        </>
                    )}
                    {ctx.kind === "group" && (
                        <>
                            {/* 머리는 **맥락**이다(설명이 아니다) — 지우기 직전에 봐야 할 수가 여기 있다. */}
                            <div style={{
                                fontSize: 10, padding: "5px 10px", color: "var(--text-tertiary)",
                                borderBottom: "0.5px solid var(--border-subtle)", marginBottom: 3,
                            }}>{ctx.name} · 쓰는 곳 {ctx.usedBy}</div>
                            <NameInput value={ctx.name} onCommit={(v) => { h.onRenameSet(ctx.setId, v); setCtx(null); }} />
                            <Item label="NOT" check={ctx.neg} title="이 묶음을 부정합니다"
                                onPick={() => { h.onNegateTerm(setId, ctx.termId); setCtx(null); }} />
                            <Item label="빼기" title="이 식에서만 뺍니다 — 집합은 목록에 남습니다"
                                onPick={() => { h.onRemoveTerm(setId, ctx.termId); setCtx(null); }} />
                            <Sep />
                            {/* ⚠ **빼기와 다른 일이다** — 집합 자체가 없어져 쓰는 곳의 참조가 깨진다.
                                쓰는 곳 0 이면 청소라 한 번에, 1 이상이면 한 번 무장한다(사용자 확정). */}
                            <Item label={armed ? `정말 지우기 — ${ctx.usedBy}곳이 깨집니다` : "집합 지우기"}
                                danger armed={armed}
                                title="집합 자체를 없앱니다 — 이 식에서만 빼려면 「빼기」입니다"
                                onPick={() => {
                                    if (ctx.usedBy >= 1 && !armed) { setArmed(true); return; }
                                    h.onDeleteSet(ctx.setId);
                                    setCtx(null);
                                }} />
                        </>
                    )}
                    {ctx.kind === "op" && (
                        <Item label={groupAtBoundary(expr, ctx.at) === null ? "괄호 묶기" : "괄호 자르기"}
                            disabled={!canToggleBoundary(expr, ctx.at)}
                            title="이 자리를 괄호 안/밖으로 — 만들기·넓히기·자르기·풀기가 이 하나입니다"
                            why="NOT 이 붙은 괄호는 자를 수 없습니다(NOT 이 갈 곳이 없습니다) — NOT 을 먼저 떼세요"
                            onPick={() => { h.onToggleBoundary(setId, ctx.at); setCtx(null); }} />
                    )}
                    {ctx.kind === "paren" && (
                        <>
                            <Item label="NOT" check={ctx.neg} title="이 괄호를 부정합니다"
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
 * 판의 한 줄 — **이름만 적는다.** 왜 그런지는 `title` 이 말하고, 상태는 낱말이 아니라 **체크**가 말한다
 * (`NOT` ↔ `NOT 떼기` 로 낱말을 오가면 같은 자리가 매번 달라 보인다).
 *
 * ⚠ **못 누르는 항목은 숨기지 않고 회색 + 이유**로 세운다 — 결손 지도와 같은 규칙이다
 * (숨기면 "그런 기능이 없다"가 되어, 왜 안 되는지 알 길이 없다).
 */
function Item({ label, onPick, disabled = false, why, title, check = false, danger = false, armed = false }: {
    label: string;
    onPick: () => void;
    disabled?: boolean;
    /** 못 누를 때의 이유 — 툴팁으로만 뜬다. */
    why?: string;
    /** 평소 툴팁 — 항목 이름이 짧은 대신 설명이 여기 있다. */
    title?: string;
    /** 켜져 있나 — 토글 항목의 상태. */
    check?: boolean;
    danger?: boolean;
    /** 한 번 눌러 무장했나 — 되돌릴 수 없는 손이 그때만 경고를 입는다. */
    armed?: boolean;
}): JSX.Element {
    return (
        <button role="menuitem" onClick={disabled ? undefined : onPick} disabled={disabled}
            title={disabled ? why : title}
            style={{
                display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left",
                border: "none", font: "inherit", fontSize: 12, padding: "5px 10px",
                cursor: disabled ? "default" : "pointer",
                background: armed ? "var(--warning-soft)" : "transparent",
                color: disabled ? "var(--text-tertiary)" : armed || danger ? FAIL : "var(--text-primary)",
            }}>
            <span style={{ width: 10, flexShrink: 0, color: "var(--accent-primary)", fontSize: 11 }}>{check ? "✓" : ""}</span>
            {label}
        </button>
    );
}

/** 항목 사이 가름줄 — 되돌릴 수 없는 손을 나머지와 떼어 놓는 자리. */
const Sep = (): JSX.Element => <div style={{ borderTop: "0.5px solid var(--border-subtle)", margin: "3px 0" }} />;

/**
 * 묶음 이름 — 판 안에서 바로 고친다. **비우면 자동 이름으로 되돌아간다**(부재 = 점선 칩).
 * 이름 충돌 거절(손으로 지은 이름끼리만)은 스토어의 `renameSet` 이 이미 한다.
 */
function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }): JSX.Element {
    const [draft, setDraft] = useState(value);
    return (
        <input value={draft} placeholder="이름 (비우면 자동 이름)" aria-label="묶음 이름"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter") onCommit(draft.trim());
                if (e.key === "Escape") setDraft(value);
            }}
            style={{
                display: "block", margin: "2px 8px 5px", padding: "3px 6px", width: "calc(100% - 16px)",
                boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 4,
                background: "var(--bg-primary)", color: "var(--text-primary)", font: "inherit", fontSize: 12,
                outline: "none",
            }} />
    );
}
