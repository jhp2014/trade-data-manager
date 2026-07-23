import { useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { rankAxesQuery, axisLineQuery, allPointsQuery, rankPathsQuery } from "../api/queries.js";
import { filterPoints, type AxisBand } from "./rank/bandFilter.js";
import { computePathStats, type PathStats, type Excursion } from "./rank/pathStats.js";
import { useWorkbench } from "../store/workbench.js";
import type { PlacedPoint, RankAxis } from "@trade-data-manager/wire";
import type { RankPoint } from "../api/rank.js";

// 순위 필터 + 진입 후 경로분포 — 축별 밴드(슬롯 앵커)를 AND 로 걸어 유사 상황을 좁히고, 그 집합의
// 인트라데이 경로를 리본(중앙값+25~75%)·MAE↔MFE 산점으로 본다. horizon 은 클라 crop(기본 종가까지).
//  · 밴드 = 각 축 줄에서 슬롯 2개(또는 1개) 클릭 → orderKey 구간. 배치는 순위 배치 패널에서.
//  · N/coverage 를 1급으로 노출 — 교집합 희소성이 확률 신뢰도를 정한다.

const UP = "#1baf7a";
const DOWN = "#eb6834";
const TIE = "#7a869c";
const PAD = 12; // 슬롯 줄 좌우 여백(px)

interface Slot { slotId: string; orderKey: number; count: number; firstCode: string; }
const parsePk = (s: string): RankPoint => { const [stockCode, date, time] = s.split("|"); return { stockCode, date, time }; };
const slotFrac = (i: number, n: number): number => (n <= 1 ? 0.5 : i / (n - 1));

function assembleSlots(placed: PlacedPoint[]): Slot[] {
    const m = new Map<string, Slot>();
    for (const p of placed) {
        const s = m.get(p.slotId);
        if (s) s.count++;
        else m.set(p.slotId, { slotId: p.slotId, orderKey: p.orderKey, count: 1, firstCode: p.stockCode });
    }
    return [...m.values()].sort((a, b) => a.orderKey - b.orderKey);
}

const HORIZONS: Array<{ label: string; v: number }> = [
    { label: "30분", v: 30 },
    { label: "60분", v: 60 },
    { label: "90분", v: 90 },
    { label: "종가", v: Infinity },
];

export function RankFilterPanel(): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const axesQ = useQuery(rankAxesQuery());
    const axes = useMemo(() => axesQ.data ?? [], [axesQ.data]);

    const lineQs = useQueries({ queries: axes.map((a) => axisLineQuery(a.id)) });
    const linesByAxis = useMemo(() => {
        const m = new Map<string, PlacedPoint[]>();
        axes.forEach((a, i) => m.set(a.id, lineQs[i]?.data ?? []));
        return m;
    }, [axes, lineQs]);
    const slotsByAxis = useMemo(() => {
        const m = new Map<string, Slot[]>();
        for (const [id, line] of linesByAxis) m.set(id, assembleSlots(line));
        return m;
    }, [linesByAxis]);

    const pointsQ = useQuery(allPointsQuery());
    const nameOf = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        return (code: string): string => m.get(code) ?? code;
    }, [pointsQ.data]);

    // 밴드 선택 — 축별 선택 슬롯 0~2개(슬롯 클릭 순환). 1개면 단일 슬롯 밴드.
    const [selected, setSelected] = useState<Record<string, string[]>>({});
    const clickSlot = (axisId: string, slotId: string): void =>
        setSelected((s) => {
            const cur = s[axisId] ?? [];
            const next = cur.length === 0 ? [slotId] : cur.length === 1 ? (cur[0] === slotId ? [] : [cur[0], slotId]) : [slotId];
            return { ...s, [axisId]: next };
        });
    const clearAxis = (axisId: string): void => setSelected((s) => { const n = { ...s }; delete n[axisId]; return n; });

    const bands: AxisBand[] = useMemo(
        () =>
            axes.flatMap((ax) => {
                const sel = selected[ax.id] ?? [];
                if (sel.length === 0) return [];
                const slots = slotsByAxis.get(ax.id) ?? [];
                const oks = sel.map((id) => slots.find((s) => s.slotId === id)?.orderKey).filter((x): x is number => x != null);
                if (oks.length === 0) return [];
                return [{ axisId: ax.id, from: Math.min(...oks), to: Math.max(...oks) }];
            }),
        [axes, selected, slotsByAxis],
    );

    const { points, coverage } = useMemo(() => filterPoints(linesByAxis, bands), [linesByAxis, bands]);
    const pathsQ = useQuery(rankPathsQuery(points));

    const [horizon, setHorizon] = useState<number>(Infinity);
    const stats = useMemo(() => computePathStats(pathsQ.data ?? [], horizon), [pathsQ.data, horizon]);
    const n = stats.excursions.length;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>
            {/* 헤더 — horizon + 요약 지표 */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 3 }}>
                    {HORIZONS.map((h) => (
                        <button key={h.label} onClick={() => setHorizon(h.v)} title="진입 후 구간(클라 crop)"
                            style={{ border: `1px solid ${horizon === h.v ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 4, background: horizon === h.v ? "var(--accent-soft)" : "transparent", color: horizon === h.v ? "var(--accent-primary)" : "var(--text-secondary)", cursor: "pointer", fontSize: 11.5, padding: "3px 8px" }}>{h.label}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 14, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                    <Metric label="N" value={String(n)} />
                    <Metric label="coverage" value={`${n}/${coverage}`} />
                    <Metric label="중앙 MFE" value={stats.medianMfe == null ? "—" : `+${stats.medianMfe.toFixed(1)}%`} color={UP} />
                    <Metric label="중앙 MAE" value={stats.medianMae == null ? "—" : `${stats.medianMae.toFixed(1)}%`} color={DOWN} />
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {/* 축 밴드 선택 */}
                <div style={{ padding: "4px 0" }}>
                    {axesQ.isLoading && <div style={muted}>불러오는 중…</div>}
                    {!axesQ.isLoading && axes.length === 0 && <div style={muted}>축이 없습니다 — 순위 배치 패널에서 축을 만들고 타점을 배치하세요.</div>}
                    {axes.map((ax) => (
                        <AxisBandRow key={ax.id} axis={ax} slots={slotsByAxis.get(ax.id) ?? []} selected={selected[ax.id] ?? []}
                            nameOf={nameOf} onClickSlot={(sid) => clickSlot(ax.id, sid)} onClear={() => clearAxis(ax.id)} />
                    ))}
                </div>

                {/* 결과 */}
                {bands.length === 0 ? (
                    <div style={{ ...muted, padding: "20px 12px" }}>축에 밴드를 걸면(슬롯 2개 클릭) 유사 상황이 좁혀지고, 그 집합의 진입 후 경로 분포가 여기 나옵니다.</div>
                ) : n === 0 ? (
                    <div style={{ ...muted, padding: "20px 12px" }}>이 조건에 맞는 타점이 없습니다{coverage > 0 ? ` (활성 축 전부에 배치된 타점 ${coverage}건 중 밴드 교집합 0).` : " — 활성 축 전부에 배치된 타점이 없습니다(strict AND)."}</div>
                ) : (
                    <div style={{ padding: "6px 12px 16px" }}>
                        {n < 8 && <div style={{ fontSize: 11.5, color: DOWN, marginBottom: 8 }}>⚠ 표본 {n}건 — 분포가 노이즈일 수 있습니다.</div>}
                        <SectionLabel>진입 후 경과분 → 진입가 대비 % · 굵은 선 = 중앙값, 띠 = 25–75%</SectionLabel>
                        <RibbonChart stats={stats} />
                        <div style={{ height: 14 }} />
                        <SectionLabel>최대낙폭(MAE) ↔ 최대상승(MFE) · 점 = 상황(클릭 = 이동)</SectionLabel>
                        <ScatterChart excursions={stats.excursions} nameOf={nameOf} onGo={(k) => { const p = parsePk(k); goToPoint({ date: p.date, code: p.stockCode, time: p.time }, "rank-filter"); }} />
                    </div>
                )}
            </div>
        </div>
    );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
    return (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: color ?? "var(--text-primary)" }}>{value}</span>
        </span>
    );
}

const SectionLabel = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{children}</div>
);

const muted: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "10px 12px" };

// ── 축 한 줄: 이름 + 슬롯 줄(클릭해 밴드 지정) + 초기화 ──────────────────────
function AxisBandRow({ axis, slots, selected, nameOf, onClickSlot, onClear }: {
    axis: RankAxis; slots: Slot[]; selected: string[]; nameOf: (c: string) => string;
    onClickSlot: (slotId: string) => void; onClear: () => void;
}): JSX.Element {
    const active = selected.length > 0;
    const selOks = selected.map((id) => slots.find((s) => s.slotId === id)?.orderKey).filter((x): x is number => x != null);
    const lo = selOks.length ? Math.min(...selOks) : null;
    const hi = selOks.length ? Math.max(...selOks) : null;
    const fracOf = (ok: number): number => { const i = slots.findIndex((s) => s.orderKey === ok); return slotFrac(i, slots.length); };
    const bandStyle = (): CSSProperties | null => {
        if (lo == null || hi == null || lo === hi) return null;
        const a = fracOf(lo), b = fracOf(hi);
        return { position: "absolute", top: "50%", height: 10, transform: "translateY(-50%)", background: "var(--accent-soft)", borderRadius: 5, left: `calc(${PAD}px + ${a} * (100% - ${2 * PAD}px))`, width: `calc(${b - a} * (100% - ${2 * PAD}px))` };
    };
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 10px", background: active ? "var(--accent-soft)" : "transparent", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ width: 116, flexShrink: 0, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <span title={axis.name} style={{ fontSize: 12, fontWeight: active ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{axis.name}</span>
                {active && <button onClick={onClear} title="밴드 초기화" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12, padding: "0 2px", flexShrink: 0 }}>×</button>}
            </div>
            <div style={{ position: "relative", flex: 1, height: 30 }}>
                <div style={{ position: "absolute", left: PAD - 4, right: PAD - 4, top: "50%", height: 2, background: "var(--border-default)", transform: "translateY(-50%)" }} />
                {bandStyle() && <div style={bandStyle()!} />}
                {slots.length === 0 && <span style={{ position: "absolute", left: PAD, top: "50%", transform: "translateY(-50%)", fontSize: 10.5, color: "var(--text-tertiary)" }}>배치 없음</span>}
                {slots.map((slot, i) => {
                    const u = slotFrac(i, slots.length);
                    const sel = selected.includes(slot.slotId);
                    const inBand = lo != null && hi != null && slot.orderKey >= lo && slot.orderKey <= hi;
                    const tie = slot.count > 1;
                    return (
                        <div key={slot.slotId} onClick={() => onClickSlot(slot.slotId)}
                            title={tie ? `타이 ${slot.count}건 (${i + 1}번째)` : `${nameOf(slot.firstCode)} (${i + 1}번째)`}
                            style={{ position: "absolute", left: `calc(${PAD}px + ${u} * (100% - ${2 * PAD}px))`, top: "50%", transform: "translate(-50%,-50%)", cursor: "pointer", zIndex: 2 }}>
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: tie ? 16 : 10, height: tie ? 14 : 10, padding: tie ? "0 3px" : 0, borderRadius: tie ? 7 : "50%", background: sel ? "var(--accent-primary)" : inBand ? "var(--accent-primary)" : tie ? TIE : "var(--text-secondary)", opacity: sel || inBand ? 1 : 0.55, color: "#fff", fontSize: 8.5, fontWeight: 700, boxShadow: sel ? "0 0 0 2px var(--accent-soft)" : "none", fontVariantNumeric: "tabular-nums" }}>{tie ? slot.count : ""}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── 경로 리본(스파게티 + 중앙값 + 25~75% 띠) ────────────────────────────────
function RibbonChart({ stats }: { stats: PathStats }): JSX.Element {
    const W = 600, H = 220, mL = 40, mR = 10, mT = 8, mB = 22;
    const { ribbon, series } = stats;
    const allV: number[] = [];
    for (const s of series) for (const p of s.pts) allV.push(p.v);
    for (const v of ribbon.p25) allV.push(v);
    for (const v of ribbon.p75) allV.push(v);
    const maxT = Math.max(1, stats.maxT);
    const yMin = Math.min(-1, Math.floor(Math.min(...allV, 0) - 0.5));
    const yMax = Math.max(1, Math.ceil(Math.max(...allV, 0) + 0.5));
    const X = (t: number): number => mL + (t / maxT) * (W - mL - mR);
    const Y = (v: number): number => mT + (1 - (v - yMin) / (yMax - yMin)) * (H - mT - mB);
    const line = (pts: Array<{ t: number; v: number }>): string => pts.map((p, i) => `${i ? "L" : "M"} ${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
    const ribLine = (arr: number[]): string => ribbon.t.map((t, i) => `${i ? "L" : "M"} ${X(t).toFixed(1)} ${Y(arr[i]).toFixed(1)}`).join(" ");
    const bandPath = ribbon.t.length
        ? ribbon.t.map((t, i) => `${i ? "L" : "M"} ${X(t).toFixed(1)} ${Y(ribbon.p25[i]).toFixed(1)}`).join(" ") +
          " " + ribbon.t.map((_, i) => `L ${X(ribbon.t[ribbon.t.length - 1 - i]).toFixed(1)} ${Y(ribbon.p75[ribbon.t.length - 1 - i]).toFixed(1)}`).join(" ") + " Z"
        : "";
    const gy = yTicks(yMin, yMax);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="진입 후 경로 오버레이와 중앙값 띠" style={{ display: "block" }}>
            {gy.map((v) => (
                <g key={v}>
                    <line x1={mL} y1={Y(v)} x2={W - mR} y2={Y(v)} stroke="var(--border-subtle)" strokeWidth={1} />
                    <text x={mL - 5} y={Y(v) + 3} textAnchor="end" fontSize={9.5} fill="var(--text-tertiary)">{v > 0 ? "+" : ""}{v}%</text>
                </g>
            ))}
            <line x1={mL} y1={Y(0)} x2={W - mR} y2={Y(0)} stroke="var(--border-default)" strokeWidth={1.5} />
            {bandPath && <path d={bandPath} fill={UP} fillOpacity={0.13} stroke="none" />}
            {series.map((s) => <path key={s.key} d={line(s.pts)} fill="none" stroke={s.up ? UP : DOWN} strokeOpacity={0.22} strokeWidth={1} />)}
            {ribbon.t.length > 0 && <path d={ribLine(ribbon.p50)} fill="none" stroke={UP} strokeWidth={2.5} strokeLinejoin="round" />}
            {[0, Math.round(maxT / 2), maxT].map((t) => <text key={t} x={X(t)} y={H - 6} textAnchor="middle" fontSize={9.5} fill="var(--text-tertiary)">{t}분</text>)}
        </svg>
    );
}

// ── MAE ↔ MFE 산점 ──────────────────────────────────────────────────────────
function ScatterChart({ excursions, nameOf, onGo }: { excursions: Excursion[]; nameOf: (c: string) => string; onGo: (key: string) => void }): JSX.Element {
    const W = 600, H = 210, mL = 40, mR = 10, mT = 8, mB = 24;
    const maeMin = Math.min(-1, Math.floor(Math.min(...excursions.map((e) => e.mae), 0) - 0.5));
    const mfeMax = Math.max(1, Math.ceil(Math.max(...excursions.map((e) => e.mfe), 0) + 0.5));
    const X = (v: number): number => mL + (v - maeMin) / (0 - maeMin) * (W - mL - mR);
    const Y = (v: number): number => mT + (1 - v / mfeMax) * (H - mT - mB);
    const gx = yTicks(maeMin, 0);
    const gy = yTicks(0, mfeMax);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="최대낙폭 대 최대상승 산점도" style={{ display: "block" }}>
            {gx.map((v) => (
                <g key={`x${v}`}>
                    <line x1={X(v)} y1={mT} x2={X(v)} y2={H - mB} stroke="var(--border-subtle)" strokeWidth={1} />
                    <text x={X(v)} y={H - 12} textAnchor="middle" fontSize={9.5} fill="var(--text-tertiary)">{v}%</text>
                </g>
            ))}
            {gy.map((v) => (
                <g key={`y${v}`}>
                    <line x1={mL} y1={Y(v)} x2={W - mR} y2={Y(v)} stroke="var(--border-subtle)" strokeWidth={1} />
                    <text x={mL - 5} y={Y(v) + 3} textAnchor="end" fontSize={9.5} fill="var(--text-tertiary)">{v > 0 ? "+" : ""}{v}%</text>
                </g>
            ))}
            {excursions.map((e) => (
                <circle key={e.key} cx={X(Math.max(e.mae, maeMin))} cy={Y(Math.min(e.mfe, mfeMax))} r={4.5} fill={e.up ? UP : DOWN} fillOpacity={0.72} style={{ cursor: "pointer" }}
                    onClick={() => onGo(e.key)}>
                    <title>{nameOf(e.key.split("|")[0])} · MAE {e.mae.toFixed(1)}% / MFE +{e.mfe.toFixed(1)}% / 종가 {e.terminal >= 0 ? "+" : ""}{e.terminal.toFixed(1)}%</title>
                </circle>
            ))}
            <text x={mL} y={H - 1} fontSize={9.5} fill="var(--text-tertiary)">← 최대낙폭 MAE</text>
        </svg>
    );
}

/** 축 눈금 — [lo,hi] 를 5% 안팎 간격으로 균등 분할(정수). */
function yTicks(lo: number, hi: number): number[] {
    const span = hi - lo;
    const step = span <= 8 ? 2 : span <= 20 ? 5 : 10;
    const out: number[] = [];
    const start = Math.ceil(lo / step) * step;
    for (let v = start; v <= hi + 1e-9; v += step) out.push(v);
    return out;
}
