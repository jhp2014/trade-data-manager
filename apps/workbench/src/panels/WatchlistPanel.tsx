import { useId, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LiveStock } from "@trade-data-manager/wire";
import { useLiveSnapshot } from "../api/live.js";
import { fetchWatchlist, addWatch, removeWatch, createAlertRule, deleteAlertRule, type AlertRuleView, type AlertFiring, type CreateRulePayload } from "../api/alerts.js";
import { useWorkbench } from "../store/workbench.js";
import { useStockName } from "../lib/useStockName.js";
import { StockRow } from "../components/board/StockRow.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { liveToBoardStock } from "../lib/boardViewModel.js";

// 타겟(watchlist) 패널 — 실시간 플레인. 스캔에서 승격한 선택 종목을 항상 폴링·표시하고(2층 구조),
// 종목별 알람 룰(가격 밴드/테마 순위, AND)을 편집한다. 발화는 텔레그램+서버, 최근 발화는 하단 로그.
// 시세 행 = SSE 스냅샷(watched 플래그), 룰·발화 = /live/watchlist 5초 폴링(react-query).
const WATCHLIST_KEY = ["live-watchlist"];

export function WatchlistPanel(): JSX.Element {
    const { snapshot, error } = useLiveSnapshot();
    const focusCode = useWorkbench((s) => s.liveFocus.code);
    const setCode = useWorkbench((s) => s.setLiveCode);
    const market = useWorkbench((s) => s.boardMarket.live); // 시세 행 % 기준 — 실시간 보드와 동일 토글 공유
    const originId = useId();
    const qc = useQueryClient();
    const [codeInput, setCodeInput] = useState("");
    const [ruleFormCode, setRuleFormCode] = useState<string | null>(null); // 룰 추가 폼이 열린 종목

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

    if (view.isLoading) return <BoardCenter text="타겟 로딩중…" />;
    if (view.isError) return <BoardCenter text={`오류: ${(view.error as Error).message} — apps/live 서버 확인`} />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            {/* 헤더 — 점·건수 + 종목 추가(포커스 승격 / 코드 입력) */}
            <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} />
                <span style={{ color: "var(--plane-live)" }}>타겟</span>
                <span className="tabular">{codes.length}종목</span>
                {error && <span style={{ color: "var(--rise)" }}>연결 오류</span>}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                    {focusCode && !codes.includes(focusCode) && (
                        <button className="icon-btn" onClick={() => submitAdd(focusCode)} title={`포커스 종목을 타겟으로 승격`} style={{ fontSize: 11, width: "auto", padding: "0 4px" }}>
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

            {/* 본문 — 종목별 섹션(시세 행 + 룰들) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {codes.length === 0 && <BoardCenter text="타겟 없음 — 실시간 보드에서 종목 클릭 후 + 로 승격" />}
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
                                    <RuleForm
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
                                        <button style={miniBtn("var(--accent-primary)")} onClick={() => setRuleFormCode(code)}>+ 룰</button>
                                        <button style={miniBtn("var(--text-tertiary)")} onClick={() => removeM.mutate(code)} title="타겟 해제(룰 함께 삭제)">해제</button>
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

/** 룰 한 줄 요약 + 상태 점 + 삭제. */
function RuleLine({ rule, onDelete }: { rule: AlertRuleView; onDelete: () => void }): JSX.Element {
    const parts: string[] = [];
    if (rule.band) {
        const lo = rule.band.lowerPct == null ? "-∞" : `${sign(rule.band.lowerPct)}${rule.band.lowerPct}%`;
        const hi = rule.band.upperPct == null ? "+∞" : `${sign(rule.band.upperPct)}${rule.band.upperPct}%`;
        parts.push(`밴드 [${lo}, ${hi}] @${rule.band.baseline.toLocaleString("ko-KR")}`);
    }
    if (rule.rank) parts.push(`${rule.rank.theme} ${rule.rank.mode === "reach" ? `${rule.rank.threshold}위 도달` : `↑${rule.rank.threshold}계단`}`);
    if (rule.note) parts.push(rule.note);
    // 상태 점 — 조건 안(주황 solid)=재무장 대기 / 무장(회색 테두리)=다음 진입에 발화 / 미평가(옅음).
    const dot = rule.inZone == null ? { border: "1px solid var(--border-default)" } : rule.inZone ? { background: "#e07b1a" } : { border: "1px solid var(--text-tertiary)" };
    const title = rule.inZone == null ? "평가 전" : rule.inZone ? "조건 안(재무장 대기)" : "무장 — 다음 진입에 발화";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <span title={title} style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, ...dot }} />
            <span className="tabular" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parts.join(" · ")}</span>
            {rule.lastFiredAt != null && <span className="tabular" style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>발화 {kstTime(rule.lastFiredAt)}</span>}
            <button style={{ ...miniBtn("var(--text-tertiary)"), marginLeft: "auto", flexShrink: 0 }} onClick={onDelete} title="룰 삭제">✕</button>
        </div>
    );
}

