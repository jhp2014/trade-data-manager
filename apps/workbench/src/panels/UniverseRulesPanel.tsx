import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    availablePredicates,
    boardPredicateDef,
    defaultParams,
    LIVE_ALARM_FIELDS,
} from "@trade-data-manager/market/domain";
import {
    addUniverseBlacklist,
    fetchUniverse,
    putUniverseRules,
    removeUniverseBlacklist,
    type UniverseRuleDraft,
} from "../api/alerts.js";
import { PredicateFormula } from "../components/PredicateFormula.js";
import { kstTime } from "../lib/date.js";
import { useStockName } from "../lib/useStockName.js";

// 유니버스 알람 규칙 빌더 — 종목을 안 고르고 유니버스(조건검색 hot∪watchlist) 전체에 조건검색식을 건다.
// 술어 팔레트 = core 레지스트리 × LIVE_ALARM_FIELDS(capability). 규칙(AND) 여러 개 = OR.
// 보드 필터와 달리 설정이 **서버 자원**(live-alerts.json — 서버가 계산·발화) → 편집은 로컬 draft,
// [저장]으로 PUT 전체 교체(규칙 편집 중 어중간한 식으로 서버가 발화하지 않게).
// output: 텔레그램(쿨다운)+로그 / 로그만. 블랙리스트 = 당일 만료, 텔레그램만 차단(로그엔 남음) — 즉시 반영.
const UNIVERSE_KEY = ["live-universe"];
const PREDICATES = availablePredicates(LIVE_ALARM_FIELDS);
const KINDS = PREDICATES.map((d) => d.kind);
const DEFAULT_COOLDOWN_MIN = 3; // 서버 기본(3분)과 표기 일치

const xBtn: React.CSSProperties = { border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0, font: "inherit" };
const chipBtn = (active: boolean): React.CSSProperties => ({
    border: "none", borderRadius: 8, padding: "1px 9px", font: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer",
    background: active ? "var(--accent-soft)" : "var(--bg-tertiary)", color: active ? "var(--accent-hover)" : "var(--text-tertiary)",
});

function newRule(): UniverseRuleDraft {
    return { predicates: [{ kind: KINDS[0], params: defaultParams(KINDS[0]) }], output: "telegram", cooldownKey: "code" };
}

