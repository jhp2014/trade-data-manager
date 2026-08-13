// 필터 한 줄 — 여기서 **조건을 고치지는 않는다**: 이름을 누르면 보드의 그 줄로 데려간다.
// 편집 입구가 목록과 보드 두 곳이면 같은 조건을 두 문법으로 만지게 된다.
//
// 세 줄로 나눈 이유: 조건이 무엇인가(위) · 얼마나 걸렀나(막대) · 그래서 무슨 일을 했나(아래)는
// 읽는 시점이 다르다. 한 줄에 몰면 조건 이름이 수치와 폭을 다투다 잘리고, 무엇보다 **잡는 손잡이가
// 안 보인다** — 순서 바꾸기는 이 목록의 주된 손짓인데(순서가 "어느 필터가 무엇을 죽였나"를 정한다)
// 손잡이가 작은 글씨 사이에 끼면 있는 줄도 모른다.
//
// ⚠ **막대 길이가 전부 같다.** 순차 깔때기처럼 짧아지게 그리면 그림이 "앞에서 걸러낸 뒤 남은 것만
// 평가한다"고 말하는데 모델은 그 반대다(전체 유니버스 독립 평가). 좁혀지는 느낌은 생존 칸이 줄어드는 것.
import type { FunnelCell, StageTally } from "@trade-data-manager/market/domain";
import { FAIL } from "../../styles/palette.js";
import { CELLS } from "./cells.js";
import { kindLabel } from "./label.js";
import { isPredicateEmpty, stageKind, type FilterStage } from "./stage.js";
import { iconBtn } from "./ui.js";

/**
 * 0 이 아닌 칸의 최소 폭(px). 5119건 중 3건은 0.06% 라 정직하게 그리면 **누를 수가 없다**.
 * 대가: 엄밀한 비례가 아니게 된다 — 이 막대의 일은 비율 재기가 아니라 칸을 눌러 보게 하는 것이고,
 * 정확한 수는 칸 안 숫자·툴팁·목록에 있다. 칸이 최대 다섯이라 왜곡 상한도 5×MIN_SEG.
 */
const MIN_SEG = 16;

export const STAGE_DND = "application/x-funnel-stage";

