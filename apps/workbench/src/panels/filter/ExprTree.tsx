// 식 트리의 화면 — **세로는 구조, 가로는 내용**(2026-09-19 사용자 확정 배치).
//
// 노드 하나의 해부: `[연산자 뱃지] + [자식들]`. 자식은 두 상태 중 하나로 그려진다.
//   · **펼침** — 자식이 세로로 선다(왼쪽 세로선이 형제임을 말한다).
//   · **인라인** — 자식이 한 줄로 흐른다(최소 괄호는 exprRender 한 곳이 친다).
//
// ## 연산자는 색이 아니라 **모양**으로 가른다
// teal 은 이미 POINT_DEF·AUTO_POINT·PRICE_LINE 이고 보라는 PIN·GUIDE 다. 구조선에 의미색을 더 쓰면
// 화면 전체에서 뜻이 흐려진다 — 그래서 **AND = 실선 · OR = 점선**이고 색은 `--border-default` 하나다.
// 글자 뱃지(AND/OR)가 이미 명시적이라 선은 보조면 충분하다.
//
// ## 접힘은 저장물이 아니라 **보기**다
// 어느 노드를 폈나는 `panelUi`(슬롯 낟알)에 산다 — 식과 함께 저장하면 같은 집합을 두 패널이 다르게
// 접을 수 없고, 저장물이 화면 사정으로 더러워진다.
import { useMemo } from "react";
import { FAIL, PIN } from "../../styles/palette.js";
import { renderExpr } from "./exprRender.js";
import { idOf, isGroup, type SetExpr } from "./expr.js";
import type { FilterStage } from "./stage.js";
import { iconBtn, textInput } from "./ui.js";
import { InlineRename } from "../../ui/InlineRename.js";

/** 처음 열었을 때 펴 두는 깊이 — 큰 식을 전부 펴면 화면을 넘는다(2026-09-19 확정: 깊이 2). */
export const DEFAULT_OPEN_DEPTH = 2;

export interface ExprTreeHandlers {
    /** 조건 줄 하나를 그린다 — 보드가 FilterRow 를 그대로 넘긴다(줄의 문법은 한 곳). */
    renderLeaf: (stage: FilterStage, no: number) => React.ReactNode;
    /** 잎의 한 줄 이름 — 인라인 표기가 쓴다. */
    labelOf: (id: string) => string;
    /** 짚은 노드 — 삽입 지점. null 이면 루트. */
    pickedId: string | null;
    onPick: (id: string) => void;
    /**
     * **기본값을 뒤집은** 노드 id 들 — 목록에 있으면 그 노드는 기본과 반대 상태다.
     * 기본을 저장하지 않는 이유: 식이 바뀌어 깊이가 달라져도 "깊이 2까지 펴기"가 계속 성립해야 하고,
     * 그러려면 저장물은 **예외만** 들어야 한다(전부 저장하면 새 노드가 늘 접힌 채 태어난다).
     */
    flippedIds: readonly string[];
    onToggleOpen: (id: string) => void;
    onToggleOperator: (id: string) => void;
    onNegate: (id: string) => void;
    onRemoveNode: (id: string) => void;
    /** 인라인 칩 클릭 — 그 조건의 편집면을 연다(줄 이름 클릭과 같은 자리로 간다). */
    onOpenLeaf: (id: string, e: React.MouseEvent) => void;
    /** 참조의 표시 재료 — 이름·깨짐·쓰는 곳 수. */
    refInfo: (setId: string) => { name: string; broken: boolean; usedBy: number };
    /** 참조 열기 = **편집 대상 전환**(그 집합을 깔때기로 연다). */
    onOpenRef: (setId: string) => void;
    /**
     * **이름 붙이기(승격)** — 지금 이름을 받는 중인 묶음 id(없으면 null)와 그 손잡이들.
     * 이름을 붙이면 그 묶음이 집합으로 떨어져 나가고 자리엔 참조가 남는다 — 중첩을 재사용 가능하게
     * 만드는 유일한 손짓이다.
     */
    promotingId: string | null;
    onPromoteStart: (id: string) => void;
    onPromoteCommit: (id: string, name: string) => void;
    onPromoteCancel: () => void;
}

export function ExprTree({ expr, handlers }: { expr: SetExpr; handlers: ExprTreeHandlers }): JSX.Element {
    // 잎 번호는 **표시 순서**로 매긴다(트리를 훑는 순서 = 화면 순서).
    const counter = useMemo(() => ({ n: 0 }), [expr]);
    counter.n = 0;
    return <Node e={expr} depth={0} counter={counter} h={handlers} />;
}

