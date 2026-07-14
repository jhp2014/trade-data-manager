import { useState } from "react";
import {
    BOARD_PREDICATES,
    boardPredicateDef,
    isBoardFilterActive,
    type BoardFilterExpr,
    type BoardFilterGroup,
    type BoardPredicateDef,
    type BoardPredicateInstance,
} from "@trade-data-manager/market/domain";
import { useWorkbench, type BoardFilterActions } from "../store/workbench.js";
import { NumberField } from "../ui/controls.js";
import { TrashIcon } from "../components/icons.js";

// 배제 필터 패널 — DNF(그룹 안 AND, 그룹끼리 OR), **그룹별 흐리게/숨김**. 술어는 domain 레지스트리.
// 보기/편집 분리: 완료된 그룹 = 수식 텍스트 한 덩어리(클릭하면 그 그룹만 편집 모드).
// 편집 모드 = 같은 수식에서 토큰만 상호작용(종류=클릭 순환, 시장=클릭 순환, 숫자=인라인 입력) — 셀렉트 없음.
// 상태·액션은 보드마다 별개(store.boardFilter / replayFilter / liveFilter)이고 표현은 이 FilterPanel 하나를 공유한다.

// ── 수식 템플릿 — kind별 보기/편집 공용(편집은 토큰만 입력으로 바뀜). 없으면 제목+파라미터 폴백. ──
// newHighFar: 매칭 = 고가에서 먼 것(당일 고가가 창최고 − tol% 아래) → 흐리게/숨김.
type Tok = string | { p: string } | { m: true };
const FORMULAS: Record<string, Tok[]> = {
    newHighFar: [{ p: "window" }, "일 고가% − ", { p: "tol" }, "% > 당일 고가%", { m: true }],
    minAmtFew: ["분봉 ", { p: "eok" }, "억+ 대금 ≤ ", { p: "maxCount" }, "회"],
    smallAmount: ["일봉 대금 < ", { p: "ltEok" }, "억"],
    weakHigh: ["당일 고가% < ", { p: "ltPct" }, "%"],
};

const xBtn: React.CSSProperties = { border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0, font: "inherit" };

/** 술어 한 개의 수식 렌더 — edit=숫자 입력·시장 순환, 아니면 순수 텍스트. */
function Formula({ p, def, edit, onParam }: { p: BoardPredicateInstance; def?: BoardPredicateDef; edit: boolean; onParam: (key: string, v: number) => void }): JSX.Element {
    const toks = FORMULAS[p.kind];
    if (!toks || !def) {
        // 폴백 — 수식 미정의 술어는 제목 + "라벨 값" 나열(새 술어 추가 시에도 안 깨짐).
        return <span>{def?.title ?? p.kind}{def?.params.map((ps) => ` ${ps.label} ${p.params[ps.key] ?? ps.def}`).join("") ?? ""}</span>;
    }
    return (
        <span className="tabular" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 1, minWidth: 0 }}>
            {toks.map((t, i) => {
                if (typeof t === "string") return <span key={i} style={{ whiteSpace: "pre" }}>{t}</span>;
                if ("m" in t) {
                    const cur = p.params.market ?? 1; // 0=KRX / 1=UN(기본)
                    const label = cur === 0 ? "KRX" : "UN";
                    return edit ? (
                        <button key={i} onClick={() => onParam("market", cur === 0 ? 1 : 0)} title="기준 시장 순환(UN↔KRX)" style={{ border: "none", background: "none", color: "var(--text-secondary)", fontWeight: 600, padding: "0 2px", marginLeft: 4, fontSize: 10.5, cursor: "pointer", font: "inherit", flexShrink: 0 }}>{label}</button>
                    ) : (
                        <span key={i} style={{ marginLeft: 5, fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>{label}</span>
                    );
                }
                const spec = def.params.find((s) => s.key === t.p);
                const val = p.params[t.p] ?? spec?.def ?? 0;
                return edit ? (
                    <NumberField key={i} value={val} min={spec?.min} step={spec?.step} onChange={(e) => onParam(t.p, Number(e.target.value))} style={{ width: 38, border: "none", background: "var(--bg-tertiary)", borderRadius: 4, color: "var(--accent-primary)", fontWeight: 600, textAlign: "center", padding: "0 3px" }} />
                ) : (
                    <span key={i} style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{val}</span>
                );
            })}
        </span>
    );
}

