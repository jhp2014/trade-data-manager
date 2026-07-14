import { useEffect, useId, useMemo, useRef, useState } from "react";
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
    type AlertMarket,
    type AlertOp,
    type CreateRulePayload,
} from "../api/alerts.js";
import { useWorkbench } from "../store/workbench.js";
import { useStockName } from "../lib/useStockName.js";
import { StockRow } from "../components/board/StockRow.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { liveToBoardStock } from "../lib/boardViewModel.js";

// 실시간 모니터링(watchlist) 패널 — 실시간 플레인. 승격한 선택 종목을 항상 폴링·표시하고(2층 구조),
// 종목별 알람 조건(leaf AND 리스트, leaf 2종: 가격 절대임계·테마 등락률순위)을 편집한다. 여러 조건 = OR.
// 발화는 텔레그램+서버. 종목마다 현재 테마 순위(순환)도 표시. 조건·발화·순위 = /live/watchlist 5초 폴링.
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
    const [rankMarket, setRankMarket] = useState<AlertMarket>("un"); // 순위 표시 기준 시장

    const view = useQuery({ queryKey: WATCHLIST_KEY, queryFn: ({ signal }) => fetchWatchlist(signal), refetchInterval: 5_000 });
    const invalidate = (): void => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY });

    const addM = useMutation({ mutationFn: addWatch, onSettled: invalidate });
    const removeM = useMutation({ mutationFn: removeWatch, onSettled: invalidate });
    const deleteRuleM = useMutation({ mutationFn: deleteAlertRule, onSettled: invalidate });

    const focusName = useStockName(focusCode);
    const codes = view.data?.codes ?? [];
    const ranks = view.data?.ranks ?? {};
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
            {/* 헤더 — 점·건수 + 순위 시장 토글 + 종목 추가 */}
            <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} />
                <span style={{ color: "var(--plane-live)" }}>실시간 모니터링</span>
                <span className="tabular">{codes.length}종목</span>
                {error && <span style={{ color: "var(--rise)" }}>연결 오류</span>}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }} title="순위 표시 기준 시장(전일종가)">
                        <span>순위</span>
                        <button onClick={() => setRankMarket((m) => (m === "un" ? "krx" : "un"))} style={{ ...miniBtn("var(--accent-primary)"), fontWeight: 600 }}>{rankMarket.toUpperCase()}</button>
                    </span>
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

            {/* 본문 — 종목별 섹션(시세 행 + 순위줄 + 조건들) */}
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
                            {s && <RankLine code={code} themes={s.themes} ranks={ranks} market={rankMarket} />}
                            <div style={{ padding: "2px 10px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
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
                                    <div style={{ display: "flex", gap: 10 }}>
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

/** 종목의 현재 테마 순위 한 줄 — 대표 1개 표시, 클릭하면 다음 테마로 순환(시장은 헤더 토글). */
function RankLine({ code, themes, ranks, market }: { code: string; themes: string[]; ranks: Record<string, number>; market: AlertMarket }): JSX.Element | null {
    const [idx, setIdx] = useState(0);
    const ranked = useMemo(
        () => themes.map((t) => ({ theme: t, rank: ranks[`${code}|${t}|${market}`] })).filter((x): x is { theme: string; rank: number } => typeof x.rank === "number"),
        [themes, ranks, code, market],
    );
    if (ranked.length === 0) return null;
    const cur = ranked[idx % ranked.length];
    return (
        <div style={{ padding: "0 10px 3px" }}>
            <button
                onClick={() => setIdx((i) => i + 1)}
                title={ranked.length > 1 ? "클릭: 다음 테마 순위" : cur.theme}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "var(--bg-tertiary)", borderRadius: 4, padding: "1px 7px", cursor: ranked.length > 1 ? "pointer" : "default", font: "inherit", fontSize: 11, color: "var(--text-secondary)" }}
            >
                <span style={{ color: "var(--text-tertiary)" }}>{cur.theme}</span>
                <span className="tabular" style={{ fontWeight: 700, color: cur.rank <= 3 ? "var(--accent-primary)" : "var(--text-secondary)" }}>{cur.rank}위</span>
                {ranked.length > 1 && <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>▸{ranked.length}</span>}
            </button>
        </div>
    );
}

/** leaf 한 개 → 짧은 텍스트. */
function leafText(l: AlertLeaf): string {
    if (l.kind === "price") return `${l.op === "gte" ? "≥" : "≤"} ${l.value.toLocaleString("ko-KR")}`;
    return `${l.theme}(${mkLabel(l.market)}) ${l.mode === "reach" ? `${l.threshold}위 이내` : `↑${l.threshold}계단`}`;
}

