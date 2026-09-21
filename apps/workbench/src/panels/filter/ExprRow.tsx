// 가로 드릴다운 **줄** — 집합 편성 화면의 유일한 모양이다(2026-09-21).
// 규칙 전문은 `.claude/decisions.md` 「집합 편성 — 가로 드릴다운 줄」.
//
// ## 줄 하나 = 한 묶음의 내용
// 조건과 묶음이 **한 줄에 섞여** 가로로 선다. 칩을 누르면 그 내용이 **아랫줄**에 열리고, 열린 칩은
// 액센트 + 왼쪽 `▼` 를 단다. `▼` 는 "골랐다"가 아니라 **"펼쳐져 있다"** 를 말한다(트리의 펼침 삼각형).
//
// ## 줄 쌓임 자체가 경로다 — 빵부스러기가 없다
// 옛 2층(위 지도 + 아래 편집면)은 항이 하나일 때 **같은 것을 두 번 그렸다**. 여기서는 위 줄의 열린
// 칩이 곧 아랫줄의 이름이라 그 중복이 원리적으로 없다.
//
// ## 줄 높이는 모든 칸이 같다
// 옛 시안은 칩마다 화살표 슬롯을 둬서, 화살표 없는 칩까지 위로 쏠려 줄이 비뚤어졌다. `▼` 를 칩
// **안쪽 왼쪽**에 넣으면 줄 높이가 안 변한다(실사용이 잡은 자리).
//
// ## 가로 스크롤은 줄마다 독립이다
// 한 줄이 길다고 다른 줄이 같이 밀리면 "자리가 곧 경로"라는 뜻이 깨진다.
import { useRef, useState } from "react";
import { useDismiss } from "../../ui/useDismiss.js";
import { FAIL, PIN, POINT_DEF } from "../../styles/palette.js";
import { renderExpr } from "./exprRender.js";
import type { Op, SetExpr } from "./expr.js";

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
    /** 조건 칩 클릭 — 그 조건의 값 편집면을 **아랫줄에** 연다. */
    onPickLeaf: (setId: string, leafId: string) => void;
    /**
     * 참조 칩 클릭 — 그 집합으로 내려간다(줄이 하나 더 쌓인다).
     * `rowSetId` 는 **누른 줄**, `targetSetId` 는 내려갈 집합이다 — 윗줄을 누르면 거기까지
     * 경로를 줄인 뒤 내려가야 해서 둘 다 필요하다.
     */
    onDrill: (rowSetId: string, targetSetId: string) => void;
    /** 연산자 바꾸기 — 그 자리를 **바깥**으로 삼아 괄호가 다시 쳐진다. */
    onSetOp: (setId: string, at: number, op: Op) => void;
    /** 이 자리를 **바깥으로** — 연산자는 그대로 두고 괄호만 뒤집는다. */
    onPromote: (setId: string, at: number) => void;
}

const ROW_H = 30;

/** 칩 공통 — 줄 높이를 안 흔드는 값들(패딩·줄바꿈 금지). */
const chipBase = {
    font: "inherit", fontSize: 11, padding: "3px 8px", borderRadius: 4,
    whiteSpace: "nowrap" as const, flexShrink: 0, cursor: "pointer", lineHeight: 1.35,
};

/** 열린 칩 — 액센트로 채우고 `▼` 를 단다. 이 줄의 **아랫줄이 곧 이 칩의 내용**이다. */
const openChip = { ...chipBase, background: POINT_DEF, color: "#fff", border: `1px solid ${POINT_DEF}` };

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
    const pieces = renderExpr(expr, h.labelOf, (id) => h.refInfo(id).name);

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
                    return (
                        <span key={`p${i}`} style={{ fontSize: 14, color: "var(--text-secondary)", padding: "0 2px", flexShrink: 0 }}>
                            {p.kind === "open" ? "(" : ")"}
                        </span>
                    );
                }
                if (p.kind === "op") {
                    return (
                        <button key={`o${p.at}`} data-op={p.at}
                            onClick={(e) => setMenu({ at: p.at, x: e.clientX, y: e.clientY })}
                            title="연산자 — 눌러서 AND ↔ OR 을 바꾸거나, 이 자리를 괄호 바깥으로 보냅니다"
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
                            title={`${p.label}${p.enabled ? "" : " (꺼짐)"} — 눌러서 아랫줄에서 값을 고칩니다`}
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
                        title={info.broken
                            ? "가리키는 집합이 지워졌습니다 — 아랫줄에서 이 자리를 뺄 수 있습니다"
                            : `${info.name} — 눌러서 이 묶음의 내용을 아랫줄에 엽니다${info.usedBy >= 2 ? `. 쓰는 곳 ${info.usedBy} — 고치면 ${info.usedBy}곳이 같이 바뀝니다` : ""}`}
                        style={isOpen ? openChip : {
                            ...chipBase, background: "transparent",
                            // 손 이름 = 실선 · 자동 이름 = 점선(아직 생각이 안 굳었다는 뜻).
                            border: `1px ${info.named ? "solid" : "dashed"} ${info.broken ? FAIL : PIN}`,
                            color: info.broken ? FAIL : PIN,
                            cursor: info.broken ? "default" : "pointer",
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
                <OpMenu at={menu} cur={expr.ops[menu.at] ?? "and"}
                    onPick={(op) => { h.onSetOp(setId, menu.at, op); setMenu(null); }}
                    onPromote={() => { h.onPromote(setId, menu.at); setMenu(null); }}
                    onClose={() => setMenu(null)} />
            )}
        </div>
    );
}

/**
 * 연산자 판 — 손잡이 셋이 한 자리에 모인다.
 *
 * ⚠ **드래그앤드롭은 기각**이다(2026-09-21): 놓기 전까지 "끼워넣기"인지 "묶기"인지 모르고(한 손짓에
 * 두 뜻), 줄이 가로 스크롤 컨테이너라 드래그가 스크롤과 다툰다. 이 레포는 레일 드래그와 칸 순서
 * 드래그를 이미 폐기했다. 연산자는 언제나 **제 양옆을 잇는 것**이라 대상이 원리적으로 모호하지 않다.
 */
function OpMenu({ at, cur, onPick, onPromote, onClose }: {
    at: { x: number; y: number };
    cur: Op;
    onPick: (op: Op) => void;
    onPromote: () => void;
    onClose: () => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, onClose);
    const row = {
        display: "block" as const, width: "100%", textAlign: "left" as const, border: "none",
        background: "transparent", cursor: "pointer", font: "inherit", fontSize: 12, padding: "5px 10px",
        color: "var(--text-primary)",
    };
    return (
        <div ref={ref} style={{
            position: "fixed", left: at.x - 6, top: at.y + 10, zIndex: 60, minWidth: 176,
            background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6,
            boxShadow: "0 4px 14px rgba(0,0,0,0.12)", padding: "3px 0",
        }}>
            {(["and", "or"] as const).map((op) => (
                <button key={op} style={{ ...row, fontWeight: cur === op ? 600 : 400 }} onClick={() => onPick(op)}>
                    {op === "and" ? "AND — 모두 만족" : "OR — 하나라도"}
                </button>
            ))}
            <div style={{ borderTop: "0.5px solid var(--border-subtle)", margin: "3px 0" }} />
            <button style={row} onClick={onPromote}
                title="괄호를 뒤집는다 — (a AND b) OR c ↔ a AND (b OR c). 연산자는 안 바뀐다.">
                이 자리를 바깥으로
            </button>
        </div>
    );
}
