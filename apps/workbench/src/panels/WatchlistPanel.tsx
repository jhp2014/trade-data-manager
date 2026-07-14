import { useId, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LiveStock } from "@trade-data-manager/wire";
import { useLiveSnapshot } from "../api/live.js";
import {
    fetchWatchlist,
    addWatch,
    removeWatch,
    createAlertRule,
    deleteAlertRule,
    type AlertRuleView,
    type AlertFiring,
    type AlertLeaf,
    type AlertGroup,
    type AlertMarket,
    type AlertOp,
    type CreateRulePayload,
} from "../api/alerts.js";
import { useWorkbench } from "../store/workbench.js";
import { useStockName } from "../lib/useStockName.js";
import { StockRow } from "../components/board/StockRow.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { liveToBoardStock } from "../lib/boardViewModel.js";

// 실시간 모니터링(watchlist) 패널 — 실시간 플레인. 스캔에서 승격한 선택 종목을 항상 폴링·표시하고(2층 구조),
// 종목별 알람 조건(그룹 OR / leaf AND = DNF, leaf 3종: 가격 절대임계·등락률·테마 등락률순위)을 편집한다.
// 발화는 텔레그램+서버, 최근 발화는 하단 로그. 시세 행 = SSE 스냅샷(watched 플래그), 조건·발화 = 5초 폴링.
const WATCHLIST_KEY = ["live-watchlist"];

export function WatchlistPanel(): JSX.Element {
    const { snapshot, error } = useLiveSnapshot();
    const focusCode = useWorkbench((s) => s.liveFocus.code);
    const setCode = useWorkbench((s) => s.setLiveCode);
    const market = useWorkbench((s) => s.boardMarket.live); // 시세 행 % 기준 — 실시간 보드와 동일 토글 공유
    const originId = useId();
    const qc = useQueryClient();
    const [codeInput, setCodeInput] = useState("");
    const [ruleFormCode, setRuleFormCode] = useState<string | null>(null); // 조건 추가 폼이 열린 종목

    const view = useQuery({ queryKey: WATCHLIST_KEY, queryFn: ({ signal }) => fetchWatchlist(signal), refetchInterval: 5_000 });
    const invalidate = (): void => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY });

    const addM = useMutation({ mutationFn: addWatch, onSettled: invalidate });
    const removeM = useMutation({ mutationFn: removeWatch, onSettled: invalidate });
    const deleteRuleM = useMutation({ mutationFn: deleteAlertRule, onSettled: invalidate });

    const focusName = useStockName(focusCode);
    const codes = view.data?.codes ?? [];
    const rulesByCode = useMemo(() => {
        const m = new Map<string, AlertRuleView[]>();
        for (const r of view.data?.rules ?? []) {
            const list = m.get(r.code);
            if (list) list.push(r);
            else m.set(r.code, [r]);
        }
        return m;
    }, [view.data]);
    // 시세 행 — 스냅샷의 watched 종목. 아직 스냅샷에 없으면(방금 추가·미폴링) 코드만으로 자리 표시.
    const stockOf = useMemo(() => {
        const m = new Map<string, LiveStock>();
        for (const s of snapshot?.stocks ?? []) if (s.watched) m.set(s.code, s);
        return m;
    }, [snapshot]);

    const submitAdd = (code: string): void => {
        if (!/^\d{6}$/.test(code)) return;
        addM.mutate(code);
        setCodeInput("");
    };

    if (view.isLoading) return <BoardCenter text="모니터링 로딩중…" />;
    if (view.isError) return <BoardCenter text={`오류: ${(view.error as Error).message} — apps/live 서버 확인`} />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            {/* 헤더 — 점·건수 + 종목 추가(포커스 승격 / 코드 입력) */}
            <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} />
                <span style={{ color: "var(--plane-live)" }}>실시간 모니터링</span>
                <span className="tabular">{codes.length}종목</span>
                {error && <span style={{ color: "var(--rise)" }}>연결 오류</span>}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                    {focusCode && !codes.includes(focusCode) && (
                        <button className="icon-btn" onClick={() => submitAdd(focusCode)} title="포커스 종목을 모니터링에 추가" style={{ fontSize: 11, width: "auto", padding: "0 4px" }}>
                            + {focusName ?? focusCode}
                        </button>
                    )}
                    <input
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value.trim())}
                        onKeyDown={(e) => e.key === "Enter" && submitAdd(codeInput)}
                        placeholder="코드 추가"
                        className="tabular"
                        style={{ width: 64, fontSize: 11, padding: "1px 4px", color: "var(--text-primary)", background: "transparent", border: "none", borderBottom: "1px solid var(--border-default)", outline: "none" }}
                    />
                </span>
            </div>

            {/* 본문 — 종목별 섹션(시세 행 + 조건들) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {codes.length === 0 && <BoardCenter text="모니터링 종목 없음 — 실시간 보드에서 종목 클릭 후 + 로 추가" />}
                {codes.map((code) => {
                    const s = stockOf.get(code);
                    const rules = rulesByCode.get(code) ?? [];
                    return (
                        <div key={code} style={{ borderBottom: "1px solid var(--border-default)" }}>
                            {s ? (
                                <StockRow s={liveToBoardStock(s, market)} rank={null} selected={code === focusCode} onPick={(c) => setCode(c, originId)} />
                            ) : (
                                <div className="tabular" style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-tertiary)" }}>
                                    {code} — 시세 대기중(다음 틱)
                                </div>
                            )}
                            <div style={{ padding: "2px 10px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                                {rules.map((r) => (
                                    <RuleLine key={r.id} rule={r} onDelete={() => deleteRuleM.mutate(r.id)} />
                                ))}
                                {ruleFormCode === code ? (
                                    <ConditionForm
                                        code={code}
                                        themes={s?.themes ?? []}
                                        currentPrice={s?.price}
                                        onClose={() => setRuleFormCode(null)}
                                        onSaved={() => {
                                            setRuleFormCode(null);
                                            invalidate();
                                        }}
                                    />
                                ) : (
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button style={miniBtn("var(--accent-primary)")} onClick={() => setRuleFormCode(code)}>+ 조건</button>
                                        <button style={miniBtn("var(--text-tertiary)")} onClick={() => removeM.mutate(code)} title="모니터링 해제(조건 함께 삭제)">해제</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* 최근 발화 로그 */}
                {(view.data?.firings.length ?? 0) > 0 && (
                    <div>
                        <div style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", background: "var(--bg-tertiary)" }}>최근 발화</div>
                        {view.data?.firings.map((f) => <FiringLine key={`${f.ruleId}-${f.at}`} f={f} />)}
                    </div>
                )}
            </div>
        </div>
    );
}

