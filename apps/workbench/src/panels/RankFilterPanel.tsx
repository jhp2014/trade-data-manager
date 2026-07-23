import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { simulateTargetStop, type Excursion } from "./rank/pathStats.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { RankHeatmapChart, type HeatOverlay } from "./RankHeatmapChart.js";
import { chartQuery } from "../api/queries.js";
import { deriveMinuteView } from "../lib/derive.js";
import { useWorkbench } from "../store/workbench.js";
import type { RankPoint } from "../api/rank.js";

// 분석 결과 대시보드 — 배치 보드에서 우클릭으로 건 밴드(store)를 소비만 한다(밴드 UI 없음).
//  · 밴드 AND 교집합(useRankFilterResult) → 밀도 히트맵(시간×정규화%, 진입 전 궤적 포함) + 목표/손절 첫터치 시뮬 + 분할 MAE 산점.
//  · horizon = 진입 후 crop 분(숫자입력 or 히트맵 세로선 드래그). 버킷 = 히트맵 칸 폭(1/5/10분). 목표/손절선도 드래그.
//  · 겹치는 선 대신 밀도(겹칠수록 진함)로 "무리"를 본다. 진입 전(음수 t)은 맥락용(MFE/MAE·시뮬엔 미포함).

const UP = "#1baf7a";
const DOWN = "#eb6834";
const GREEN = "#1baf7a";
const RED = "#e24b4a";

const parsePk = (s: string): RankPoint => { const [stockCode, date, time] = s.split("|"); return { stockCode, date, time }; };
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const hmsToMin = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

// 선택 종목(activePoint) 오버레이 — 포커스 종목 차트에서 실%(전일종가 대비) 경로 파생. 진입 기준 정규화·실% 어파인.
function useSelectedOverlay(nameOf: (c: string) => string): HeatOverlay | null {
    const activePoint = useWorkbench((s) => s.activePoint);
    const q = useQuery(chartQuery(activePoint?.code ?? "", activePoint?.date ?? ""));
    return useMemo(() => {
        if (!activePoint || !q.data) return null;
        const mv = deriveMinuteView(q.data, "un");
        if (mv.points.length === 0) return null;
        const entryMin = hmsToMin(activePoint.time);
        const entry = mv.points.find((p) => hmsToMin(p.tradeTime) >= entryMin);
        if (!entry) return null;
        const k = 1 + entry.close / 100; // entry.close = 진입 실%(전일종가 대비) → 어파인 기울기
        return {
            name: nameOf(activePoint.code), k, entryMin,
            pts: mv.points.map((p) => ({ t: hmsToMin(p.tradeTime) - entryMin, open: p.open, high: p.high, low: p.low, close: p.close, amount: p.amount, cumAmount: p.cumAmount })),
        };
    }, [activePoint, q.data, nameOf]);
}

