import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { simulateTargetStop } from "./rank/pathStats.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { RankHeatmapChart, type HeatOverlay } from "./RankHeatmapChart.js";
import { RankHelpButton } from "./rank/RankHelp.js";
import { ExcursionScatter, ResizeGrip } from "./rank/ExcursionScatter.js";
import { ControlBar, ControlGroup, Sep, TextToggle } from "../components/ControlChrome.js";
import { chartQuery } from "../api/queries.js";
import { deriveMinuteView } from "../lib/derive.js";
import { parsePointKey } from "../lib/pointKey.js";
import { loadJson, saveJson } from "../store/persist.js";
import { useWorkbench, type ChartPriceMode } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { FAIL, STRONG, WEAK } from "../styles/palette.js";

const BUCKETS = [1, 5, 10];
const HEAT_H_KEY = "wb.rankHeatH";
const SCATTER_H_KEY = "wb.rankScatterH";
const numV = (o: unknown): number | null => (typeof o === "number" && o > 0 ? o : null);

// 분석 결과 대시보드 — 배치 보드에서 우클릭으로 건 밴드(store)를 소비만 한다(밴드 UI 없음).
//  · 밴드 AND 교집합(useRankFilterResult) → 밀도 히트맵(시간×정규화%, 진입 전 궤적 포함) + 목표/손절 첫터치 시뮬 + 분할 MAE 산점.
//  · horizon = 진입 후 crop 분(숫자입력 or 히트맵 세로선 드래그). 버킷 = 히트맵 칸 폭(1/5/10분). 목표/손절선도 드래그.
//  · 겹치는 선 대신 밀도(겹칠수록 진함)로 "무리"를 본다. 진입 전(음수 t)은 맥락용(MFE/MAE·시뮬엔 미포함).

const UP = STRONG;
const DOWN = WEAK;
const GREEN = STRONG;
const RED = FAIL;

const hmsToMin = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

// 선택 종목(activePoint) 오버레이 — 포커스 종목 차트에서 실%(전일종가 대비) 경로 파생. 진입 기준 정규화·실% 어파인.
//  · baseMode = 실%(좌측축) 분모 시장(KRX/UN 전일종가). 봉 형태는 UN 고정, base(%)만 스위칭(deriveMinuteView 계약).
//  · 우측축 구름은 진입가 앵커 기준이라 baseMode 와 무관 — 좌측 오버레이 라벨만 바뀐다.
function useSelectedOverlay(nameOf: (c: string) => string, baseMode: ChartPriceMode): HeatOverlay | null {
    const activePoint = useWorkbench((s) => s.activePoint);
    const q = useQuery(chartQuery(activePoint?.code ?? "", activePoint?.date ?? ""));
    return useMemo(() => {
        if (!activePoint || !q.data) return null;
        const mv = deriveMinuteView(q.data, baseMode);
        if (mv.points.length === 0) return null;
        const entryMin = hmsToMin(activePoint.time);
        const entry = mv.points.find((p) => hmsToMin(p.tradeTime) >= entryMin);
        if (!entry) return null;
        const k = 1 + entry.close / 100; // entry.close = 진입 실%(전일종가 대비) → 어파인 기울기
        return {
            name: nameOf(activePoint.code), k, entryMin,
            pts: mv.points.map((p) => ({ t: hmsToMin(p.tradeTime) - entryMin, open: p.open, high: p.high, low: p.low, close: p.close, amount: p.amount, cumAmount: p.cumAmount })),
        };
    }, [activePoint, q.data, nameOf, baseMode]);
}