export function FilterRow({
    no, stage, tally, universe, label, dead, pickedCells, dragging, dropTarget,
    onPick, onPickPass, onReveal, onToggle, onRemove, onDragStart, onDragEnd, onDragOver, onDropOn,
}: {
    no: number;
    stage: FilterStage;
    /** 평가에 안 들어간 필터(조건이 비었거나 꺼짐)는 null — 줄은 남고 막대만 없다. */
    tally: StageTally | null;
    universe: number;
    label: string;
    dead: boolean;
    pickedCells: FunnelCell[];
    dragging: boolean;
    /** 지금 끌고 있는 필터가 여기 놓인다 — 놓일 자리를 선으로 보여준다. */
    dropTarget: boolean;
    onPick: (cell: FunnelCell) => void;
    onPickPass: () => void;
    /** 이름 클릭 — 보드의 그 줄로. */
    onReveal: () => void;
    onToggle: () => void;
    onRemove: () => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    onDragOver: () => void;
    onDropOn: () => void;
}): JSX.Element {
    // 장식 판정 — 새로 죽인 게 없으면 이 필터는 겉보기 탈락이 아무리 커도 아무 일도 안 한 것이다.
    const decorative = tally !== null && tally.newlyKilled === 0;
    const empty = stage.predicates.every(isPredicateEmpty);

    return (
        <div
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(STAGE_DND, stage.id); e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
            onDragEnd={onDragEnd}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(STAGE_DND)) { e.preventDefault(); onDragOver(); } }}
            onDrop={(e) => { e.preventDefault(); onDropOn(); }}
            style={{
                padding: "3px 6px 5px", cursor: "grab",
                borderTop: `2px solid ${dropTarget ? "var(--accent-primary)" : "transparent"}`,
                // ⚠ 흐리게는 **꺼짐**의 표기다. 예전엔 "장식"(새로 죽인 게 없음)도 흐리게 했는데, 그러면
                // 상류가 이미 다 걸러낸 하류 필터들이 통째로 비활성처럼 보인다 — 걔들은 멀쩡히 켜져 있다.
                // 기여가 없다는 말은 아래 "장식" 표로 한다(글자로 말할 것을 밝기로 말하지 않는다).
                opacity: dragging || !stage.enabled ? 0.4 : 1,
            }}
        >
            {/* 1줄 — 무슨 조건인가. 손잡이가 여기 있어야 눈에 띈다. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, paddingBottom: 3 }}>
                <span title="끌어서 순서 바꾸기(같은 층위 안) — 순서는 결과가 아니라 '어느 필터가 무엇을 죽였나'를 정한다"
                    style={{ flexShrink: 0, fontSize: 14, lineHeight: 1, color: "var(--text-tertiary)", cursor: "grab" }}>⠿</span>
                <span style={{ flexShrink: 0, fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{no}</span>
                <button onClick={onReveal} title={`${label} — 클릭 = 보드에서 이 조건 보기`}
                    style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "none", background: "transparent", padding: 0, font: "inherit", cursor: "pointer", fontSize: 13, fontWeight: 600, color: dead ? FAIL : "var(--text-primary)", textAlign: "left" }}>
                    {label}
                </button>
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>{kindLabel(stageKind(stage))}</span>
                <span style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 2 }}>
                    {/* 끄기는 지우기와 다르다 — 잠깐 빼보는 게 한계 기여도를 눈으로 확인하는 손짓이다. */}
                    <button onClick={onToggle} title={stage.enabled ? "이 필터 끄기(빼고 보기)" : "다시 켜기"} style={iconBtn}>{stage.enabled ? "◉" : "○"}</button>
                    <button onClick={onRemove} title="이 필터 지우기" style={{ ...iconBtn, color: FAIL }}>✕</button>
                </span>
            </div>

            {/* 2줄 — 막대. ⚠ 길이는 언제나 유니버스 전체(필터가 늘어도 짧아지지 않는다). */}
            <div style={{ display: "flex", height: 20, borderRadius: 3, overflow: "hidden", background: "var(--bg-secondary)" }}>
                {tally === null ? (
                    <span style={{ display: "flex", alignItems: "center", padding: "0 7px", fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        {empty ? "조건을 거세요" : "꺼짐"}
                    </span>
                ) : CELLS.map(({ cell, label: cl, color, hint }) => {
                    const n = tally.counts[cell];
                    if (n === 0) return null; // 0 은 자리를 안 먹는다 — 최소 폭은 "있는 것"에만
                    const pct = universe === 0 ? 0 : (n / universe) * 100;
                    const on = pickedCells.includes(cell);
                    return (
                        <button
                            key={cell}
                            onClick={() => onPick(cell)}
                            title={`${cl} ${n.toLocaleString("ko-KR")} — ${hint} · 클릭 = 겹쳐 보기`}
                            style={{
                                // 최소 폭(basis) + 남는 폭을 건수 비례로(grow). 좁으면 다 같이 줄어든다(shrink).
                                flex: `${n} 1 ${MIN_SEG}px`, minWidth: 0, border: "none", padding: 0, cursor: "pointer",
                                background: color, color: "#fff", fontSize: 10, lineHeight: 1,
                                fontVariantNumeric: "tabular-nums", overflow: "hidden", whiteSpace: "nowrap",
                                outline: on ? "2px solid var(--text-primary)" : "none", outlineOffset: -2,
                            }}
                        >{pct >= 7 ? n.toLocaleString("ko-KR") : ""}</button>
                    );
                })}
            </div>

            {/* 3줄 — 그래서 무슨 일을 했나. 막대를 읽은 다음에 보는 수치라 아래에 둔다. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 3, minWidth: 0 }}>
                {tally !== null && (
                    <button onClick={onPickPass} title="이번 통과 전부 보기(생존+근접 탈락+상류 보류)"
                        style={{ flexShrink: 0, fontSize: 10, padding: "0 6px", borderRadius: 3, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                        통과 전부
                    </button>
                )}
                {/* 장식 = 아무것도 새로 죽이지 않은 필터. 상류가 이미 걸렀거나 조건이 겉돌거나 — 어느 쪽이든 빼도 결과가 같다. */}
                {decorative && (
                    <span title="상류가 이미 다 걸러 이 필터가 새로 죽인 게 없습니다 — 빼도 결과가 같습니다(꺼진 건 아닙니다)."
                        style={{ flexShrink: 0, fontSize: 9.5, padding: "0 5px", borderRadius: 3, border: "1px solid var(--border-default)", color: "var(--text-tertiary)" }}>
                        장식
                    </span>
                )}
                <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}
                    title="이 필터가 새로 죽인 수(상류 전부 통과였는데 이번에 탈락). 0 이면 장식이다 — 겉보기 탈락과 다를 수 있다.">
                    새로 죽임 <span style={{ color: decorative ? "var(--text-tertiary)" : "var(--text-primary)", fontSize: 12 }}>{tally === null ? "—" : tally.newlyKilled.toLocaleString("ko-KR")}</span>
                </span>
            </div>
        </div>
    );
}