export function RankFilterPanel(): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const rankHorizon = useWorkbench((s) => s.rankHorizon);
    const setRankHorizon = useWorkbench((s) => s.setRankHorizon);
    const rankBucket = useWorkbench((s) => s.rankBucket);
    const setRankBucket = useWorkbench((s) => s.setRankBucket);
    const clearRankFilter = useWorkbench((s) => s.clearRankFilter);

    const r = useRankFilterResult();
    const n = r.stats.excursions.length;

    const [target, setTarget] = useState(5);
    const [stop, setStop] = useState(-3);
    const sim = useMemo(() => simulateTargetStop(r.paths, r.effHorizon, target, stop), [r.paths, r.effHorizon, target, stop]);
    const overlay = useSelectedOverlay(r.nameOf);

    const goKey = (key: string): void => { const p = parsePk(key); goToPoint({ date: p.date, code: p.stockCode, time: p.time }, "rank-filter"); };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--text-secondary)" }}>
                    horizon
                    <input type="number" min={1} value={Math.round(r.effHorizon)} onChange={(e) => setRankHorizon(Number(e.target.value) || 1)}
                        style={{ width: 54, border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "2px 5px", fontSize: 12, textAlign: "right" }} />
                    분
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--text-secondary)" }}>
                    버킷
                    {[1, 5, 10].map((b) => (
                        <button key={b} onClick={() => setRankBucket(b)}
                            style={{ border: `1px solid ${rankBucket === b ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 4, background: rankBucket === b ? "var(--accent-soft)" : "transparent", color: rankBucket === b ? "var(--accent-primary)" : "var(--text-secondary)", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}>{b}분</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 14, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                    <Metric label="N" value={String(n)} />
                    <Metric label="coverage" value={`${n}/${r.coverage}`} />
                    <Metric label="중앙 MFE" value={r.stats.medianMfe == null ? "—" : `+${r.stats.medianMfe.toFixed(1)}%`} color={UP} />
                    <Metric label="MAE 전" value={r.stats.medianMaePre == null ? "—" : `${r.stats.medianMaePre.toFixed(1)}%`} color={DOWN} />
                    <Metric label="MAE 후" value={r.stats.medianMaePost == null ? "—" : `${r.stats.medianMaePost.toFixed(1)}%`} color={DOWN} />
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {r.isEmpty ? (
                    <div style={{ ...muted, padding: "24px 14px" }}>배치 보드에서 축의 스팟을 <b>우클릭</b>해 이상/이하 경계를 지정하면, 그 조건에 맞는 상황들의 진입 후 경로 분포가 여기 나옵니다.</div>
                ) : (
                    <>
                        <div style={{ padding: "6px 12px 2px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {r.activeAxisNames.map((nm) => <span key={nm} style={chip}>{nm}</span>)}
                            <button onClick={clearRankFilter} style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11.5 }}>필터 전체 해제</button>
                        </div>
                        {r.isLoading ? (
                            <div style={muted}>경로 불러오는 중…</div>
                        ) : n === 0 ? (
                            <div style={{ ...muted, padding: "20px 14px" }}>이 조건에 맞는 타점이 없습니다{r.coverage > 0 ? ` (활성 축 전부 배치 ${r.coverage}건 중 밴드 교집합 0).` : " — 활성 축 전부에 배치된 타점이 없습니다(strict AND)."}</div>
                        ) : (
                            <div style={{ padding: "4px 12px 16px" }}>
                                {n < 8 && <div style={{ fontSize: 11.5, color: RED, marginBottom: 6 }}>⚠ 표본 {n}건 — 분포가 노이즈일 수 있습니다.</div>}
                                <SectionLabel>밀도 히트맵 — 진입 대비 경과분 × 진입가 대비 %. 진할수록 그 시각·가격대를 지난 상황이 많음. 축 여백 라벨을 끌어 목표/손절/horizon 조정. 보라선=선택 종목(좌측축=실%). 휠/드래그 줌·팬·교차선.</SectionLabel>
                                <RankHeatmapChart paths={r.paths} horizon={rankHorizon} dataMinT={r.dataMinT} dataMaxT={r.dataMaxT || 1} bucket={rankBucket} setHorizon={setRankHorizon}
                                    target={target} stop={stop} setTarget={setTarget} setStop={setStop} overlay={overlay} />
                                <SimReadout win={sim.win} loss={sim.loss} none={sim.none} total={sim.total} expR={sim.expR} target={target} stop={stop} />
                                <div style={{ height: 14 }} />
                                <SectionLabel>분할 MAE — 최대상승(MFE) ↔ 고점 전 최저(진입 손절) / 고점 후 최저(트레일링). 점=상황(클릭=이동).</SectionLabel>
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    <MaeScatter title="MFE ↔ 고점 전 최저" excursions={r.stats.excursions} xOf={(e) => e.maePre} nameOf={r.nameOf} onGo={goKey} />
                                    <MaeScatter title="MFE ↔ 고점 후 최저" excursions={r.stats.excursions} xOf={(e) => e.maePost} nameOf={r.nameOf} onGo={goKey} />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const muted: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "10px 12px" };
const chip: CSSProperties = { fontSize: 11.5, padding: "2px 9px", borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-primary)" };

function Metric({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
    return (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: color ?? "var(--text-primary)" }}>{value}</span>
        </span>
    );
}

const SectionLabel = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "0 0 4px" }}>{children}</div>
);

function SimReadout({ win, loss, none, total, expR, target, stop }: { win: number; loss: number; none: number; total: number; expR: number; target: number; stop: number }): JSX.Element {
    const pct = (v: number): string => (total ? Math.round((v / total) * 100) : 0) + "%";
    const cell = (c: string, label: string, val: string): JSX.Element => (
        <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 8, padding: "7px 10px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>{val}</div>
        </div>
    );
    return (
        <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 5 }}>첫 터치 시뮬(고가/저가) — 목표 +{target.toFixed(1)}% · 손절 {stop.toFixed(1)}% · 같은 바 동시=손절 보수처리</div>
            <div style={{ display: "flex", gap: 8 }}>
                {cell(GREEN, "익절 먼저", pct(win))}
                {cell(RED, "손절 먼저", pct(loss))}
                {cell("var(--text-tertiary)", "미도달", pct(none))}
                {cell("var(--text-primary)", "기대값", (expR >= 0 ? "+" : "") + expR.toFixed(2) + "R")}
            </div>
        </div>
    );
}

// ── 분할 MAE 산점 (x=최저 %, y=MFE) ─────────────────────────────────────────
const SW = 300, SH = 190, SmL = 34, SmR = 8, SmT = 8, SmB = 24;

function MaeScatter({ title, excursions, xOf, nameOf, onGo }: {
    title: string; excursions: Excursion[]; xOf: (e: Excursion) => number; nameOf: (c: string) => string; onGo: (key: string) => void;
}): JSX.Element {
    const xs = excursions.map(xOf);
    const xMin = Math.min(-1, Math.floor(Math.min(...xs, 0) - 0.5));
    const yMax = Math.max(1, Math.ceil(Math.max(...excursions.map((e) => e.mfe), 0) + 0.5));
    const plotW = SW - SmL - SmR, plotH = SH - SmT - SmB;
    const X = (v: number): number => SmL + (v - xMin) / (0 - xMin) * plotW;
    const Y = (v: number): number => SmT + (1 - v / yMax) * plotH;
    return (
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>{title}</div>
            <svg viewBox={`0 0 ${SW} ${SH}`} width="100%" role="img" aria-label={title} style={{ display: "block" }}>
                {ticks(xMin, 0).map((v) => (
                    <g key={`x${v}`}>
                        <line x1={X(v)} y1={SmT} x2={X(v)} y2={SH - SmB} stroke="var(--border-subtle)" strokeWidth={0.5} strokeOpacity={0.6} />
                        <text x={X(v)} y={SH - 10} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)">{v}%</text>
                    </g>
                ))}
                {ticks(0, yMax).map((v) => (
                    <g key={`y${v}`}>
                        <line x1={SmL} y1={Y(v)} x2={SW - SmR} y2={Y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} strokeOpacity={0.6} />
                        <text x={SmL - 4} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{v > 0 ? "+" : ""}{v}</text>
                    </g>
                ))}
                {excursions.map((e) => (
                    <circle key={e.key} cx={X(clamp(xOf(e), xMin, 0))} cy={Y(clamp(e.mfe, 0, yMax))} r={4} fill={e.up ? UP : DOWN} fillOpacity={0.72} style={{ cursor: "pointer" }} onClick={() => onGo(e.key)}>
                        <title>{nameOf(e.key.split("|")[0])} · 최저 {xOf(e).toFixed(1)}% / MFE +{e.mfe.toFixed(1)}%</title>
                    </circle>
                ))}
            </svg>
        </div>
    );
}

/** 축 눈금(정수). */
function ticks(lo: number, hi: number): number[] {
    const span = hi - lo || 1;
    const step = span <= 8 ? 2 : span <= 20 ? 5 : 10;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
}
