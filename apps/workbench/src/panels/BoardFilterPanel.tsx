import { BOARD_PREDICATES, boardPredicateDef, isBoardFilterActive, type BoardFilterExpr, type BoardPredicateDef } from "@trade-data-manager/market/domain";
import { useWorkbench, type BoardFilterActions } from "../store/workbench.js";
import { NumberField } from "../ui/controls.js";
import { TrashIcon } from "../components/icons.js";

// 배제 필터 패널 — DNF(그룹 안 AND, 그룹끼리 OR), **그룹별 흐리게/숨김**. 술어는 domain 레지스트리.
// 상태·액션은 보드마다 별개(store.boardFilter / replayFilter)이고 표현은 이 FilterPanel 하나를 공유한다(이슈=EOD, 복기=시점 t).
function FilterPanel({
    title,
    subtitle,
    emptyHelp,
    filter,
    actions,
    predicates = BOARD_PREDICATES,
}: {
    title: string;
    subtitle: string;
    emptyHelp: React.ReactNode;
    filter: BoardFilterExpr;
    actions: BoardFilterActions;
    predicates?: BoardPredicateDef[]; // 이 패널이 제공할 술어(기본=전체). 라이브는 buckets 없는 서브셋.
}): JSX.Element {
    const active = isBoardFilterActive(filter);
    const firstKind = predicates[0].kind;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700 }}>{title}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-tertiary)" }}>{subtitle}</span>
                <button
                    onClick={() => active && confirm("필터를 모두 지울까요?") && actions.clear()}
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
                        {emptyHelp}
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
                                            onClick={() => actions.setGroupMode(gi, mo)}
                                            style={{ border: "none", background: g.mode === mo ? "var(--accent-primary)" : "var(--bg-primary)", color: g.mode === mo ? "#fff" : "var(--text-secondary)", padding: "2px 9px", cursor: "pointer", font: "inherit", fontSize: 11 }}
                                        >
                                            {mo === "dim" ? "흐리게" : "숨김"}
                                        </button>
                                    ))}
                                </span>
                                <button onClick={() => actions.removeGroup(gi)} title="그룹 삭제" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14 }}>×</button>
                            </div>

                            {/* 술어들(AND) */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {g.predicates.map((p, pi) => {
                                    const def = boardPredicateDef(p.kind);
                                    return (
                                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                            <select
                                                value={p.kind}
                                                onChange={(e) => actions.setPredicateKind(gi, pi, e.target.value)}
                                                style={{ border: "none", borderRadius: 4, background: "var(--bg-tertiary)", color: "var(--text-primary)", padding: "2px 4px", font: "inherit", fontSize: 12, fontWeight: 500 }}
                                            >
                                                {predicates.map((d) => (
                                                    <option key={d.kind} value={d.kind}>{d.title}</option>
                                                ))}
                                            </select>
                                            {def?.params.map((ps) => (
                                                <span key={ps.key} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-tertiary)" }}>
                                                    {ps.label}
                                                    {ps.options ? (
                                                        // select 파라미터(예: newHighFar 시장) — 값=옵션 인덱스. 미지정(옛 저장 필터)이면 기본값 표시.
                                                        <select
                                                            value={p.params[ps.key] ?? ps.def}
                                                            onChange={(e) => actions.setPredicateParam(gi, pi, ps.key, Number(e.target.value))}
                                                            style={{ border: "none", borderRadius: 4, background: "var(--bg-tertiary)", color: "var(--text-primary)", padding: "2px 4px", font: "inherit", fontSize: 11 }}
                                                        >
                                                            {ps.options.map((label, idx) => (
                                                                <option key={idx} value={idx}>{label}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <NumberField value={p.params[ps.key]} min={ps.min} step={ps.step} onChange={(e) => actions.setPredicateParam(gi, pi, ps.key, Number(e.target.value))} style={{ width: 46, border: "none", background: "var(--bg-tertiary)", borderRadius: 4, color: "var(--accent-primary)", fontWeight: 600, textAlign: "center" }} />
                                                    )}
                                                </span>
                                            ))}
                                            <button onClick={() => actions.removePredicate(gi, pi)} title="조건 제거" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13 }}>×</button>
                                        </div>
                                    );
                                })}
                            </div>
                            <button onClick={() => actions.addPredicate(gi, firstKind)} style={{ marginTop: 6, border: "1px dashed var(--border-default)", borderRadius: 5, background: "transparent", color: "var(--text-secondary)", padding: "3px 8px", cursor: "pointer", font: "inherit", fontSize: 11.5 }}>＋ AND 조건</button>
                        </div>
                    </div>
                ))}

                <button onClick={() => actions.addGroup(firstKind)} style={{ border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", padding: "6px 8px", cursor: "pointer", font: "inherit", fontSize: 12.5 }}>＋ 또는(OR) 조건 그룹</button>
            </div>
        </div>
    );
}

// 이슈정리 보드(EOD) 배제 필터. 상태=store.boardFilter.
export function BoardFilterPanel(): JSX.Element {
    const filter = useWorkbench((s) => s.boardFilter);
    const actions = useWorkbench((s) => s.boardFilterActions);
    return (
        <FilterPanel
            title="이슈 필터"
            subtitle="매칭 종목 제외"
            filter={filter}
            actions={actions}
            emptyHelp={<>조건 그룹을 만들어 <b style={{ color: "var(--text-secondary)" }}>이슈정리</b> 보드에서 종목을 배제하세요.</>}
        />
    );
}

// 복기 보드(시점 t 스냅샷) 배제 필터. 상태=store.replayFilter. 술어는 시점 t 지표(누적 대금·시점 등락률·t까지 버킷·매물대)에 재평가.
export function ReplayFilterPanel(): JSX.Element {
    const filter = useWorkbench((s) => s.replayFilter);
    const actions = useWorkbench((s) => s.replayFilterActions);
    return (
        <FilterPanel
            title="복기 필터"
            subtitle="매칭 종목 제외"
            filter={filter}
            actions={actions}
            emptyHelp={<>조건 그룹을 만들어 <b style={{ color: "var(--text-secondary)" }}>복기</b> 보드에서 현재 시점 종목을 배제하세요.</>}
        />
    );
}

// 실시간 보드 배제 필터. 상태=store.liveFilter. 라이브엔 분봉 buckets 가 없어 "분봉 대금" 술어 제외(그게 있으면 buckets 없는 전 종목 오검출).
const LIVE_PREDICATES = BOARD_PREDICATES.filter((d) => d.kind !== "minAmtFew");
export function LiveFilterPanel(): JSX.Element {
    const filter = useWorkbench((s) => s.liveFilter);
    const actions = useWorkbench((s) => s.liveFilterActions);
    return (
        <FilterPanel
            title="실시간 필터"
            subtitle="매칭 종목 제외"
            filter={filter}
            actions={actions}
            predicates={LIVE_PREDICATES}
            emptyHelp={<>조건 그룹을 만들어 <b style={{ color: "var(--text-secondary)" }}>실시간</b> 보드에서 종목을 배제하세요(매물대·고가·일봉대금).</>}
        />
    );
}
