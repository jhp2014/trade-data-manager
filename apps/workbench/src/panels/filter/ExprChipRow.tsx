// 화면 2층의 **위층** — 지금 드릴다운 경로의 **뿌리 집합**을 한 줄 칩으로 그린다(2026-09-20).
//
// ## 위는 지도, 아래는 작업대
// 이 줄의 클릭은 **짚기/내려가기**뿐이다 — 값 편집·부정·끄기·삭제는 전부 아래 편집면에서 한다.
// 편집면이 두 곳이면 옛 "필터 UI 가 두 곳" 함정을 그대로 밟는다.
//
// ## 괄호가 없다
// 식이 1층이고 한 묶음 = 한 연산자라 괄호가 원리적으로 안 생긴다. 조각을 내는 곳은 `exprRender`
// 하나이고, 여기는 그 조각을 칠하기만 한다.
//
// ## 칩은 한 종류다
// 묶음·저장 집합·조건 모음이 한 물건이라 `∈` 같은 표기를 안 쓴다. 참조 칩과 조건 칩은 **테두리**로
// 갈린다(참조 = 보라 실선, 조건 = 배경만). 손 이름은 실선, 자동 이름은 **점선** — "아직 생각이 안
// 굳음 / 개념이 됨"을 화면이 계속 말한다.
import { PIN, FAIL } from "../../styles/palette.js";
import { renderExpr } from "./exprRender.js";
import type { SetExpr } from "./expr.js";

export interface ChipRowHandlers {
    /** 조건 칩 클릭 — 아래 목록에서 그 줄을 짚는다(편집은 거기서). */
    onPickLeaf: (id: string) => void;
    /** 참조 칩 클릭 — **그 집합으로 내려간다**(경로가 자란다). */
    onDrill: (setId: string) => void;
    /** 참조의 표시 재료 — 이름·손이름 여부·깨짐·쓰는 곳 수. */
    refInfo: (setId: string) => { name: string; named: boolean; broken: boolean; usedBy: number };
    /** 지금 짚은 항(아래 목록과 같은 주소) — 없으면 null. */
    pickedId: string | null;
}

/** 연산자 낱말 — 칩과 **다른 종류의 글자**라 경계가 또렷하다(기호는 칩 테두리에 묻힌다). */
const opWord = (op: "and" | "or"): string => (op === "and" ? "AND" : "OR");

export function ExprChipRow({ expr, labelOf, h }: {
    expr: SetExpr;
    labelOf: (id: string) => string;
    h: ChipRowHandlers;
}): JSX.Element {
    const pieces = renderExpr(expr, labelOf, (id) => h.refInfo(id).name);
    return (
        // ⚠ 한 줄에 못 박는다(nowrap + 가로 스크롤) — 줄바꿈하면 본문 높이가 튀어 아래 편집면이 밀린다.
        //   길어지면 묶음으로 접는 것이 이 모델의 답이다(칩 하나가 곧 한 층).
        <div style={{
            display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", overflowX: "auto",
            padding: "3px 2px 5px", minHeight: 24,
        }}>
            {pieces.length === 0 && (
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>조건 없음 — 제한이 없습니다</span>
            )}
            {pieces.map((p, i) => {
                if (p.kind === "op") {
                    return (
                        <span key={`op${i}`} style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--text-tertiary)", flexShrink: 0 }}>
                            {opWord(p.op)}
                        </span>
                    );
                }
                if (p.kind === "leaf") {
                    const picked = h.pickedId === p.id;
                    return (
                        <button key={p.id} data-chip="leaf" onClick={() => h.onPickLeaf(p.id)}
                            title={`${p.label}${p.enabled ? "" : " (꺼짐)"} — 아래 목록에서 이 줄을 짚습니다`}
                            style={{
                                font: "inherit", fontSize: 11, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
                                border: `1px solid ${picked ? "var(--accent-primary)" : "transparent"}`,
                                background: "var(--bg-tertiary)", whiteSpace: "nowrap", flexShrink: 0,
                                color: p.enabled ? "var(--text-primary)" : "var(--text-tertiary)",
                                textDecoration: p.enabled ? "none" : "line-through",
                            }}>
                            {p.neg && <span style={{ color: FAIL, fontWeight: 600, marginRight: 4 }}>NOT</span>}
                            {p.label}
                        </button>
                    );
                }
                const info = h.refInfo(p.setId);
                return (
                    <button key={p.id} data-chip="ref" onClick={() => !info.broken && h.onDrill(p.setId)} disabled={info.broken}
                        title={info.broken
                            ? "가리키는 집합이 지워졌습니다 — 아래 목록에서 이 자리를 뺄 수 있습니다"
                            : `${info.name} — 눌러서 이 집합으로 내려갑니다${info.usedBy >= 2 ? `. 쓰는 곳 ${info.usedBy} — 고치면 ${info.usedBy}곳이 같이 바뀝니다` : ""}`}
                        style={{
                            font: "inherit", fontSize: 11, padding: "2px 8px", borderRadius: 4,
                            cursor: info.broken ? "default" : "pointer", whiteSpace: "nowrap", flexShrink: 0,
                            // 손 이름 = 실선 · 자동 이름 = 점선(아직 생각이 안 굳었다는 뜻).
                            border: `1px ${info.named ? "solid" : "dashed"} ${info.broken ? FAIL : PIN}`,
                            background: "transparent", color: info.broken ? FAIL : PIN,
                        }}>
                        {p.neg && <span style={{ color: FAIL, fontWeight: 600, marginRight: 4 }}>NOT</span>}
                        {info.name}
                        {info.usedBy >= 2 && <span style={{ opacity: 0.7, marginLeft: 4 }}>·{info.usedBy}</span>}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * 빵부스러기 — 루트부터 지금까지. 한 칸을 누르면 거기로 되돌아간다.
 * ⚠ 층 이동의 유일한 손이다(아래 목록에서 "그 자리 펼치기"는 기각 — 결국 트리로 되돌아가는 길이다).
 */
export function EditBreadcrumb({ path, nameOf, onPop }: {
    path: readonly string[];
    nameOf: (setId: string) => string;
    onPop: (index: number) => void;
}): JSX.Element | null {
    if (path.length <= 1) return null;
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap", overflowX: "auto", padding: "0 2px 3px" }}>
            {path.map((id, i) => (
                <span key={id} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                    {i > 0 && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>›</span>}
                    <button data-chip="crumb" onClick={() => onPop(i)} disabled={i === path.length - 1}
                        title={i === path.length - 1 ? "지금 편집 중" : `${nameOf(id)} 으로 되돌아갑니다`}
                        style={{
                            font: "inherit", fontSize: 10.5, padding: "1px 5px", borderRadius: 3, border: "none",
                            background: "transparent", cursor: i === path.length - 1 ? "default" : "pointer",
                            color: i === path.length - 1 ? "var(--text-primary)" : "var(--text-tertiary)",
                            fontWeight: i === path.length - 1 ? 600 : 400, whiteSpace: "nowrap",
                        }}>{nameOf(id)}</button>
                </span>
            ))}
        </div>
    );
}
