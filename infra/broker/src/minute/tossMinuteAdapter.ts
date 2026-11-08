// infra/broker/minute/tossMinuteAdapter — 토스 MinuteCandleProvider. 키움이 못 주는 옛 날짜(2025-07 앞) 백필 전용.
// 토스 → 도메인 차이를 여기서 흡수한다(실측 = infra/toss/recon):
//  · 토스 시각 = 봉 끝, 우리 = 봉 시작 → 1분 뺀다. 단 종가 동시호가 봉은 끝 시각이 마감 또는 마감+1분으로 오며(시기·종목마다 다름) 우리는 마감 시각에 둔다.
//  · 무거래 분은 거래량 0 평탄봉으로 채워 온다(옛 날짜도 지금 NXT 종목이면 08:01~20:00) → 버린다. 빈 분 채움은 읽는 쪽 몫이다.
//  · 통합 시세뿐이다 → NXT 출범 전은 통합 = KRX 라 KRX 칸에 같은 값을 넣고, 그 뒤는 KRX 칸을 비운다(krx=null).
// ⚠ 옛 날짜 전용: 키움이 받은 날짜에 쓰면 KRX 칸이 null 로 덮인다. 범위 제한은 호출자(apps/ingest)가 건다.
import type { MinuteCandle, MinuteCandleProvider } from "@trade-data-manager/market";
import type { TossDayCandle, TossDayMinutes, TossDayMinutesOptions } from "@trade-data-manager/toss";
import { mergeMarkets, type TimeBar } from "./merge.js";
import { closeMinutesOf } from "./sessionDates.js";

/** 어댑터가 토스에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). */
export interface TossMinuteSource {
    getMinuteCandlesForDate(symbol: string, date: string, options?: TossDayMinutesOptions): Promise<TossDayMinutes>;
}

/** 넥스트레이드 출범일. 이 앞은 정규장 봉만 있어 받을 구간을 좁힐 수 있다(하루 2쪽, 안 좁히면 채움 봉까지 4쪽). */
const NXT_START_DATE = "2025-03-04";
/**
 * 토스 1분봉 거래량이 깨진 날 — 가격은 맞지만 거래량이 |종가 − 전일 종가| 로 온다(전 시장, 복구 불가, 토스 일봉은 정상).
 * 거래대금 순위·누적 대금이 틀리므로 넣지 않는다(2026-11-08 실측 후 삭제). 호출자(apps/ingest)는 이 날을 빼고 돈다.
 */
export const TOSS_BROKEN_MINUTE_DATES: ReadonlySet<string> = new Set(["2023-02-10"]);

const toMinutes = (hhmmss: string): number => Number(hhmmss.slice(0, 2)) * 60 + Number(hhmmss.slice(3, 5));
const toHhmmss = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

/** 토스 봉 끝 시각 → 우리 봉 시작 시각. */
function startTimeOf(endTime: string, closeMinutes: number): string {
    const end = toMinutes(endTime);
    return end === closeMinutes || end === closeMinutes + 1 ? toHhmmss(closeMinutes) : toHhmmss(end - 1);
}

function toTimeBars(candles: TossDayCandle[], closeMinutes: number, label: string): TimeBar[] {
    const seen = new Set<string>();
    const out: TimeBar[] = [];
    for (const c of candles) {
        const volume = Number(c.volume);
        // 형식이 바뀌면(null·비수치) 채움 봉처럼 조용히 버려지지 않게 드러낸다.
        if (!Number.isFinite(volume)) throw new Error(`${label} ${c.kstTime}: 거래량이 수치가 아니다 (${String(c.volume)})`);
        if (volume <= 0) continue;
        const time = startTimeOf(c.kstTime, closeMinutes);
        // 동시호가 두 표기(마감·마감+1분)가 한 날에 다 체결되면 한쪽이 조용히 사라진다 — 규칙이 깨진 것이니 드러낸다.
        if (seen.has(time)) throw new Error(`${label}: 같은 시각 ${time} 에 체결 봉이 둘이다`);
        seen.add(time);
        out.push({
            time,
            bar: {
                open: String(c.openPrice),
                high: String(c.highPrice),
                low: String(c.lowPrice),
                close: String(c.closePrice),
                volume: String(c.volume),
            },
        });
    }
    return out;
}

export class TossMinuteAdapter implements MinuteCandleProvider {
    constructor(private readonly source: TossMinuteSource) {}

    async getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        if (TOSS_BROKEN_MINUTE_DATES.has(date)) throw new Error(`${stockCode} ${date}: 토스 분봉 거래량이 깨진 날이라 받지 않는다`);
        const closeMinutes = closeMinutesOf(date);
        const beforeNxt = date < NXT_START_DATE;
        const { candles } = await this.source.getMinuteCandlesForDate(stockCode, date, {
            adjusted: false,
            ...(beforeNxt ? { window: { from: "09:01:00", to: toHhmmss(closeMinutes + 1) } } : {}),
        });
        const bars = toTimeBars(candles, closeMinutes, `${stockCode} ${date}`);
        return mergeMarkets(stockCode, date, beforeNxt ? bars : [], bars);
    }
}
