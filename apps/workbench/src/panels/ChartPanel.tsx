import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    createChart,
    CandlestickSeries,
    type IChartApi,
    type ISeriesApi,
    type CandlestickData,
    type UTCTimestamp,
} from "lightweight-charts";
import { useWorkbench } from "../store/workbench.js";
import { fetchChart, type DailyCandle } from "../api/chart.js";

// 이 슬라이스는 일봉(UN 통합) 캔들만 렌더해 데이터 배선을 증명한다.
// 분봉·오버레이·파생계산(%·누적)은 다음 슬라이스.
function toCandles(daily: DailyCandle[]): CandlestickData[] {
    return daily.map((d) => ({
        time: d.date as unknown as UTCTimestamp, // lightweight-charts 는 'YYYY-MM-DD' 를 business day 로 받는다
        open: Number(d.un.open),
        high: Number(d.un.high),
        low: Number(d.un.low),
        close: Number(d.un.close),
    }));
}

export function ChartPanel(): JSX.Element {
    // Focus 축별 selector 구독 — code/date 바뀔 때만 이 패널이 리렌더된다.
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);

    const query = useQuery({
        queryKey: ["chart", code, date],
        queryFn: () => fetchChart(code, date),
        enabled: code.length > 0 && date.length > 0,
    });

    const hostRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    // 차트 인스턴스는 1회 생성 + 컨테이너 크기 추적.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const chart = createChart(host, {
            autoSize: true,
            layout: { background: { color: "transparent" }, textColor: "#333" },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false },
        });
        const series = chart.addSeries(CandlestickSeries);
        chartRef.current = chart;
        seriesRef.current = series;
        return () => {
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, []);

    // 데이터 도착시 시리즈 갱신.
    useEffect(() => {
        const series = seriesRef.current;
        if (!series || !query.data) return;
        series.setData(toCandles(query.data.daily));
        chartRef.current?.timeScale().fitContent();
    }, [query.data]);

    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
            {!code && <Overlay text="종목을 선택하세요" />}
            {code && query.isLoading && <Overlay text={`${code} 로딩중…`} />}
            {query.isError && <Overlay text={`오류: ${(query.error as Error).message}`} />}
            {code && query.data && query.data.daily.length === 0 && <Overlay text="일봉 데이터 없음" />}
        </div>
    );
}

function Overlay({ text }: { text: string }): JSX.Element {
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#888",
                font: "13px system-ui, sans-serif",
                pointerEvents: "none",
            }}
        >
            {text}
        </div>
    );
}