/** 그룹 카드 — 헤더(흐리게/숨김 좌 · 완료/삭제 우) + 수식 줄들(AND=그리고). 보기 모드에선 수식 클릭=편집. */
function GroupCard({ g, gi, actions, predicates, editing, onEdit, onDone, onRemoveGroup }: {
    g: BoardFilterGroup;
    gi: number;
    actions: BoardFilterActions;
    predicates: BoardPredicateDef[];
    editing: boolean;
    onEdit: () => void;
    onDone: () => void;
    onRemoveGroup: () => void;
}): JSX.Element {
    const kinds = predicates.map((d) => d.kind);
    return (
        <div style={{ border: `1px solid ${editing ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 8, background: "var(--bg-secondary)", padding: "6px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <button
                    onClick={() => actions.setGroupMode(gi, g.mode === "dim" ? "hide" : "dim")}
                    title="매칭 종목 처리: 흐리게 ↔ 숨김"
                    style={{ border: "none", borderRadius: 8, background: g.mode === "hide" ? "rgba(239,68,68,0.12)" : "var(--accent-soft)", color: g.mode === "hide" ? "var(--rise)" : "var(--accent-hover)", padding: "1px 9px", font: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                    {g.mode === "hide" ? "숨김" : "흐리게"}
                </button>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {editing && (
                        <button onClick={onDone} style={{ border: "none", background: "var(--accent-primary)", color: "#fff", borderRadius: 5, padding: "2px 11px", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 600 }}>완료</button>
                    )}
                    <button onClick={onRemoveGroup} title="조건 삭제" style={xBtn}>✕</button>
                </span>
            </div>
            <div onClick={editing ? undefined : onEdit} title={editing ? undefined : "클릭: 편집"} style={{ cursor: editing ? undefined : "pointer", display: "flex", flexDirection: "column", gap: editing ? 9 : 3, fontSize: 12, color: "var(--text-primary)" }}>
                {g.predicates.map((p, pi) => {
                    const def = boardPredicateDef(p.kind);
                    return (
                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {pi > 0 && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>그리고</span>}
                            {editing && (
                                <button
                                    onClick={() => { const i = kinds.indexOf(p.kind); actions.setPredicateKind(gi, pi, kinds[(i + 1) % kinds.length]); }}
                                    title="클릭: 다음 조건 종류"
                                    style={{ border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", font: "inherit", fontSize: 11.5, padding: 0, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2 }}
                                >
                                    {def?.title ?? p.kind}<span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>▾</span>
                                </button>
                            )}
                            <Formula p={p} def={def} edit={editing} onParam={(k, v) => actions.setPredicateParam(gi, pi, k, v)} />
                            {editing && g.predicates.length > 1 && <button onClick={() => actions.removePredicate(gi, pi)} title="이 조건 제거" style={{ ...xBtn, marginLeft: "auto" }}>✕</button>}
                        </div>
                    );
                })}
            </div>
            {editing && (
                <button onClick={() => actions.addPredicate(gi, kinds[0])} style={{ marginTop: 5, border: "none", background: "none", color: "var(--accent-primary)", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 600 }}>＋ 그리고(AND)</button>
            )}
        </div>
    );
}

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
    const [editing, setEditing] = useState<number | null>(null); // 편집 중인 그룹 인덱스(한 번에 하나)

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-tertiary)" }}>{subtitle}</span>
                <button
                    onClick={() => { if (active && confirm("필터를 모두 지울까요?")) { actions.clear(); setEditing(null); } }}
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
                        <br />조건 안 <b style={{ color: "var(--text-secondary)" }}>그리고(AND)</b> · 조건끼리 <b style={{ color: "var(--text-secondary)" }}>또는(OR)</b>. 완료된 조건은 클릭해서 편집.
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
                        <GroupCard
                            g={g}
                            gi={gi}
                            actions={actions}
                            predicates={predicates}
                            editing={editing === gi}
                            onEdit={() => setEditing(gi)}
                            onDone={() => setEditing(null)}
                            onRemoveGroup={() => { actions.removeGroup(gi); setEditing(null); }}
                        />
                    </div>
                ))}

                <button
                    onClick={() => { actions.addGroup(firstKind); setEditing(filter.groups.length); }}
                    style={{ border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", padding: "6px 8px", cursor: "pointer", font: "inherit", fontSize: 12.5 }}
                >
                    ＋ 또는(OR) 조건
                </button>
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
            emptyHelp={<>조건을 만들어 <b style={{ color: "var(--text-secondary)" }}>이슈정리</b> 보드에서 종목을 흐리게/숨김.</>}
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
            emptyHelp={<>조건을 만들어 <b style={{ color: "var(--text-secondary)" }}>복기</b> 보드에서 현재 시점 종목을 흐리게/숨김.</>}
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
            emptyHelp={<>조건을 만들어 <b style={{ color: "var(--text-secondary)" }}>실시간</b> 보드에서 종목을 흐리게/숨김(매물대·고가·일봉대금).</>}
        />
    );
}