function Node({ e, depth, counter, h }: {
    e: SetExpr;
    depth: number;
    counter: { n: number };
    h: ExprTreeHandlers;
}): JSX.Element {
    if (e.kind === "cond") {
        counter.n += 1;
        return <>{h.renderLeaf(e.stage, counter.n)}</>;
    }
    // 참조는 **접힌 한 줄**이다 — 내용은 그 집합의 것이라 여기서 못 펴고 못 고친다(열어야 한다).
    if (e.kind === "ref") return <RefRow e={e} h={h} />;

    const id = idOf(e);
    const picked = h.pickedId === id;
    // 기본 깊이까지는 펴고 그 아래는 인라인. 뒤집은 목록에 있으면 그 반대(XOR).
    const open = h.flippedIds.includes(id) !== (depth < DEFAULT_OPEN_DEPTH);
    const dashed = e.kind === "or";

    return (
        <div style={{ padding: "1px 0" }}>
            <div
                onClick={(ev) => { ev.stopPropagation(); h.onPick(id); }}
                title={picked ? "짚은 묶음 — ＋ 조건이 여기에 붙습니다" : "클릭 = 이 묶음을 짚는다(＋ 조건의 삽입 지점)"}
                style={{
                    display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                    background: picked ? "var(--accent-soft)" : "transparent", borderRadius: 3, padding: "1px 3px",
                }}>
                <button onClick={(ev) => { ev.stopPropagation(); h.onToggleOpen(id); }}
                    title={open ? "한 줄로 접기" : "펴기"}
                    style={{ ...iconBtn, width: 12 }}>{open ? "▾" : "▸"}</button>
                <button onClick={(ev) => { ev.stopPropagation(); h.onToggleOperator(id); }}
                    title="AND ↔ OR — 자식이 셋 이상이면 뜻이 크게 바뀝니다(건수로 확인하세요)"
                    style={{
                        flexShrink: 0, font: "inherit", fontSize: 9.5, padding: "0 5px", borderRadius: 3, cursor: "pointer",
                        border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-secondary)",
                    }}>
                    {e.kind === "and" ? "AND" : "OR"}
                </button>
                {e.neg === true && (
                    <span title="이 묶음의 부정 — 결손은 되살아나지 않습니다(모름의 부정은 모름)"
                        style={{ fontSize: 10, color: FAIL }}>¬</span>
                )}
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>
                    {e.kind === "and" ? "모두" : "하나라도"} · {e.of.length}
                </span>
                {h.promotingId === id ? (
                    <span onClick={(ev) => ev.stopPropagation()} style={{ flex: 1, minWidth: 0 }}>
                        <InlineRename initial="" onCommit={(nm) => h.onPromoteCommit(id, nm)} onCancel={h.onPromoteCancel}
                            style={{ ...textInput, width: "100%", fontSize: 11, padding: "1px 5px" }} />
                    </span>
                ) : null}
                <span style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
                    {h.promotingId !== id && (
                        <button onClick={(ev) => { ev.stopPropagation(); h.onPromoteStart(id); }}
                            title="이름 붙이기 — 이 묶음이 집합으로 떨어져 나가고 자리엔 참조가 남습니다(재사용 가능)"
                            style={{ ...iconBtn, fontSize: 9.5, width: "auto", padding: "0 4px" }}>이름</button>
                    )}
                    <button onClick={(ev) => { ev.stopPropagation(); h.onNegate(id); }} title="이 묶음 부정(¬)" style={iconBtn}>¬</button>
                    <button onClick={(ev) => { ev.stopPropagation(); h.onRemoveNode(id); }} title="이 묶음 통째로 지우기" style={{ ...iconBtn, color: FAIL }}>✕</button>
                </span>
            </div>

            {open ? (
                <div style={{
                    marginLeft: 5, paddingLeft: 9,
                    borderLeft: `2px ${dashed ? "dashed" : "solid"} var(--border-default)`,
                }}>
                    {e.of.map((c) => <Node key={idOf(c)} e={c} depth={depth + 1} counter={counter} h={h} />)}
                </div>
            ) : (
                <InlineRow e={e} h={h} counter={counter} dashed={dashed} />
            )}
        </div>
    );
}

/**
 * 참조 줄 — `∈ 이름`. 클릭은 **그 집합 열기**(편집 대상 전환)지 이 자리 편집이 아니다.
 * 쓰는 곳이 둘 이상이면 뱃지로 알린다 — 고치면 그 전부가 따라 바뀐다는 사실을 손이 닿기 전에 말한다.
 */
