import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { simulateTargetStop, type Excursion } from "./rank/pathStats.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { useWorkbench } from "../store/workbench.js";
import type { RankPoint } from "../api/rank.js";
import type { RankPointPath } from "../api/rankPaths.js";

// 분석 결과 대시보드 — 배치 보드에서 우클릭으로 건 밴드(store)를 소비만 한다(밴드 UI 없음).
//  · 밴드 AND 교집합(useRankFilterResult) → 밀도 히트맵(시간×정규화%, 진입 전 궤적 포함) + 목표/손절 첫터치 시뮬 + 분할 MAE 산점.
//  · horizon = 진입 후 crop 분(숫자입력 or 히트맵 세로선 드래그). 버킷 = 히트맵 칸 폭(1/5/10분). 목표/손절선도 드래그.
//  · 겹치는 선 대신 밀도(겹칠수록 진함)로 "무리"를 본다. 진입 전(음수 t)은 맥락용(MFE/MAE·시뮬엔 미포함).

const UP = "#1baf7a";
const DOWN = "#eb6834";
const GREEN = "#1baf7a";
const RED = "#e24b4a";
const BLUE = "#2a78d6";

const parsePk = (s: string): RankPoint => { const [stockCode, date, time] = s.split("|"); return { stockCode, date, time }; };
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

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
                                <SectionLabel>밀도 히트맵 — 진입 대비 경과분 × 진입가 대비 %. 진할수록 그 시각·가격대를 지난 상황이 많음. 파선=진입(t0), 세로선=horizon, 초록=목표·빨강=손절(드래그).</SectionLabel>
                                <Heatmap paths={r.paths} horizon={rankHorizon} dataMinT={r.dataMinT} dataMaxT={r.dataMaxT || 1} bucket={rankBucket} setHorizon={setRankHorizon}
                                    target={target} stop={stop} setTarget={setTarget} setStop={setStop} />
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

// ── 밀도 히트맵 + 드래그 horizon/목표/손절선 (진입 전 궤적 포함, 버킷 칸 폭) ──
const HW = 620, HH = 280, HmL = 42, HmR = 12, HmT = 8, HmB = 22;
const ROWS = 48;

