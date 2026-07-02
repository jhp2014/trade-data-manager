import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchChart } from "../api/chart.js";
import { deriveMinuteView } from "../lib/derive.js";
import { MinuteChart } from "../chart/MinuteChart.js";

// 분봉 차트 패널 — /chart raw 번들을 받아 클라에서 파생(등락률 %·거래대금) 후 렌더.
// price 모드(KRX/UN)는 뷰 설정. code/date 는 Focus selector 구독(바뀌면 이 패널만 리렌더).
export function ChartPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);

    const query = useQuery({
        queryKey: ["chart", code, date],
        queryFn: () => fetchChart(code, date),
        enabled: code.length > 0 && date.length > 0,
    });

    const view = useMemo(
        () => (query.data ? deriveMinuteView(query.data, mode) : null),
        [query.data, mode],
    );

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
