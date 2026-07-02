import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchChart } from "../api/chart.js";
import { fetchDaySummary } from "../api/daySummary.js";
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

    const toggle = (which: "daily" | "minute"): void => setExpanded((cur) => (cur === which ? null : which));

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{name ?? code ?? "—"}</span>
                {name && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>}
                <span style={{ color: "var(--text-tertiary)" }}>{date}</span>
                {minuteView?.baseFallback && <span style={{ color: "var(--warning)", fontSize: 11 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
                <div style={{ marginLeft: "auto", display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
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
                            <div onDoubleClick={() => toggle("daily")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다">
                                <PaneLabel text="일봉" />
                                {dailyView.length > 0 ? <DailyChart points={dailyView} /> : <Center text="일봉 없음" />}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div onDoubleClick={() => toggle("minute")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다">
                                <PaneLabel text="분봉" />
                                {minuteView.points.length > 0 ? <MinuteChart points={minuteView.points} /> : <Center text={mode === "krx" ? "KRX 분봉 없음" : "분봉 없음"} />}
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