export function UniverseRulesPanel(): JSX.Element {
    const qc = useQueryClient();
    const view = useQuery({ queryKey: UNIVERSE_KEY, queryFn: ({ signal }) => fetchUniverse(signal), refetchInterval: 15_000 });
    const [draft, setDraft] = useState<UniverseRuleDraft[] | null>(null); // null = 서버 그대로(미편집)
    const [editing, setEditing] = useState<number | null>(null);
    const [blCode, setBlCode] = useState("");

    const save = useMutation({
        mutationFn: putUniverseRules,
        onSuccess: () => {
            setDraft(null);
            setEditing(null);
            void qc.invalidateQueries({ queryKey: UNIVERSE_KEY });
        },
    });
    const addBl = useMutation({ mutationFn: addUniverseBlacklist, onSuccess: () => void qc.invalidateQueries({ queryKey: UNIVERSE_KEY }) });
    const rmBl = useMutation({ mutationFn: removeUniverseBlacklist, onSuccess: () => void qc.invalidateQueries({ queryKey: UNIVERSE_KEY }) });

    const rules: UniverseRuleDraft[] = draft ?? view.data?.rules ?? [];
    const dirty = draft != null;
    // 편집 진입 시 서버 스냅샷 복사 — 이후 조작은 전부 draft 위(저장 전 서버 무변).
    const edit = (fn: (rs: UniverseRuleDraft[]) => void): void => {
        const next = structuredClone(draft ?? view.data?.rules ?? []);
        fn(next);
        setDraft(next);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>유니버스 알람</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-tertiary)" }}>
                    {view.isError ? "서버 연결 안 됨" : "매칭 진입(엣지)에 발화 — 서버가 계산"}
                </span>
                {dirty && (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { setDraft(null); setEditing(null); }} style={{ border: "1px solid var(--border-default)", borderRadius: 5, background: "var(--bg-primary)", color: "var(--text-secondary)", padding: "2px 9px", cursor: "pointer", font: "inherit", fontSize: 11.5 }}>되돌리기</button>
                        <button onClick={() => save.mutate(rules)} disabled={save.isPending} style={{ border: "none", background: "var(--accent-primary)", color: "#fff", borderRadius: 5, padding: "2px 11px", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 600 }}>
                            {save.isPending ? "저장 중…" : "저장"}
                        </button>
                    </span>
                )}
            </div>
            {save.isError && <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--rise)", background: "var(--bg-secondary)" }}>저장 실패 — {save.error instanceof Error ? save.error.message : "오류"}</div>}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {rules.length === 0 && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.7, padding: "6px 2px" }}>
                        조건을 만들면 <b style={{ color: "var(--text-secondary)" }}>유니버스 전체</b>에서 매칭되는 종목이 발화합니다(종목 선택 없음).
                        <br />조건 안 <b style={{ color: "var(--text-secondary)" }}>그리고(AND)</b> · 규칙끼리 <b style={{ color: "var(--text-secondary)" }}>또는(OR)</b>. 텔레그램/로그만 은 규칙별 선택.
                    </div>
                )}

                {rules.map((r, ri) => (
                    <div key={r.id ?? `new-${ri}`}>
                        {ri > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>또는</span>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                            </div>
                        )}
                        <RuleCard
                            r={r}
                            editing={editing === ri}
                            onEdit={() => setEditing(ri)}
                            onDone={() => setEditing(null)}
                            onRemove={() => { edit((rs) => { rs.splice(ri, 1); }); setEditing(null); }}
                            onChange={(fn) => edit((rs) => fn(rs[ri]))}
                        />
                    </div>
                ))}

                <button
                    onClick={() => { edit((rs) => { rs.push(newRule()); }); setEditing(rules.length); }}
                    style={{ border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", padding: "6px 8px", cursor: "pointer", font: "inherit", fontSize: 12.5 }}
                >
                    ＋ 또는(OR) 규칙
                </button>

                {/* 블랙리스트 — 당일 만료(KST 자정). draft 아님(즉시 반영) — 시끄러운 종목을 지금 끄는 용도라. */}
                <div style={{ marginTop: 6, borderTop: "1px solid var(--border-default)", paddingTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 4 }}>오늘 블랙리스트 — 텔레그램만 차단(로그·집중감시 무관)</div>
                    {(view.data?.blacklist ?? []).map((b) => (
                        <BlacklistRow key={b.code} code={b.code} until={b.until} onRemove={() => rmBl.mutate(b.code)} />
                    ))}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <input
                            value={blCode}
                            onChange={(e) => setBlCode(e.target.value.trim())}
                            onKeyDown={(e) => { if (e.key === "Enter" && /^\d{6}$/.test(blCode)) { addBl.mutate(blCode); setBlCode(""); } }}
                            placeholder="종목코드 6자리"
                            style={{ width: 110, fontSize: 11, padding: "3px 6px", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none" }}
                        />
                        <button
                            onClick={() => { if (/^\d{6}$/.test(blCode)) { addBl.mutate(blCode); setBlCode(""); } }}
                            disabled={!/^\d{6}$/.test(blCode)}
                            style={{ border: "none", background: "var(--bg-tertiary)", color: "var(--text-secondary)", borderRadius: 4, padding: "3px 10px", cursor: "pointer", font: "inherit", fontSize: 11 }}
                        >
                            추가
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** 규칙 카드 — 헤더(전달·이름·쿨다운·삭제) + 술어 수식 줄(AND). 보기 모드에선 클릭=편집. */
function RuleCard({ r, editing, onEdit, onDone, onRemove, onChange }: {
    r: UniverseRuleDraft;
    editing: boolean;
    onEdit: () => void;
    onDone: () => void;
    onRemove: () => void;
    onChange: (fn: (r: UniverseRuleDraft) => void) => void;
}): JSX.Element {
    const cooldownMin = Math.round((r.cooldownMs ?? DEFAULT_COOLDOWN_MIN * 60_000) / 60_000);
    return (
        <div style={{ border: `1px solid ${editing ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 8, background: "var(--bg-secondary)", padding: "6px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <button
                    onClick={() => onChange((x) => { x.output = x.output === "telegram" ? "log" : "telegram"; })}
                    title="발화를 어디로: 텔레그램(쿨다운)+로그 ↔ 로그만"
                    style={chipBtn(r.output === "telegram")}
                >
                    {r.output === "telegram" ? "🔔 텔레그램" : "📋 로그만"}
                </button>
                {editing ? (
                    <input
                        value={r.name ?? ""}
                        onChange={(e) => onChange((x) => { x.name = e.target.value || undefined; })}
                        placeholder="규칙 이름(메시지에 실림)"
                        style={{ width: 150, fontSize: 11, padding: "2px 6px", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none" }}
                    />
                ) : (
                    r.name && <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>{r.name}</span>
                )}
                {r.output === "telegram" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        쿨다운
                        {editing ? (
                            <input
                                type="number"
                                min={0}
                                value={cooldownMin}
                                onChange={(e) => onChange((x) => { x.cooldownMs = Math.max(0, Number(e.target.value)) * 60_000; })}
                                style={{ width: 40, fontSize: 10.5, padding: "1px 4px", color: "var(--accent-primary)", fontWeight: 600, background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none", textAlign: "center" }}
                            />
                        ) : (
                            <b style={{ color: "var(--text-secondary)" }}>{cooldownMin}</b>
                        )}
                        분 ·
                        <button
                            onClick={editing ? () => onChange((x) => { x.cooldownKey = x.cooldownKey === "codeRule" ? "code" : "codeRule"; }) : undefined}
                            title="쿨다운 단위: 종목(넓게 — 같은 종목 알림 한 번) ↔ 종목×규칙(디테일)"
                            style={{ border: "none", background: "none", color: "var(--text-secondary)", fontWeight: 600, padding: 0, fontSize: 10.5, cursor: editing ? "pointer" : "default", font: "inherit" }}
                        >
                            {r.cooldownKey === "codeRule" ? "종목×규칙" : "종목"}
                        </button>
                    </span>
                )}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {editing && <button onClick={onDone} style={{ border: "none", background: "var(--accent-primary)", color: "#fff", borderRadius: 5, padding: "2px 11px", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 600 }}>완료</button>}
                    <button onClick={onRemove} title="규칙 삭제" style={xBtn}>✕</button>
                </span>
            </div>

            <div onClick={editing ? undefined : onEdit} title={editing ? undefined : "클릭: 편집"} style={{ cursor: editing ? undefined : "pointer", display: "flex", flexDirection: "column", gap: editing ? 9 : 3, fontSize: 12, color: "var(--text-primary)" }}>
                {r.predicates.map((p, pi) => {
                    const def = boardPredicateDef(p.kind);
                    return (
                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {pi > 0 && <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>그리고</span>}
                            {editing && (
                                <button
                                    onClick={() => onChange((x) => { const i = KINDS.indexOf(x.predicates[pi].kind); const next = KINDS[(i + 1) % KINDS.length]; x.predicates[pi] = { kind: next, params: defaultParams(next) }; })}
                                    title="클릭: 다음 조건 종류"
                                    style={{ border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", font: "inherit", fontSize: 11.5, padding: 0, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2 }}
                                >
                                    {def?.title ?? p.kind}<span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>▾</span>
                                </button>
                            )}
                            <PredicateFormula p={p} def={def} edit={editing} onParam={(k, v) => onChange((x) => { x.predicates[pi] = { ...x.predicates[pi], params: { ...x.predicates[pi].params, [k]: v } }; })} />
                            {editing && r.predicates.length > 1 && <button onClick={() => onChange((x) => { x.predicates.splice(pi, 1); })} title="이 조건 제거" style={{ ...xBtn, marginLeft: "auto" }}>✕</button>}
                        </div>
                    );
                })}
            </div>
            {editing && (
                <button onClick={() => onChange((x) => { x.predicates.push({ kind: KINDS[0], params: defaultParams(KINDS[0]) }); })} style={{ marginTop: 5, border: "none", background: "none", color: "var(--accent-primary)", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 600 }}>＋ 그리고(AND)</button>
            )}
        </div>
    );
}

function BlacklistRow({ code, until, onRemove }: { code: string; until: number; onRemove: () => void }): JSX.Element {
    const name = useStockName(code);
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11.5, padding: "2px 0" }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{name ?? code}</span>
            <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>~{kstTime(until)}</span>
            <button onClick={onRemove} title="블랙리스트 해제" style={{ ...xBtn, marginLeft: "auto" }}>✕</button>
        </div>
    );
}