function miniBtn(color: string): React.CSSProperties {
    return { border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11, color };
}

const sign = (n: number): string => (n >= 0 ? "+" : "");
const mkLabel = (m: AlertMarket): string => (m === "krx" ? "KRX" : "UN");

/** leaf 한 개 → 짧은 텍스트. */
function leafText(l: AlertLeaf): string {
    if (l.kind === "price") return `${l.op === "gte" ? "≥" : "≤"} ${l.value.toLocaleString("ko-KR")}`;
    if (l.kind === "rate") return `등락률(${mkLabel(l.market)}) ${l.op === "gte" ? "≥" : "≤"} ${l.pct}%`;
    return `${l.theme}(${mkLabel(l.market)}) ${l.mode === "reach" ? `${l.threshold}위 이내` : `↑${l.threshold}계단`}`;
}

/** 조건 한 줄 요약(그룹 AND · 그룹간 OR) + 상태 점 + 삭제. */
function RuleLine({ rule, onDelete }: { rule: AlertRuleView; onDelete: () => void }): JSX.Element {
    const expr = rule.groups.map((g) => g.leaves.map(leafText).join(" · ")).join("  또는  ");
    const parts = [expr];
    if (rule.note) parts.push(rule.note);
    // 상태 점 — 조건 안(주황 solid)=재무장 대기 / 무장(회색 테두리)=다음 진입에 발화 / 미평가(옅음).
    const dot = rule.inZone == null ? { border: "1px solid var(--border-default)" } : rule.inZone ? { background: "#e07b1a" } : { border: "1px solid var(--text-tertiary)" };
    const title = rule.inZone == null ? "평가 전(또는 데이터 대기)" : rule.inZone ? "조건 안(재무장 대기)" : "무장 — 다음 진입에 발화";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <span title={title} style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, ...dot }} />
            <span className="tabular" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parts.join(" · ")}</span>
            {rule.lastFiredAt != null && <span className="tabular" style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>발화 {kstTime(rule.lastFiredAt)}</span>}
            <button style={{ ...miniBtn("var(--text-tertiary)"), marginLeft: "auto", flexShrink: 0 }} onClick={onDelete} title="조건 삭제">✕</button>
        </div>
    );
}