function FiringLine({ f }: { f: AlertFiring }): JSX.Element {
    const { price, changeRate, baselinePct, themeRank, themeRankDelta } = f.features;
    const bits = [`${price.toLocaleString("ko-KR")}원 ${sign(changeRate)}${changeRate.toFixed(2)}%`];
    if (baselinePct != null) bits.push(`기준가 ${sign(baselinePct)}${baselinePct.toFixed(2)}%`);
    if (themeRank != null) bits.push(`테마 ${themeRank}위${themeRankDelta != null ? `(↑${themeRankDelta})` : ""}`);
    if (f.note) bits.push(f.note);
    return (
        <div style={{ display: "flex", gap: 6, padding: "3px 10px", fontSize: 11, borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="tabular" style={{ flexShrink: 0, color: "var(--accent-primary)" }}>{kstTime(f.at)}</span>
            <span style={{ flexShrink: 0, fontWeight: 600, color: "var(--text-primary)" }}>{f.name || f.code}</span>
            <span className="tabular" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{bits.join(" · ")}</span>
        </div>
    );
}

/** 룰 추가 폼 — 밴드(빈=무제한)·순위(테마 있을 때만)·쿨다운·메모. 서버가 baseline 해소(폴백=현재가). */
function RuleForm({ code, themes, currentPrice, onClose, onSaved }: {
    code: string;
    themes: string[];
    currentPrice?: number;
    onClose: () => void;
    onSaved: () => void;
}): JSX.Element {
    const [lower, setLower] = useState("");
    const [upper, setUpper] = useState("");
    const [theme, setTheme] = useState("");
    const [mode, setMode] = useState<"reach" | "delta">("reach");
    const [threshold, setThreshold] = useState("");
    const [cooldownMin, setCooldownMin] = useState("3");
    const [note, setNote] = useState("");
    const [err, setErr] = useState<string | null>(null);

    const saveM = useMutation({
        mutationFn: createAlertRule,
        onSuccess: onSaved,
        onError: (e: Error) => setErr(e.message),
    });

    const submit = (): void => {
        setErr(null);
        const band = lower !== "" || upper !== ""
            ? { lowerPct: lower === "" ? null : Number(lower), upperPct: upper === "" ? null : Number(upper) }
            : undefined;
        const rank = theme && threshold !== ""
            ? { theme, mode, threshold: Number(threshold) }
            : undefined;
        if (!band && !rank) {
            setErr("밴드(하단/상단) 또는 순위(테마+임계) 중 하나는 채워야 함");
            return;
        }
        const payload: CreateRulePayload = {
            code,
            band,
            rank,
            cooldownMs: cooldownMin === "" ? undefined : Math.round(Number(cooldownMin) * 60_000),
            note: note.trim() || undefined,
            baseline: currentPrice,
        };
        saveM.mutate(payload);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 8px", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6, fontSize: 11 }}>
            <Row label="밴드 %">
                <input style={numStyle} className="tabular" value={lower} onChange={(e) => setLower(e.target.value)} placeholder="하단(빈=∞)" title="baseline 대비 % — 예: -3. 비우면 무제한" />
                <span style={{ color: "var(--text-tertiary)" }}>~</span>
                <input style={numStyle} className="tabular" value={upper} onChange={(e) => setUpper(e.target.value)} placeholder="상단(빈=∞)" title="baseline 대비 % — 예: 5. 비우면 무제한" />
                {currentPrice != null && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>@{currentPrice.toLocaleString("ko-KR")}</span>}
            </Row>
            <Row label="순위">
                <select value={theme} onChange={(e) => setTheme(e.target.value)} style={selStyle} title={themes.length ? "테마 선택" : "테마 미배정 — 우클릭으로 배정 후 사용"}>
                    <option value="">테마 없음</option>
                    {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={mode} onChange={(e) => setMode(e.target.value as "reach" | "delta")} style={selStyle} disabled={!theme}>
                    <option value="reach">도달(≤K위)</option>
                    <option value="delta">상승(≥D계단)</option>
                </select>
                <input style={numStyle} className="tabular" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={mode === "reach" ? "K" : "D"} disabled={!theme} />
            </Row>
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