/** 조건 한 줄 요약(leaf AND) + 상태 점 + 삭제. */
function RuleLine({ rule, onDelete }: { rule: AlertRuleView; onDelete: () => void }): JSX.Element {
    const parts = [rule.leaves.map(leafText).join(" · ")];
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

// ── 조건 빌더 (leaf AND 리스트) ─────────────────────────────────
type DraftLeaf =
    | { kind: "price"; op: AlertOp; value: string }
    | { kind: "rank"; theme: string; market: AlertMarket; mode: "reach" | "delta"; threshold: string };

const DEFAULT_MARKET: AlertMarket = "un"; // 순위 기본 잣대(UN)
const newPriceLeaf = (value = ""): DraftLeaf => ({ kind: "price", op: "gte", value });
function newLeafOfKind(kind: DraftLeaf["kind"], themes: string[]): DraftLeaf {
    if (kind === "price") return newPriceLeaf();
    return { kind: "rank", theme: themes[0] ?? "", market: DEFAULT_MARKET, mode: "reach", threshold: "" };
}

/** draft → 검증된 AlertLeaf 또는 오류 메시지(문자열). */
function toLeaf(d: DraftLeaf): AlertLeaf | string {
    if (d.kind === "price") {
        const v = Number(d.value);
        if (d.value.trim() === "" || !Number.isFinite(v) || v <= 0) return "가격은 0 초과 숫자로";
        return { kind: "price", op: d.op, value: v };
    }
    if (!d.theme) return "순위 조건은 테마를 골라야 함";
    const t = Number(d.threshold);
    if (!Number.isInteger(t) || t < 1) return "순위 임계는 1 이상 정수";
    return { kind: "rank", theme: d.theme, market: d.market, mode: d.mode, threshold: t };
}

/** 조건 추가 폼 — leaf(AND) 리스트 빌더. 가격 leaf 포커스 시 차트 좌클릭으로 값 캡처. */
function ConditionForm({ code, themes, currentPrice, onClose, onSaved }: {
    code: string;
    themes: string[];
    currentPrice?: number;
    onClose: () => void;
    onSaved: () => void;
}): JSX.Element {
    const [leaves, setLeaves] = useState<DraftLeaf[]>(() => [newPriceLeaf(currentPrice != null ? String(currentPrice) : "")]);
    const [cooldownMin, setCooldownMin] = useState("3");
    const [note, setNote] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [activePrice, setActivePrice] = useState<number | null>(null); // 캡처 대상 가격 leaf 인덱스

    const arm = useWorkbench((s) => s.armAlertCapture);
    const disarm = useWorkbench((s) => s.disarmAlertCapture);
    const setLiveCode = useWorkbench((s) => s.setLiveCode);
    const captured = useWorkbench((s) => s.alertCapturedPrice);
    const originId = useId();
    const seenSeqRef = useRef<number>(-1);

    useEffect(() => () => disarm(), [disarm]); // 폼 닫힘(닫기·저장) → 캡처 해제
    // 배달된 캡처 가격을 활성 가격 leaf 에 주입 — seq 증가 감지, 마운트 시점 값은 기준선으로 무시.
    useEffect(() => {
        const seq = captured?.seq ?? 0;
        if (seenSeqRef.current < 0) {
            seenSeqRef.current = seq;
            return;
        }
        if (!captured || activePrice == null || seq === seenSeqRef.current) return;
        seenSeqRef.current = seq;
        setLeaves((ls) => ls.map((x, j) => (j !== activePrice || x.kind !== "price" ? x : { ...x, value: String(Math.round(captured.price)) })));
    }, [captured, activePrice]);

    const armPrice = (i: number): void => {
        setActivePrice(i);
        arm(code);
        setLiveCode(code, originId); // 차트가 이 종목을 보도록(캡처 정합)
    };

    const patchLeaf = (i: number, leaf: DraftLeaf): void => setLeaves((ls) => ls.map((x, j) => (j !== i ? x : leaf)));
    const setKind = (i: number, kind: DraftLeaf["kind"]): void => setLeaves((ls) => ls.map((x, j) => (j !== i ? x : newLeafOfKind(kind, themes))));
    const addLeaf = (): void => setLeaves((ls) => [...ls, newPriceLeaf()]);
    const removeLeaf = (i: number): void => setLeaves((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

    const saveM = useMutation({ mutationFn: createAlertRule, onSuccess: onSaved, onError: (e: Error) => setErr(e.message) });

    const submit = (): void => {
        setErr(null);
        const out: AlertLeaf[] = [];
        for (const d of leaves) {
            const r = toLeaf(d);
            if (typeof r === "string") {
                setErr(r);
                return;
            }
            out.push(r);
        }
        const payload: CreateRulePayload = {
            code,
            leaves: out,
            cooldownMs: cooldownMin === "" ? undefined : Math.round(Number(cooldownMin) * 60_000),
            note: note.trim() || undefined,
        };
        saveM.mutate(payload);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6, fontSize: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>모든 조건 만족 시 발화 · 여러 조건은 따로(아무거나 걸리면 발화)</div>
            {leaves.map((leaf, i) => (
                <LeafRow
                    key={i}
                    leaf={leaf}
                    themes={themes}
                    onKind={(k) => setKind(i, k)}
                    onPatch={(l) => patchLeaf(i, l)}
                    onRemove={() => removeLeaf(i)}
                    canRemove={leaves.length > 1}
                    active={activePrice === i && leaf.kind === "price"}
                    onFocusPrice={() => armPrice(i)}
                />
            ))}
            <button style={{ ...miniBtn("var(--accent-primary)"), alignSelf: "flex-start", fontSize: 12 }} onClick={addLeaf}>+ 조건 추가</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                <span style={{ color: "var(--text-tertiary)" }}>쿨다운</span>
                <input style={numStyle} className="tabular" value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} title="발화 후 최소 재발화 간격(분)" />
                <span style={{ color: "var(--text-tertiary)" }}>분</span>
                <input style={{ ...numStyle, width: 140, textAlign: "left" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(알림에 실림)" />
            </div>
            {err && <div style={{ color: "var(--rise)" }}>{err}</div>}
            <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                <button style={{ ...miniBtn("var(--accent-primary)"), fontSize: 12, fontWeight: 600 }} onClick={submit} disabled={saveM.isPending}>{saveM.isPending ? "저장중…" : "저장"}</button>
                <button style={{ ...miniBtn("var(--text-tertiary)"), fontSize: 12 }} onClick={onClose}>취소</button>
            </div>
        </div>
    );
}

/** leaf 한 줄 편집기 — 종류(가격/순위) + 종류별 필드 + 삭제. active=이 가격 leaf가 차트 캡처 대상. */
function LeafRow({ leaf, themes, onKind, onPatch, onRemove, canRemove, active = false, onFocusPrice }: {
    leaf: DraftLeaf;
    themes: string[];
    onKind: (kind: DraftLeaf["kind"]) => void;
    onPatch: (leaf: DraftLeaf) => void;
    onRemove: () => void;
    canRemove: boolean;
    active?: boolean;
    onFocusPrice?: () => void;
}): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: 6, background: "var(--bg-secondary)", border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`, borderRadius: 5 }}>
            <select value={leaf.kind} onChange={(e) => onKind(e.target.value as DraftLeaf["kind"])} style={selStyle}>
                <option value="price">가격</option>
                <option value="rank">순위</option>
            </select>
            {leaf.kind === "price" && (
                <>
                    <OpSelect op={leaf.op} onChange={(op) => onPatch({ ...leaf, op })} />
                    <input
                        style={{ ...numStyle, width: 84, ...(active ? { color: "var(--accent-primary)", fontWeight: 600 } : {}) }}
                        className="tabular"
                        value={leaf.value}
                        onChange={(e) => onPatch({ ...leaf, value: e.target.value })}
                        onFocus={onFocusPrice}
                        placeholder="원"
                        title="절대가격(원) — 포커스 후 실시간 차트(일봉·분봉) 좌클릭으로 입력"
                    />
                    <span style={{ color: "var(--text-tertiary)" }}>원</span>
                    {active && <span style={{ fontSize: 11, color: "var(--accent-primary)", flexShrink: 0 }}>← 차트 클릭</span>}
                </>
            )}
            {leaf.kind === "rank" && (
                <>
                    <select value={leaf.theme} onChange={(e) => onPatch({ ...leaf, theme: e.target.value })} style={selStyle} title={themes.length ? "테마 선택" : "테마 미배정 — 보드 우클릭으로 배정 후"}>
                        <option value="">테마</option>
                        {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <MarketSelect market={leaf.market} onChange={(m) => onPatch({ ...leaf, market: m })} />
                    <select value={leaf.mode} onChange={(e) => onPatch({ ...leaf, mode: e.target.value as "reach" | "delta" })} style={selStyle}>
                        <option value="reach">도달 ≤</option>
                        <option value="delta">상승 ≥</option>
                    </select>
                    <input style={numStyle} className="tabular" value={leaf.threshold} onChange={(e) => onPatch({ ...leaf, threshold: e.target.value })} placeholder={leaf.mode === "reach" ? "K위" : "D계단"} />
                </>
            )}
            <button style={{ ...miniBtn("var(--text-tertiary)"), marginLeft: "auto", flexShrink: 0, fontSize: 12, visibility: canRemove ? "visible" : "hidden" }} onClick={onRemove} title="이 조건 삭제">✕</button>
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

const numStyle: React.CSSProperties = { width: 62, fontSize: 12, padding: "2px 5px", color: "var(--text-primary)", background: "transparent", border: "none", borderBottom: "1px solid var(--border-default)", outline: "none", textAlign: "right" };
const selStyle: React.CSSProperties = { fontSize: 12, padding: "2px 4px", color: "var(--text-primary)", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 4 };

function kstTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
