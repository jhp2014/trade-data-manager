import { BOARD_PREDICATES, boardPredicateDef, isBoardFilterActive } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import { NumberField } from "../ui/controls.js";
import { TrashIcon } from "../components/icons.js";

// 이슈보드 배제 필터 패널 — DNF(그룹 안 AND, 그룹끼리 OR), **그룹별 흐리게/숨김**. 술어는 domain 레지스트리.
// 매칭(=제외)되면 이슈정리 보드에서 그룹 mode대로 흐리게/숨김 + 제외 사유 태그. 설정이 아니라 별도 패널(최소화 가능).
export function BoardFilterPanel(): JSX.Element {
    const filter = useWorkbench((s) => s.boardFilter);
    const addGroup = useWorkbench((s) => s.addBoardGroup);
    const addPred = useWorkbench((s) => s.addBoardPredicate);
    const setKind = useWorkbench((s) => s.setBoardPredicateKind);
    const setParam = useWorkbench((s) => s.setBoardPredicateParam);
    const removePred = useWorkbench((s) => s.removeBoardPredicate);
    const setMode = useWorkbench((s) => s.setBoardGroupMode);
    const removeGroup = useWorkbench((s) => s.removeBoardGroup);
    const clear = useWorkbench((s) => s.clearBoardFilter);

    const active = isBoardFilterActive(filter);
    const firstKind = BOARD_PREDICATES[0].kind;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700 }}>이슈 필터</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-tertiary)" }}>매칭 종목 제외</span>
                <button
                    onClick={() => active && confirm("필터를 모두 지울까요?") && clear()}
                    disabled={!active}
                    title="필터 지우기"
                    style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", alignItems: "center", border: "1px solid var(--border-default)", borderRadius: 5, background: "var(--bg-primary)", color: active ? "var(--text-secondary)" : "var(--text-tertiary)", padding: "3px 6px", cursor: active ? "pointer" : "default", lineHeight: 0, opacity: active ? 1 : 0.5 }}
                >
                    <TrashIcon />
                </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {!active && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.7, padding: "6px 2px" }}>
                        조건 그룹을 만들어 이슈정리 보드에서 종목을 배제하세요.
                        <br />한 그룹 안은 <b style={{ color: "var(--text-secondary)" }}>AND</b>, 그룹끼리는 <b style={{ color: "var(--text-secondary)" }}>OR</b>. 그룹별로 흐리게/숨김.
                    </div>
                )}

                {filter.groups.map((g, gi) => (
                    <div key={gi}>
                        {gi > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>또는</span>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                            </div>
                        )}
                        <div style={{ border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--bg-secondary)", padding: 8 }}>
                            {/* 그룹 헤더 — 이 그룹 매칭 종목의 처리(흐리게/숨김) + 삭제 */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <span style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 5, overflow: "hidden" }}>
                                    {(["dim", "hide"] as const).map((mo) => (
                                        <button
                                            key={mo}
                                            onClick={() => setMode(gi, mo)}
                                            style={{ border: "none", background: g.mode === mo ? "var(--accent-primary)" : "var(--bg-primary)", color: g.mode === mo ? "#fff" : "var(--text-secondary)", padding: "2px 9px", cursor: "pointer", font: "inherit", fontSize: 11 }}
                                        >
                                            {mo === "dim" ? "흐리게" : "숨김"}
                                        </button>
                                    ))}
                                </span>
                                <button onClick={() => removeGroup(gi)} title="그룹 삭제" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14 }}>×</button>
                            </div>

                            {/* 술어들(AND) */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {g.predicates.map((p, pi) => {
                                    const def = boardPredicateDef(p.kind);
                                    return (
                                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                            {pi > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)" }}>AND</span>}
                                            <select
                                                value={p.kind}
                                                onChange={(e) => setKind(gi, pi, e.target.value)}
                                                style={{ border: "1px solid var(--border-default)", borderRadius: 5, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "3px 5px", font: "inherit", fontSize: 12 }}
                                            >
                                                {BOARD_PREDICATES.map((d) => (
                                                    <option key={d.kind} value={d.kind}>{d.title}</option>
                                                ))}
                                            </select>
                                            {def?.params.map((ps) => (
                                                <span key={ps.key} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-tertiary)" }}>
                                                    {ps.label}
                                                    <NumberField value={p.params[ps.key]} min={ps.min} step={ps.step} onChange={(e) => setParam(gi, pi, ps.key, Number(e.target.value))} style={{ width: 52 }} />
                                                </span>
                                            ))}
                                            <button onClick={() => removePred(gi, pi)} title="조건 제거" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13 }}>×</button>
                                        </div>
                                    );
                                })}
                            </div>
                            <button onClick={() => addPred(gi, firstKind)} style={{ marginTop: 6, border: "1px dashed var(--border-default)", borderRadius: 5, background: "transparent", color: "var(--text-secondary)", padding: "3px 8px", cursor: "pointer", font: "inherit", fontSize: 11.5 }}>＋ AND 조건</button>
                        </div>
                    </div>
                ))}

                <button onClick={() => addGroup(firstKind)} style={{ border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", padding: "6px 8px", cursor: "pointer", font: "inherit", fontSize: 12.5 }}>＋ 또는(OR) 조건 그룹</button>
            </div>
        </div>
    );
}
