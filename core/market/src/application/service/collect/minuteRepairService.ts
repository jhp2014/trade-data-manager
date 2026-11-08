// 옛 분봉 수리 — 바탕 소스(토스)가 틀린 종목-날만 골라 다른 소스로 통째 바꾼다.
// 대상 = MinuteRepairStore.listNxtLostMinuteDays(분봉에 NXT 봉이 없는데 일봉엔 NXT 체결이 있던 날). 고치면 보통 대상에서 빠지므로
// 재실행 = 남은 것만 이어받기(NXT 체결이 정규장 안뿐이던 날은 남아 다시 바뀐다 — 같은 값이라 무해). 종목-날 실패는 격리하고 모아서 돌려준다. 결정 = decisions 「옛 분봉 — 토스 바탕 + 대신 수리」.
import type { DateRange } from "#domain";
import type { MinuteCandleProvider, MinuteRepairStore, MinuteStockDay } from "#port/collect";
import { mapWithConcurrency } from "../../concurrency.js";

export interface MinuteRepairDeps {
    store: MinuteRepairStore;
    /** 새 소스. 그 종목-날을 아직 못 주면(원천 파일 없음 등) 던진다 — 실패로 세고 기존 분봉은 그대로 둔다. */
    minuteProvider: MinuteCandleProvider;
}

export interface MinuteRepairResult {
    /** 바꾼 종목-날. */
    replaced: MinuteStockDay[];
    failed: (MinuteStockDay & { error: string })[];
}

export interface MinuteRepairOptions {
    /** true 면 받아서 검사까지만 하고 쓰지 않는다. */
    dryRun?: boolean;
    concurrency?: number;
    onDone?: (done: number, total: number) => void;
}

export class MinuteRepairService {
    constructor(private readonly deps: MinuteRepairDeps) {}

    findTargets(range: DateRange): Promise<MinuteStockDay[]> {
        return this.deps.store.listNxtLostMinuteDays(range);
    }

    async repair(targets: readonly MinuteStockDay[], options: MinuteRepairOptions = {}): Promise<MinuteRepairResult> {
        const { store, minuteProvider } = this.deps;
        const replaced: MinuteStockDay[] = [];
        const failed: MinuteRepairResult["failed"] = [];
        let done = 0;
        await mapWithConcurrency(targets, options.concurrency ?? 4, async (t) => {
            try {
                const candles = await minuteProvider.getMinuteCandles(t.stockCode, t.date);
                // 빈 결과로 지우면 그 종목-날이 통째 사라진다 — 대상은 일봉에 체결이 있는 날이니 빈 결과는 소스 이상이다.
                if (candles.length === 0) throw new Error("새 소스가 빈 분봉을 줬다");
                const stray = candles.find((c) => c.stockCode !== t.stockCode || c.date !== t.date);
                if (stray) throw new Error(`다른 종목-날 봉이 섞였다 (${stray.stockCode} ${stray.date})`);
                if (!options.dryRun) await store.replaceMinuteCandlesOfDay(t.stockCode, t.date, candles);
                replaced.push(t);
            } catch (err) {
                failed.push({ ...t, error: err instanceof Error ? err.message : String(err) });
            } finally {
                options.onDone?.(++done, targets.length);
            }
        });
        const order = (a: MinuteStockDay, b: MinuteStockDay): number =>
            a.date.localeCompare(b.date) || a.stockCode.localeCompare(b.stockCode);
        return { replaced: replaced.sort(order), failed: failed.sort(order) };
    }
}