function Heatmap({ paths, horizon, dataMinT, dataMaxT, bucket, setHorizon, target, stop, setTarget, setStop }: {
    paths: RankPointPath[]; horizon: number; dataMinT: number; dataMaxT: number; bucket: number; setHorizon: (m: number) => void;
    target: number; stop: number; setTarget: (v: number) => void; setStop: (v: number) => void;
}): JSX.Element {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [drag, setDrag] = useState<null | "h" | "t" | "s">(null);

    const tMin = Math.min(0, dataMinT);
    const tMax = Math.max(1, dataMaxT);
    const span = tMax - tMin || 1;

    // 열 = 버킷 분 단위. 셀은 경로·버킷에만 의존.
    const heat = useMemo(() => {
        const cols = Math.floor(span / bucket) + 1;
        let yLo = -1, yHi = 1;
        for (const p of paths) for (const b of p.bars) { if (b.low < yLo) yLo = b.low; if (b.high > yHi) yHi = b.high; }
        yLo = Math.floor(yLo - 0.5); yHi = Math.ceil(yHi + 0.5);
        const grid: number[][] = Array.from({ length: cols }, () => new Array(ROWS).fill(0));
        let max = 0;
        const rowOf = (v: number): number => clamp(Math.floor((v - yLo) / (yHi - yLo) * ROWS), 0, ROWS - 1);
        for (const p of paths) for (const b of p.bars) {
            const c = clamp(Math.floor((b.t - tMin) / bucket), 0, cols - 1);
            const r0 = rowOf(b.low), r1 = rowOf(b.high);
            for (let r = r0; r <= r1; r++) { grid[c][r]++; if (grid[c][r] > max) max = grid[c][r]; }
        }
        return { grid, max, yLo, yHi, cols };
    }, [paths, bucket, tMin, span]);

    const plotW = HW - HmL - HmR, plotH = HH - HmT - HmB;
    const X = (t: number): number => HmL + ((t - tMin) / span) * plotW;
    const Y = (v: number): number => HmT + (1 - (v - heat.yLo) / (heat.yHi - heat.yLo)) * plotH;
    const invX = (vx: number): number => tMin + ((vx - HmL) / plotW) * span;
    const invY = (vy: number): number => heat.yLo + (1 - (vy - HmT) / plotH) * (heat.yHi - heat.yLo);

    useEffect(() => {
        if (!drag) return;
        const move = (e: PointerEvent): void => {
            const svg = svgRef.current;
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            if (drag === "h") setHorizon(clamp(invX((e.clientX - rect.left) * (HW / rect.width)), 1, dataMaxT));
            else {
                const v = invY((e.clientY - rect.top) * (HH / rect.height));
                if (drag === "t") setTarget(clamp(Math.round(v * 2) / 2, 0.5, heat.yHi));
                else setStop(clamp(Math.round(v * 2) / 2, heat.yLo, -0.5));
            }
        };
        const up = (): void => setDrag(null);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    }, [drag, dataMaxT, tMin, span, heat.yLo, heat.yHi, setHorizon, setTarget, setStop]);

    const cells = useMemo(() => {
        const cw = plotW / heat.cols, ch = plotH / ROWS;
        const els: JSX.Element[] = [];
        for (let c = 0; c < heat.cols; c++) for (let r = 0; r < ROWS; r++) {
            const d = heat.grid[c][r];
            if (!d) continue;
            const op = Math.pow(d / heat.max, 0.7) * 0.85;
            els.push(<rect key={`${c}_${r}`} x={(HmL + c * cw).toFixed(1)} y={(HmT + (ROWS - 1 - r) * ch).toFixed(1)} width={(cw + 0.6).toFixed(1)} height={(ch + 0.6).toFixed(1)} fill={BLUE} fillOpacity={op.toFixed(3)} />);
        }
        return els;
    }, [heat, plotW, plotH]);

    const hX = X(Math.min(horizon, dataMaxT));
    const eX = X(0); // 진입(t0)
    const yg = ticks(heat.yLo, heat.yHi);
    const xg = [tMin, 0, Math.round(tMax / 2), tMax].filter((t, i, a) => a.indexOf(t) === i);

    return (
        <svg ref={svgRef} viewBox={`0 0 ${HW} ${HH}`} width="100%" role="img" aria-label="경로 밀도 히트맵(진입 전 포함)과 목표·손절·horizon 선" style={{ display: "block", touchAction: "none" }}>
            {cells}
            {yg.map((v) => (
                <g key={v}>
                    <line x1={HmL} y1={Y(v)} x2={HW - HmR} y2={Y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} strokeOpacity={0.6} />
                    <text x={HmL - 5} y={Y(v) + 3} textAnchor="end" fontSize={9.5} fill="var(--text-tertiary)">{v > 0 ? "+" : ""}{v}%</text>
                </g>
            ))}
            <line x1={HmL} y1={Y(0)} x2={HW - HmR} y2={Y(0)} stroke="var(--text-tertiary)" strokeWidth={1} />
            {xg.map((t) => <text key={t} x={clamp(X(t), HmL + 8, HW - HmR - 8)} y={HH - 6} textAnchor="middle" fontSize={9.5} fill="var(--text-tertiary)">{t === 0 ? "진입" : `${t}분`}</text>)}

            {/* 진입(t0) 파선 */}
            <line x1={eX} y1={HmT} x2={eX} y2={HmT + plotH} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="3 3" />

            {/* horizon 오른쪽 dim + 드래그 세로선 */}
            <rect x={hX} y={HmT} width={Math.max(0, HW - HmR - hX)} height={plotH} fill="var(--bg-primary)" fillOpacity={0.5} pointerEvents="none" />
            <line x1={hX} y1={HmT} x2={hX} y2={HmT + plotH} stroke="var(--text-secondary)" strokeWidth={1.5} />
            <rect x={hX - 5} y={HmT} width={10} height={plotH} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={() => setDrag("h")} />

            {/* 목표(초록)·손절(빨강) 드래그 가로선 */}
            <line x1={HmL} y1={Y(target)} x2={HW - HmR} y2={Y(target)} stroke={GREEN} strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={HW - HmR} y={Y(target) - 4} textAnchor="end" fontSize={10} fill={GREEN}>목표 +{target.toFixed(1)}%</text>
            <rect x={HmL} y={Y(target) - 5} width={plotW} height={10} fill="transparent" style={{ cursor: "ns-resize" }} onPointerDown={() => setDrag("t")} />
            <line x1={HmL} y1={Y(stop)} x2={HW - HmR} y2={Y(stop)} stroke={RED} strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={HW - HmR} y={Y(stop) + 12} textAnchor="end" fontSize={10} fill={RED}>손절 {stop.toFixed(1)}%</text>
            <rect x={HmL} y={Y(stop) - 5} width={plotW} height={10} fill="transparent" style={{ cursor: "ns-resize" }} onPointerDown={() => setDrag("s")} />
        </svg>
    );
}

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
