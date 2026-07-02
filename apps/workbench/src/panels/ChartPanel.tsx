import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchChart } from "../api/chart.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { fetchPriceLines, addPriceLine, removePriceLine } from "../api/priceLines.js";
import { deriveMinuteView, deriveDailyView } from "../lib/derive.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";

// 차트 패널 — 일봉(상) + 분봉(하) 듀얼. 영역 더블클릭 = 그 영역만 보기 ↔ 둘 다.
// 좌상단 종목명(day-summary 캐시 조회), 우상단 UN|KRX 세그먼트. code/date 는 Focus 구독.
export function ChartPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);
    const [expanded, setExpanded] = useState<"daily" | "minute" | null>(null);
    const [showMarkers, setShowMarkers] = useState(true); // 분봉 거래대금 마커 ON/OFF

    const query = useQuery({
        queryKey: ["chart", code, date],
        queryFn: () => fetchChart(code, date),
        enabled: code.length > 0 && date.length > 0,
        staleTime: Infinity,
    });
    // 종목명 — day-summary 캐시(보드가 이미 페치)에서 조회. 추가 페치 없음.
    const summaryQ = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
        staleTime: Infinity,
    });
    const name = summaryQ.data?.stocks.find((s) => s.stockCode === code)?.name ?? null;

    const minuteView = useMemo(() => (query.data ? deriveMinuteView(query.data, mode) : null), [query.data, mode]);
    const dailyView = useMemo(() => (query.data ? deriveDailyView(query.data, mode) : null), [query.data, mode]);

    const toggleExpand = (which: "daily" | "minute"): void => setExpanded((cur) => (cur === which ? null : which));

    // 가격선 주석 — 조회 + 우클릭 토글(자동 저장).
    const qc = useQueryClient();
    const linesQ = useQuery({
        queryKey: ["price-lines", code, date],
        queryFn: () => fetchPriceLines(code, date),
        enabled: code.length > 0 && date.length > 0,
        staleTime: Infinity,
    });
    const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);
    const dLines = useMemo(() => lines.filter((l) => l.memo === "D"), [lines]);
    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: ["price-lines", code, date] });
    };
    const addMut = useMutation({ mutationFn: addPriceLine, onSuccess: invalidate });
    const removeMut = useMutation({ mutationFn: removePriceLine, onSuccess: invalidate });
    // 봉 우클릭 = 그 봉 고점(raw)에 kind(D/M) 선 토글. 이미 있으면 삭제, 없으면 추가.
    const toggleLine = (priceRaw: number, kind: "D" | "M"): void => {
        if (!code || !date) return;
        const priceStr = String(Math.round(priceRaw));
        const existing = lines.find((l) => l.memo === kind && l.price === priceStr);
        if (existing?.id) removeMut.mutate(existing.id);
        else addMut.mutate({ stockCode: code, date, price: priceStr, memo: kind });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{name ?? code ?? "—"}</span>
                {name && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>}
                <span style={{ color: "var(--text-tertiary)" }}>{date}</span>
                {minuteView?.baseFallback && <span style={{ color: "var(--warning)", fontSize: 11 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
                {/* 분봉 거래대금 마커 ON/OFF */}
                <button
                    onClick={() => setShowMarkers((v) => !v)}
                    title={showMarkers ? "거래대금 마커 끄기" : "거래대금 마커 켜기"}
                    style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 6, border: `1px solid ${showMarkers ? "var(--accent-primary)" : "var(--border-default)"}`, background: showMarkers ? "var(--accent-soft)" : "var(--bg-primary)", color: showMarkers ? "var(--accent-hover)" : "var(--text-tertiary)", cursor: "pointer", fontSize: 11 }}
                >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: showMarkers ? "var(--accent-primary)" : "var(--text-tertiary)" }} /> 대금
                </button>
                <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
                    {(["un", "krx"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            style={{ padding: "2px 12px", border: "none", background: mode === m ? "var(--accent-primary)" : "var(--bg-primary)", color: mode === m ? "#fff" : "var(--text-secondary)", fontWeight: mode === m ? 600 : 400, cursor: "pointer" }}
                        >
                            {m.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* 본문 */}
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && query.isLoading && <Center text={`${code} 로딩중…`} />}
                {query.isError && <Center text={`오류: ${(query.error as Error).message}`} />}
                {minuteView && dailyView && (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        {expanded !== "minute" && (
                            <div onDoubleClick={() => toggleExpand("daily")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 봉 우클릭: 고점 선(D)">
                                <PaneLabel text="일봉" />
                                {dailyView.length > 0 ? <DailyChart points={dailyView} lines={dLines} onRightClick={(h) => toggleLine(h, "D")} /> : <Center text="일봉 없음" />}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div onDoubleClick={() => toggleExpand("minute")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 봉 우클릭: 선(M)">
                                <PaneLabel text="분봉" />
                                {minuteView.points.length > 0 ? (
                                    <MinuteChart points={minuteView.points} showAmountMarkers={showMarkers} lines={lines} base={minuteView.base} onRightClick={(h) => toggleLine(h, "M")} />
                                ) : (
                                    <Center text={mode === "krx" ? "KRX 분봉 없음" : "분봉 없음"} />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function PaneLabel({ text }: { text: string }): JSX.Element {
    return (
        <span style={{ position: "absolute", top: 4, left: 8, zIndex: 5, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", background: "var(--bg-primary)", padding: "0 4px", borderRadius: 4, pointerEvents: "none" }}>
            {text}
        </span>
    );
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13, pointerEvents: "none" }}>
            {text}
        </div>
    );
}
