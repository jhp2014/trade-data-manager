import { notFound } from "next/navigation";
import { findStockByCode } from "@trade-data-manager/data-core";
import { getCaptureDb } from "@/data/db";
import { fetchChartData } from "@/data/fetchChartData";
import { toDailyChartCandle, buildMinuteCandles } from "@/lib/mappers";
import { fillMissingMinuteCandles } from "@/lib/chartPadding";
import { loadConfig } from "@root/capture.config";
import { ChartCaptureClient } from "./ChartCaptureClient";

// Next.js 캐시 없이 항상 최신 DB 데이터 사용
export const dynamic = "force-dynamic";

interface PageProps {
    params: {
        stockCode: string;
        tradeDate: string;
        variant: string;
    };
}

export default async function CapturePage({ params }: PageProps) {
    const { stockCode, tradeDate, variant } = params;

    // 파라미터 검증
    if (!/^[A-Z0-9]{6}$/i.test(stockCode)) return notFound();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) return notFound();
    if (variant !== "KRX" && variant !== "NXT") return notFound();

    const db = getCaptureDb();

    // NXT 미지원 종목 + variant=NXT 조합 체크
    if (variant === "NXT") {
        const stock = await findStockByCode(db, { stockCode });
        if (!stock || !stock.isNxtAvailable) {
            return (
                <div data-empty="true" data-reason="nxt-not-supported">
                    SKIP
                </div>
            );
        }
    }

    const config = loadConfig();
    const { daily: dailyRaw, minute: minuteRaw } = await fetchChartData(db, {
        stockCode,
        tradeDate,
        dailyLookbackDays: config.dailyLookbackDays,
    });

    // 분봉 0건 = 휴장일 등
    if (minuteRaw.length === 0) {
        return (
            <div data-empty="true" data-reason="no-minute-data">
                EMPTY
            </div>
        );
    }

    const daily = dailyRaw.map(toDailyChartCandle);
    const minute = fillMissingMinuteCandles(buildMinuteCandles(minuteRaw));

    // 진입일 일봉의 prevClose (분봉 가격 라인 % 변환 기준)
    const entryCandle = daily.find((c) => {
        const d = new Date((c.time + 9 * 3600) * 1000);
        const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        return ymd === tradeDate;
    }) ?? null;

    const prevCloseKrx = entryCandle?.prevCloseKrx ?? null;
    const prevCloseNxt = entryCandle?.prevCloseNxt ?? null;

    return (
        <ChartCaptureClient
            daily={daily}
            minute={minute}
            variant={variant as "KRX" | "NXT"}
            prevCloseKrx={prevCloseKrx}
            prevCloseNxt={prevCloseNxt}
            captureBoxW={config.captureBox.width}
            captureBoxH={config.captureBox.height}
        />
    );
}