export function RankFilterPanel({ panelId }: { panelId: string }): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const rankHorizon = useWorkbench((s) => s.rankHorizon);
    const setRankHorizon = useWorkbench((s) => s.setRankHorizon);
    const rankBucket = useWorkbench((s) => s.rankBucket);
    const setRankBucket = useWorkbench((s) => s.setRankBucket);
    const clearRankFilter = useWorkbench((s) => s.clearRankFilter);
    const collapsed = useWorkbench((s) => s.panelControlsCollapsed[panelId]) ?? false;
    const toggleControls = useWorkbench((s) => s.togglePanelControls);
    const cycleBucket = (): void => { const i = BUCKETS.indexOf(rankBucket); setRankBucket(BUCKETS[(i + 1) % BUCKETS.length] ?? 1); };

    const r = useRankFilterResult();
    const n = r.stats.excursions.length;

    // 뷰 설정 — 패널별 store 영속(usePanelUi). 프리셋 전환(재마운트)·새로고침에 유지.
    const [target, setTarget] = usePanelUi(panelId, "target", 5);
    const [stop, setStop] = usePanelUi(panelId, "stop", -3);
    const [baseMode, setBaseMode] = usePanelUi<ChartPriceMode>(panelId, "baseMode", "un"); // 좌측축 실% 분모 시장(KRX/UN 전일종가).
    const [heatOn, setHeatOn] = usePanelUi(panelId, "heatOn", true); // 밀도 히트맵 구름 표시 — 끄면 오버레이 캔들·기준선만.
    const [amtMarkersOn, setAmtMarkersOn] = usePanelUi(panelId, "amtMarkersOn", false); // 선택 종목 봉 위 분봉 거래대금 마커.
    const [heatH, setHeatH] = useState(() => loadJson(HEAT_H_KEY, numV) ?? 300); // 히트맵 높이(영속)
    const [scatterH, setScatterH] = useState(() => loadJson(SCATTER_H_KEY, numV) ?? 150); // 산점 줄당 높이(영속)
    useEffect(() => saveJson(HEAT_H_KEY, heatH), [heatH]);
    useEffect(() => saveJson(SCATTER_H_KEY, scatterH), [scatterH]);
    const sim = useMemo(() => simulateTargetStop(r.paths, r.effHorizon, target, stop), [r.paths, r.effHorizon, target, stop]);
    const overlay = useSelectedOverlay(r.nameOf, baseMode);

    const goKey = (key: string): void => { const p = parsePointKey(key); if (p) goToPoint({ date: p.date, code: p.stockCode, time: p.time }, "rank-filter"); };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", minWidth: 0 }}>
                {/* 좌측 = 표본·통계 readout(항상 표시). 용어는 ? 도움말. */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    <Metric label="N" value={String(n)} />
                    <Metric label="coverage" value={`${n}/${r.coverage}`} />
                    <Metric label="중앙 MFE" value={r.stats.medianMfe == null ? "—" : `+${r.stats.medianMfe.toFixed(1)}%`} color={UP} />
                    <Metric label="MAE 전" value={r.stats.medianMaePre == null ? "—" : `${r.stats.medianMaePre.toFixed(1)}%`} color={DOWN} />
                    <Metric label="MAE 후" value={r.stats.medianMaePost == null ? "—" : `${r.stats.medianMaePost.toFixed(1)}%`} color={DOWN} />
                    <RankHelpButton />
                </div>
                {/* 우측 = 컨트롤(통째로 접힘, 패널별·영속). horizon·버킷은 텍스트, 클릭해 값 변경. */}
                <ControlBar collapsed={collapsed} onToggle={() => toggleControls(panelId)}>
                    <ControlGroup gap={3}>
                        <span style={ctlLabel}>horizon</span>
                        <InlineNum value={Math.round(r.effHorizon)} suffix="분" title="진입 후 관측 구간(분) — 클릭해 입력. 히트맵 세로선 드래그로도 조정." onCommit={setRankHorizon} />
                    </ControlGroup>
                    <Sep />
                    <ControlGroup gap={3}>
                        <span style={ctlLabel}>버킷</span>
                        <TextToggle active onClick={cycleBucket} title="히트맵 칸 폭(분) — 클릭: 1→5→10">{rankBucket}분</TextToggle>
                    </ControlGroup>
                    <Sep />
                    <ControlGroup>
                        <TextToggle active={heatOn} activeColor="var(--accent-primary)" onClick={() => setHeatOn((v) => !v)} title={heatOn ? "밀도 히트맵 구름 끄기(오버레이 캔들·기준선만)" : "밀도 히트맵 구름 켜기"}>히트맵</TextToggle>
                        <TextToggle active={amtMarkersOn} activeColor="var(--accent-primary)" onClick={() => setAmtMarkersOn((v) => !v)} title={amtMarkersOn ? "선택 종목 분봉 거래대금 마커 끄기" : "선택 종목 분봉 거래대금 마커 켜기(구간 억)"}>거래대금</TextToggle>
                    </ControlGroup>
                    <Sep />
                    <TextToggle active activeColor="var(--accent-primary)" onClick={() => setBaseMode(baseMode === "un" ? "krx" : "un")} title={`클릭: 실% 기준 시장 전환 (현재 ${baseMode.toUpperCase()})`}>
                        <span style={{ display: "inline-block", minWidth: 28, textAlign: "center" }}>{baseMode.toUpperCase()}</span>
                    </TextToggle>
                </ControlBar>
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
                            <div style={{ padding: "8px 12px 16px" }}>
                                <RankHeatmapChart paths={r.paths} horizon={rankHorizon} dataMinT={r.dataMinT} dataMaxT={r.dataMaxT || 1} bucket={rankBucket} setHorizon={setRankHorizon}
                                    target={target} stop={stop} setTarget={setTarget} setStop={setStop} overlay={overlay} heatOn={heatOn} showAmtMarkers={amtMarkersOn} height={heatH} />
                                <ResizeGrip onResize={(dy) => setHeatH((h) => Math.max(180, Math.min(680, h + dy)))} title="히트맵 높이 조절" />
                                <SimReadout win={sim.win} loss={sim.loss} none={sim.none} total={sim.total} expR={sim.expR} target={target} stop={stop} />
                                <div style={{ height: 14 }} />
                                <ExcursionScatter excursions={r.stats.excursions} nameOf={r.nameOf} onGo={goKey} target={target} stop={stop} height={scatterH} setHeight={setScatterH} />
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
const ctlLabel: CSSProperties = { fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" };

function Metric({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
    return (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: color ?? "var(--text-primary)" }}>{value}</span>
        </span>
    );
}

// 인라인 편집 숫자 — 평소엔 텍스트(값+접미), 클릭하면 입력. Enter/blur 저장·Esc 취소(esc 후 blur 이중발화 회피).
function InlineNum({ value, suffix, title, onCommit }: { value: number; suffix?: string; title?: string; onCommit: (v: number) => void }): JSX.Element {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState("");
    const escRef = useRef(false);
    const start = (): void => { setText(String(value)); setEditing(true); };
    const commit = (): void => { const v = Number(text); setEditing(false); if (Number.isFinite(v) && v > 0) onCommit(Math.round(v)); };
    if (editing) return (
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { e.preventDefault(); escRef.current = true; e.currentTarget.blur(); } }}
            onBlur={() => { if (escRef.current) { escRef.current = false; setEditing(false); } else commit(); }}
            style={{ width: 42, border: "1px solid var(--accent-primary)", borderRadius: 3, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "1px 4px", fontSize: 11, textAlign: "right", outline: "none" }} />
    );
    return (
        <button onClick={start} title={title}
            style={{ border: "none", background: "none", padding: "0 3px", cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
            {value}{suffix}
        </button>
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