function RefRow({ e, h }: { e: Extract<SetExpr, { kind: "ref" }>; h: ExprTreeHandlers }): JSX.Element {
    const info = h.refInfo(e.setId);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 3px", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ flexShrink: 0, fontSize: 11, color: PIN }}>∈</span>
            {e.neg === true && <span style={{ flexShrink: 0, fontSize: 11, color: FAIL }}>¬</span>}
            <button onClick={() => h.onOpenRef(e.setId)}
                title={info.broken
                    ? "지워진 집합입니다 — 이 가지는 결손으로 평가됩니다(빈 집합이 아닙니다)"
                    : `${info.name} — 클릭 = 이 집합 열기(편집 대상이 바뀝니다)`}
                style={{
                    minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    border: "none", background: "transparent", padding: 0, font: "inherit", cursor: "pointer",
                    fontSize: 12.5, fontWeight: 600, color: info.broken ? FAIL : "var(--text-primary)",
                }}>
                {info.broken ? "(지워진 집합)" : info.name}
            </button>
            {info.usedBy > 1 && (
                <span title={`이 집합을 쓰는 곳 ${info.usedBy} — 열어서 고치면 그 전부가 따라 바뀝니다`}
                    style={{ flexShrink: 0, fontSize: 9.5, color: "var(--warning)", border: "1px solid var(--warning)", borderRadius: 3, padding: "0 4px" }}>
                    쓰는 곳 {info.usedBy}
                </span>
            )}
            <span style={{ marginLeft: "auto", flexShrink: 0, display: "flex", gap: 4 }}>
                <button onClick={() => h.onNegate(idOf(e))} title={e.neg === true ? "부정 해제" : "이 참조 부정(¬)"}
                    style={{ ...iconBtn, color: e.neg === true ? FAIL : undefined }}>¬</button>
                <button onClick={() => h.onRemoveNode(idOf(e))} title="이 참조 지우기" style={{ ...iconBtn, color: FAIL }}>✕</button>
            </span>
        </div>
    );
}

/** 인라인 한 줄 — 최소 괄호는 `exprRender` 가 친다(표기의 유일한 출처). */
function InlineRow({ e, h, counter, dashed }: {
    e: SetExpr;
    h: ExprTreeHandlers;
    counter: { n: number };
    dashed: boolean;
}): JSX.Element {
    const pieces = renderExpr(e, h.labelOf, (setId) => h.refInfo(setId).name);
    // 인라인이어도 잎 번호는 계속 매긴다 — 펴고 접는다고 번호가 흔들리면 "3번 조건"이 뜻을 잃는다.
    counter.n += pieces.filter((p) => p.kind === "leaf").length;
    return (
        <div style={{
            marginLeft: 5, paddingLeft: 9, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4,
            borderLeft: `2px ${dashed ? "dashed" : "solid"} var(--border-default)`, padding: "3px 0 3px 9px",
        }}>
            {pieces.map((p, i) => {
                if (p.kind === "op") {
                    return <span key={i} style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{p.op === "and" ? "∧" : "∨"}</span>;
                }
                if (p.kind === "paren") {
                    return <span key={i} style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.open ? "(" : ")"}</span>;
                }
                if (p.kind === "neg") return <span key={i} style={{ fontSize: 10, color: FAIL }}>¬</span>;
                if (p.kind === "ref") {
                    return (
                        <button key={i} onClick={() => h.onOpenRef(p.setId)}
                            title={`${p.label} — 클릭 = 이 집합 열기(편집 대상이 바뀝니다)`}
                            style={{
                                font: "inherit", fontSize: 11, padding: "1px 6px", borderRadius: 4, cursor: "pointer",
                                border: `0.5px solid ${PIN}`, background: "var(--bg-secondary)", color: PIN,
                                maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                            {p.neg ? "¬ " : ""}∈ {p.label}
                        </button>
                    );
                }
                return (
                    <button key={i} onClick={(ev) => h.onOpenLeaf(p.id, ev)}
                        title={`${p.label} — 클릭 = 이 조건의 편집면으로`}
                        style={{
                            font: "inherit", fontSize: 11, padding: "1px 6px", borderRadius: 4, cursor: "pointer",
                            border: `0.5px solid ${p.neg ? FAIL : "var(--border-default)"}`,
                            background: "var(--bg-secondary)",
                            color: p.neg ? FAIL : "var(--text-primary)",
                            opacity: p.enabled ? 1 : 0.4,
                            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                        {p.neg ? "¬ " : ""}{p.label}
                    </button>
                );
            })}
        </div>
    );
}

/** 묶음 노드인가 — 보드가 "짚은 노드가 아직 있나"를 물을 때 쓴다. */
export const isGroupNode = isGroup;
