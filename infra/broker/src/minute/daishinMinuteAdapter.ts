// infra/broker/minute/daishinMinuteAdapter — 대신 MinuteCandleProvider. 원천 파일(infra/daishin)을 읽는다 — COM 은 수집기 몫.
// 쓰임 = 토스 바탕 분봉 중 NXT 를 잃은 종목-날 수리(decisions 「옛 분봉 — 토스 바탕 + 대신 수리」).
// 대신 → 도메인 차이를 여기서 흡수한다(실측 = infra/daishin 머리말·recon):
//  · KRX(K)·NXT(N) 를 따로 받는다. 대신 통합('A')은 지금 NXT 여부로 걸러 쓰지 않고 우리가 합성한다:
//    거래량 합 · 고가 max · 저가 min · 시가/종가 KRX 우선(두 시장 다 체결되고 값이 다를 때 키움과 맞는 쪽이 KRX 약 78%).
//  · 시각 = 봉 끝 → 1분 뺀다. 단 KRX 종가 동시호가 봉(끝 = 마감)은 마감 시각에 둔다(늦게 체결된 날도 대신은 마감에 둔다).
//  · KRX 칸 = 대신 K 그대로. K 체결이 없으면 거절한다(수리 대상은 KRX 체결이 있는 날). 거래량 0 봉은 버린다. 대신 거래대금 칸(만 원 내림)은 쓰지 않는다.
import type { MinuteBar, MinuteCandle, MinuteCandleProvider } from "@trade-data-manager/market";
import type { DaishinBar, DaishinMinuteDay } from "@trade-data-manager/daishin";
import { mergeMarkets, type TimeBar } from "./merge.js";
import { closeMinutesOf } from "./sessionDates.js";

/** 원천 파일이 아직 없을 때 오류 메시지에 드는 문구 — 호출자(ingest)가 「아직 안 받음」을 다른 실패와 가른다. */
export const DAISHIN_RAW_MISSING = "대신 원천 파일이 없다";

/** 어댑터가 원천 파일 계층에서 필요로 하는 최소 표면(테스트 시 스텁 주입). */
export interface DaishinMinuteSource {
    readMinuteDay(stockCode: string, date: string): Promise<DaishinMinuteDay | null>;
}

const toHhmmss = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

/** 한 시장의 원천 봉 → 시작 시각별 바. 같은 시각이 둘이면 규칙이 깨진 것이니 드러낸다. */
function toTimeBars(bars: DaishinBar[], closeOn: number | null, label: string): Map<string, MinuteBar> {
    const out = new Map<string, MinuteBar>();
    for (const b of bars) {
        if (Number(b.volume) <= 0) continue;
        const end = Math.floor(b.end / 100) * 60 + (b.end % 100);
        const time = toHhmmss(end === closeOn ? end : end - 1);
        if (out.has(time)) throw new Error(`${label}: 같은 시각 ${time} 에 체결 봉이 둘이다`);
        out.set(time, { open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    }
    return out;
}

/** 같은 분의 KRX·NXT 봉 → 통합 봉. */
export function synthesizeUnBar(krx: MinuteBar | undefined, nxt: MinuteBar | undefined): MinuteBar {
    if (!krx) return nxt!;
    if (!nxt) return krx;
    return {
        open: krx.open,
        high: String(Math.max(Number(krx.high), Number(nxt.high))),
        low: String(Math.min(Number(krx.low), Number(nxt.low))),
        close: krx.close,
        volume: String(BigInt(krx.volume) + BigInt(nxt.volume)),
    };
}

export class DaishinMinuteAdapter implements MinuteCandleProvider {
    constructor(private readonly source: DaishinMinuteSource) {}

    async getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        const label = `${stockCode} ${date}`;
        const day = await this.source.readMinuteDay(stockCode, date);
        if (!day) throw new Error(`${label}: ${DAISHIN_RAW_MISSING} — 수집기(infra/daishin/collector)를 먼저 돌릴 것`);
        const krx = toTimeBars(day.krx, closeMinutesOf(date), `${label} KRX`);
        const nxt = toTimeBars(day.nxt, null, `${label} NXT`);
        // 대상은 KRX 체결이 있는 날이다 — K 가 비었는데 바꾸면 토스가 준 KRX 체결이 조용히 지워진다.
        if (krx.size === 0) throw new Error(`${label}: 대신 KRX 체결 봉이 없다 — 원천 파일을 확인할 것`);
        const toList = (m: Map<string, MinuteBar>): TimeBar[] => [...m].map(([time, bar]) => ({ time, bar }));
        const un = [...new Set([...krx.keys(), ...nxt.keys()])].map((time) => ({
            time,
            bar: synthesizeUnBar(krx.get(time), nxt.get(time)),
        }));
        return mergeMarkets(stockCode, date, toList(krx), un);
    }
}
