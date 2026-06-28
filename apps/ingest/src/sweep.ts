// 전종목 일봉 스윕 오케스트레이션(앱 책임 — core 유스케이스는 종목 1개 단위).
// 유니버스 갱신 → 각 종목 ingestDailyCandles(제한 동시성). 종목 실패는 모아서 계속 진행.
import { mapWithConcurrency, enumerateMonthDates } from "@trade-data-manager/market";
import type { IngestRuntime } from "./composition.js";

export interface SweepOptions {
    /** 처리할 종목 수 상한(스모크용). 미지정 = 전체 유니버스. */
    limit?: number;
    /** 동시 실행 상한(기본 8). 풀이 rate limit 자체 페이싱. */
    concurrency?: number;
    /** 진행 로그 간격(완료 종목 수). 기본 50. */
    progressEvery?: number;
}

export interface SweepResult {
    total: number;
    ok: number;
    healed: number;
    failed: { stockCode: string; error: string }[];
}

export async function sweepDailyCandles(rt: IngestRuntime, opts: SweepOptions = {}): Promise<SweepResult> {
    const concurrency = opts.concurrency ?? 8;
    const progressEvery = opts.progressEvery ?? 50;

    // 스윕 대상 = 라이브 유니버스(stock_master 갱신 부수효과 포함). DB 누적분(폐지종목)은 안 씀.
    const { stockCodes } = await rt.universe.ingestStockMasters();
    const targets = opts.limit ? stockCodes.slice(0, opts.limit) : stockCodes;
    console.log(`▶ 전종목 일봉 스윕: ${targets.length}종목${opts.limit ? ` (limit ${opts.limit})` : ""} · 동시 ${concurrency}`);

    const failed: SweepResult["failed"] = [];
    let ok = 0;
    let healed = 0;
    let done = 0;

    await mapWithConcurrency(targets, concurrency, async (stockCode) => {
        try {
            const r = await rt.ingest.ingestDailyCandles(stockCode);
            ok++;
            if (r.healed) healed++;
        } catch (err) {
            failed.push({ stockCode, error: err instanceof Error ? err.message : String(err) });
        } finally {
            done++;
            if (done % progressEvery === 0 || done === targets.length) {
                console.log(`  [${done}/${targets.length}] ok=${ok} healed=${healed} 실패=${failed.length}`);
            }
        }
    });

    return { total: targets.length, ok, healed, failed };
}

export interface MonthSweepResult {
    yearMonth: string;
    /** 데이터가 있던(poolSize>0) 거래일 수. */
    tradingDays: number;
    /** 그 달 전체 저장 종목·일 합계. */
    totalStored: number;
}

/** 한 달의 모든 거래일에 대해 분봉 스윕. 비거래일/일봉 없는 날은 poolSize 0 으로 자연 스킵. */
export async function sweepMinuteMonth(
    rt: IngestRuntime,
    yearMonth: string,
    opts: { poolLimit?: number; concurrency?: number } = {},
): Promise<MonthSweepResult> {
    const dates = enumerateMonthDates(yearMonth); // 형식 불량이면 throw
    console.log(`▶ 월별 분봉 스윕: ${yearMonth} (${dates.length}일 스캔)`);

    let tradingDays = 0;
    let totalStored = 0;
    for (const date of dates) {
        const r = await rt.minuteSweep.sweepMinutesForDate(date, {
            poolLimit: opts.poolLimit,
            concurrency: opts.concurrency,
        });
        if (r.poolSize === 0) continue; // 비거래일·일봉 없음 → 스킵
        tradingDays++;
        totalStored += r.stored;
        console.log(
            `  ${date}  pool ${r.poolSize} → fetch ${r.fetched} → 저장 ${r.stored}` +
                (r.failed.length ? ` (실패 ${r.failed.length})` : ""),
        );
    }
    return { yearMonth, tradingDays, totalStored };
}
