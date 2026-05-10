"use client";

import { useEffect, useMemo, useState } from "react";
import { DailyChart } from "@/components/chart/DailyChart";
import { MinuteChart } from "@/components/chart/MinuteChart";
import type { DailyCandle, MinuteCandle } from "@/lib/chartTypes";
import type { LineSpec } from "@/types/capture";

interface Props {
    daily: DailyCandle[];
    minute: MinuteCandle[];
    variant: "KRX" | "NXT";
    prevCloseKrx: number | null;
    prevCloseNxt: number | null;
    captureBoxW: number;
    captureBoxH: number;
}

export function ChartCaptureClient({
    daily,
    minute,
    variant,
    prevCloseKrx,
    prevCloseNxt,
    captureBoxW,
    captureBoxH,
}: Props) {
    const [dailyReady, setDailyReady] = useState(false);
    const [minuteReady, setMinuteReady] = useState(false);
    const [lines, setLines] = useState<LineSpec[] | null>(null);

    // 라인 데이터 수신
    useEffect(() => {
        const w = window as unknown as { __CAPTURE_LINES__?: LineSpec[] };
        if (w.__CAPTURE_LINES__) {
            setLines(w.__CAPTURE_LINES__);
            return;
        }
        const handler = () =>
            setLines((window as unknown as { __CAPTURE_LINES__?: LineSpec[] }).__CAPTURE_LINES__ ?? []);
        window.addEventListener("capture-lines-ready", handler);
        // 외부 서버 디버깅용 fallback (Playwright는 즉시 라인 주입하므로 정상 흐름에서는 발화하지 않음)
        const fallbackTimer = setTimeout(() => {
            setLines((prev) => (prev === null ? [] : prev));
        }, 2000);
        return () => {
            window.removeEventListener("capture-lines-ready", handler);
            clearTimeout(fallbackTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stableLines = useMemo<LineSpec[]>(() => lines ?? [], [lines]);

    // pre-ready 마커: Playwright가 라인 주입 타이밍을 잡기 위함
    useEffect(() => {
        document.body.setAttribute("data-pre-ready", "true");
    }, []);

    // 두 차트 모두 ready + 라인 수신 완료 시 RAF 2회 후 __CHART_READY__
    useEffect(() => {
        if (dailyReady && minuteReady && lines !== null) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    (window as unknown as { __CHART_READY__: boolean }).__CHART_READY__ = true;
                });
            });
        }
    }, [dailyReady, minuteReady, lines]);

    return (
        <div
            id="capture-root"
            style={{ width: captureBoxW, height: captureBoxH, overflow: "hidden" }}
        >
            <div style={{ height: "50%" }}>
                <MinuteChart
                    candles={minute}
                    variant={variant}
                    priceLines={stableLines}
                    prevCloseKrx={prevCloseKrx}
                    prevCloseNxt={prevCloseNxt}
                    onReady={() => setMinuteReady(true)}
                />
            </div>
            <div style={{ height: "50%" }}>
                <DailyChart
                    candles={daily}
                    variant={variant}
                    priceLines={stableLines}
                    onReady={() => setDailyReady(true)}
                />
            </div>
        </div>
    );
}
