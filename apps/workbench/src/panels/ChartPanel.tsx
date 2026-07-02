import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchChart } from "../api/chart.js";
import { useDayCharts } from "../lib/useDayCharts.js";
import { deriveMinuteView } from "../lib/derive.js";
import { MinuteChart } from "../chart/MinuteChart.js";

// 분봉 차트 패널 — 우선 day store(당일 전체 페치)에서 종목 번들을 읽고(추가 페치 0),
// 없으면 단일 /chart 로 폴백. raw → 클라 파생(등락률 %·거래대금). price 모드(KRX/UN)는 뷰 설정.
export function ChartPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);

    // day store 공유 캐시에서 이 종목 번들 찾기.
    const dayCharts = useDayCharts(date);
    const fromDay = useMemo(
        () => dayCharts.data?.find((b) => b.stockCode === code) ?? null,
        [dayCharts.data, code],
    );
    // day store 에 없을 때만 단일 조회(딥링크·비유니버스 종목).
    const single = useQuery({
        queryKey: ["chart", code, date],
        queryFn: () => fetchChart(code, date),
        enabled: code.length > 0 && date.length > 0 && !fromDay && !dayCharts.isLoading,
    });

    const bundle = fromDay ?? single.data ?? null;
    const view = useMemo(() => (bundle ? deriveMinuteView(bundle, mode) : null), [bundle, mode]);

    const isError = dayCharts.isError || single.isError;
    const errMsg = ((dayCharts.error ?? single.error) as Error | undefined)?.message ?? "";
    const isLoading = code.length > 0 && !bundle && !isError;
    const query = { isLoading, isError, error: { message: errMsg } as Error };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--border-default)",
                    background: "var(--bg-secondary)",
                    fontSize: 12,
                    flexShrink: 0,
                }}
            >
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{code || "—"}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{date}</span>
                {view?.baseFallback && (
                    <span style={{ color: "var(--warning)", fontSize: 11 }} title="직전 종가 없음 → 당일 첫 시가 기준">
                        상장일 기준
                    </span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    {(["un", "krx"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            style={{
                                padding: "2px 10px",
                                borderRadius: 6,
                                border: `1px solid ${mode === m ? "var(--accent-primary)" : "var(--border-default)"}`,
                                background: mode === m ? "var(--accent-primary)" : "var(--bg-primary)",
                                color: mode === m ? "#fff" : "var(--text-secondary)",
                            }}
                        >
                            {m === "un" ? "UN" : "KRX"}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, position: "relative", background: "var(--bg-primary)" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && query.isLoading && <Center text={`${code} 로딩중…`} />}
                {query.isError && <Center text={`오류: ${(query.error as Error).message}`} />}
                {view && view.points.length === 0 && !query.isLoading && (
                    <Center text={mode === "krx" ? "KRX 분봉 없음(UN 확인)" : "분봉 데이터 없음"} />
                )}
                {view && view.points.length > 0 && <MinuteChart points={view.points} />}
            </div>
        </div>
    );
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
                pointerEvents: "none",
            }}
        >
            {text}
        </div>
    );
}
