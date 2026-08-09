// RankMinutes — 순위 필터 분석용 (종목,날) raw UN 분봉 공급(app 읽기측). 진입가 앵커 정규화·집계는
// 클라(core/market entryAnchoredBars + computePathStats)가 한다. 여긴 분봉 읽기 + UN 슬림화만.
//  · (종목,날) 중복 제거 후 분봉 조회 — 같은 날 여러 타점은 클라가 캐시된 분봉을 재사용(재조회 없음).
//  · 대량 집합 대비 동시성 제한(풀 포화 방지). 트리밍은 없음(전 구간).
import type { MinuteReader } from "@trade-data-manager/market";
import type { RankDayMinutes } from "@trade-data-manager/wire";

export type { RankDayMinutes };

export interface RankMinutesDeps {
    minuteCandle: MinuteReader;
}
export interface DayRef {
    stockCode: string;
    date: string;
}

const dayKey = (code: string, date: string): string => `${code}|${date}`;
const READ_CONCURRENCY = 10; // 병렬 분봉 조회 상한 — 대량 요청 시 커넥션 풀 포화 방지.

/** items 를 동시성 limit 로 map(입력 순서 보존). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const idx = next++;
            out[idx] = await fn(items[idx]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

export class RankMinutes {
    constructor(private readonly deps: RankMinutesDeps) {}

    async minutes(days: DayRef[]): Promise<RankDayMinutes[]> {
        const uniq = [...new Map(days.map((d) => [dayKey(d.stockCode, d.date), d])).values()];
        return mapLimit(uniq, READ_CONCURRENCY, async (d) => {
            const candles = await this.deps.minuteCandle.getMinuteCandles(d.stockCode, d.date);
            return {
                stockCode: d.stockCode,
                date: d.date,
                bars: candles.map((c) => ({ time: c.time, high: c.un.high, low: c.un.low, close: c.un.close })),
            };
        });
    }
}