function FiringLine({ f }: { f: AlertFiring }): JSX.Element {
    const { price, changeRate } = f.features;
    const bits = [`${price.toLocaleString("ko-KR")}원 ${sign(changeRate)}${changeRate.toFixed(2)}%`];
    if (f.note) bits.push(f.note);
    return (
        <div style={{ display: "flex", gap: 6, padding: "3px 10px", fontSize: 11, borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="tabular" style={{ flexShrink: 0, color: "var(--accent-primary)" }}>{kstTime(f.at)}</span>
            <span style={{ flexShrink: 0, fontWeight: 600, color: "var(--text-primary)" }}>{f.name || f.code}</span>
            <span className="tabular" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{bits.join(" · ")}</span>
        </div>
    );
}

// ── 조건 빌더 (DNF) ──────────────────────────────────────────────
type DraftLeaf =
    | { kind: "price"; op: AlertOp; value: string }
    | { kind: "rate"; op: AlertOp; pct: string; market: AlertMarket }
    | { kind: "rank"; theme: string; market: AlertMarket; mode: "reach" | "delta"; threshold: string };
type DraftGroup = { leaves: DraftLeaf[] };

const DEFAULT_MARKET: AlertMarket = "un"; // 등락률·순위 기본 잣대(UN)
const newPriceLeaf = (value = ""): DraftLeaf => ({ kind: "price", op: "gte", value });
function newLeafOfKind(kind: DraftLeaf["kind"], themes: string[]): DraftLeaf {
    if (kind === "price") return newPriceLeaf();
    if (kind === "rate") return { kind: "rate", op: "gte", pct: "", market: DEFAULT_MARKET };
    return { kind: "rank", theme: themes[0] ?? "", market: DEFAULT_MARKET, mode: "reach", threshold: "" };
}

/** draft → 검증된 AlertLeaf 또는 오류 메시지(문자열). */
function toLeaf(d: DraftLeaf): AlertLeaf | string {
    if (d.kind === "price") {
        const v = Number(d.value);
        if (d.value.trim() === "" || !Number.isFinite(v) || v <= 0) return "가격은 0 초과 숫자로";
        return { kind: "price", op: d.op, value: v };
    }
    if (d.kind === "rate") {
        const p = Number(d.pct);
        if (d.pct.trim() === "" || !Number.isFinite(p)) return "등락률 %는 숫자로";
        return { kind: "rate", op: d.op, pct: p, market: d.market };
    }
    if (!d.theme) return "순위 조건은 테마를 골라야 함";
    const t = Number(d.threshold);
    if (!Number.isInteger(t) || t < 1) return "순위 임계는 1 이상 정수";
    return { kind: "rank", theme: d.theme, market: d.market, mode: d.mode, threshold: t };
}

/** 조건 추가 폼 — 그룹(OR)/leaf(AND) 빌더. 가격 값은 수동 입력(차트 좌클릭 캡처는 후속). */
function ConditionForm({ code, themes, currentPrice, onClose, onSaved }: {
    code: string;
    themes: string[];
    currentPrice?: number;
    onClose: () => void;
    onSaved: () => void;
}): JSX.Element {
    const [groups, setGroups] = useState<DraftGroup[]>(() => [{ leaves: [newPriceLeaf(currentPrice != null ? String(currentPrice) : "")] }]);
    const [cooldownMin, setCooldownMin] = useState("3");
    const [note, setNote] = useState("");
    const [err, setErr] = useState<string | null>(null);

    const saveM = useMutation({ mutationFn: createAlertRule, onSuccess: onSaved, onError: (e: Error) => setErr(e.message) });

    const patchLeaf = (gi: number, li: number, leaf: DraftLeaf): void =>
        setGroups((gs) => gs.map((g, i) => (i !== gi ? g : { leaves: g.leaves.map((x, j) => (j !== li ? x : leaf)) })));
    const setKind = (gi: number, li: number, kind: DraftLeaf["kind"]): void =>
        setGroups((gs) => gs.map((g, i) => (i !== gi ? g : { leaves: g.leaves.map((x, j) => (j !== li ? x : newLeafOfKind(kind, themes))) })));
    const addLeaf = (gi: number): void =>
        setGroups((gs) => gs.map((g, i) => (i !== gi ? g : { leaves: [...g.leaves, newPriceLeaf()] })));
    const removeLeaf = (gi: number, li: number): void =>
        setGroups((gs) => {
            const next = gs.map((g, i) => (i !== gi ? g : { leaves: g.leaves.filter((_, j) => j !== li) })).filter((g) => g.leaves.length > 0);
            return next.length ? next : gs; // 최소 1 leaf 유지
        });
    const removeGroup = (gi: number): void => setGroups((gs) => (gs.length > 1 ? gs.filter((_, i) => i !== gi) : gs));
    const addGroup = (): void => setGroups((gs) => [...gs, { leaves: [newPriceLeaf()] }]);

    const totalLeaves = groups.reduce((n, g) => n + g.leaves.length, 0);

    const submit = (): void => {
        setErr(null);
        const out: AlertGroup[] = [];
        for (const g of groups) {
            const leaves: AlertLeaf[] = [];
            for (const d of g.leaves) {
                const r = toLeaf(d);
                if (typeof r === "string") {
                    setErr(r);
                    return;
                }
                leaves.push(r);
            }
            out.push({ leaves });
        }
        const payload: CreateRulePayload = {
            code,
            groups: out,
            cooldownMs: cooldownMin === "" ? undefined : Math.round(Number(cooldownMin) * 60_000),
            note: note.trim() || undefined,
        };
        saveM.mutate(payload);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 8px", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6, fontSize: 11 }}>
            {groups.map((g, gi) => (
                <div key={gi}>
                    {gi > 0 && <div style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", margin: "2px 0" }}>— 또는 —</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 6, border: "1px solid var(--border-subtle)", borderRadius: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "var(--text-tertiary)" }}>그룹 {gi + 1} · 모두 만족(AND)</span>
                            {groups.length > 1 && (
                                <button style={{ ...miniBtn("var(--text-tertiary)"), marginLeft: "auto" }} onClick={() => removeGroup(gi)} title="그룹 삭제">그룹 ✕</button>
                            )}
                        </div>
                        {g.leaves.map((leaf, li) => (
                            <LeafRow
                                key={li}
                                leaf={leaf}
                                themes={themes}
                                onKind={(k) => setKind(gi, li, k)}
                                onPatch={(l) => patchLeaf(gi, li, l)}
                                onRemove={() => removeLeaf(gi, li)}
                                canRemove={totalLeaves > 1}
                            />
                        ))}
                        <button style={miniBtn("var(--accent-primary)")} onClick={() => addLeaf(gi)}>+ 조건 추가(AND)</button>
                    </div>
                </div>
            ))}
            <button style={miniBtn("var(--text-tertiary)")} onClick={addGroup}>+ 또는 그룹 추가(OR)</button>
            <Row label="쿨다운">
                <input style={numStyle} className="tabular" value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} title="발화 후 최소 재발화 간격(분)" />
                <span style={{ color: "var(--text-tertiary)" }}>분</span>
                <input style={{ ...numStyle, width: 120, textAlign: "left" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(알림에 실림)" />
            </Row>
            {err && <div style={{ color: "var(--rise)" }}>{err}</div>}
            <div style={{ display: "flex", gap: 10 }}>
                <button style={miniBtn("var(--accent-primary)")} onClick={submit} disabled={saveM.isPending}>{saveM.isPending ? "저장중…" : "저장"}</button>
                <button style={miniBtn("var(--text-tertiary)")} onClick={onClose}>취소</button>
            </div>
        </div>
    );
}

/** leaf 한 줄 편집기 — 종류 선택 + 종류별 필드 + 삭제. */
function LeafRow({ leaf, themes, onKind, onPatch, onRemove, canRemove }: {
    leaf: DraftLeaf;
    themes: string[];
    onKind: (kind: DraftLeaf["kind"]) => void;
    onPatch: (leaf: DraftLeaf) => void;
    onRemove: () => void;
    canRemove: boolean;
}): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <select value={leaf.kind} onChange={(e) => onKind(e.target.value as DraftLeaf["kind"])} style={selStyle}>
                <option value="price">가격</option>
                <option value="rate">등락률</option>
                <option value="rank">순위</option>
            </select>
            {leaf.kind === "price" && (
                <>
                    <OpSelect op={leaf.op} onChange={(op) => onPatch({ ...leaf, op })} />
                    <input style={numStyle} className="tabular" value={leaf.value} onChange={(e) => onPatch({ ...leaf, value: e.target.value })} placeholder="원" title="절대가격(원)" />
                </>
            )}
            {leaf.kind === "rate" && (
                <>
                    <OpSelect op={leaf.op} onChange={(op) => onPatch({ ...leaf, op })} />
                    <input style={numStyle} className="tabular" value={leaf.pct} onChange={(e) => onPatch({ ...leaf, pct: e.target.value })} placeholder="%" title="등락률 %(전일종가 대비)" />
                    <MarketSelect market={leaf.market} onChange={(market) => onPatch({ ...leaf, market })} />
                </>
            )}
            {leaf.kind === "rank" && (
                <>
                    <select value={leaf.theme} onChange={(e) => onPatch({ ...leaf, theme: e.target.value })} style={selStyle} title={themes.length ? "테마 선택" : "테마 미배정 — 보드 우클릭으로 배정 후"}>
                        <option value="">테마</option>
                        {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <MarketSelect market={leaf.market} onChange={(market) => onPatch({ ...leaf, market })} />
                    <select value={leaf.mode} onChange={(e) => onPatch({ ...leaf, mode: e.target.value as "reach" | "delta" })} style={selStyle}>
                        <option value="reach">도달 ≤</option>
                        <option value="delta">상승 ≥</option>
                    </select>
                    <input style={numStyle} className="tabular" value={leaf.threshold} onChange={(e) => onPatch({ ...leaf, threshold: e.target.value })} placeholder={leaf.mode === "reach" ? "K위" : "D계단"} />
                </>
            )}
            <button style={{ ...miniBtn("var(--text-tertiary)"), marginLeft: "auto", flexShrink: 0, visibility: canRemove ? "visible" : "hidden" }} onClick={onRemove} title="이 조건 삭제">✕</button>
        </div>
    );
}

function OpSelect({ op, onChange }: { op: AlertOp; onChange: (op: AlertOp) => void }): JSX.Element {
    return (
        <select value={op} onChange={(e) => onChange(e.target.value as AlertOp)} style={selStyle} title="이상(≥)/이하(≤)">
            <option value="gte">≥</option>
            <option value="lte">≤</option>
        </select>
    );
}

function MarketSelect({ market, onChange }: { market: AlertMarket; onChange: (m: AlertMarket) => void }): JSX.Element {
    return (
        <select value={market} onChange={(e) => onChange(e.target.value as AlertMarket)} style={selStyle} title="기준 시장(전일종가)">
            <option value="un">UN</option>
            <option value="krx">KRX</option>
        </select>
    );
}

const numStyle: React.CSSProperties = { width: 62, fontSize: 11, padding: "1px 4px", color: "var(--text-primary)", background: "transparent", border: "none", borderBottom: "1px solid var(--border-default)", outline: "none", textAlign: "right" };
const selStyle: React.CSSProperties = { fontSize: 11, padding: "1px 2px", color: "var(--text-primary)", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 4 };

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 40, flexShrink: 0, color: "var(--text-tertiary)" }}>{label}</span>
            {children}
        </div>
    );
}

function kstTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
