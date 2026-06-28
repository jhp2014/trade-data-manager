// infra/broker/minute/merge — 한 벤더의 KRX·UN 두 시장 분봉을 시각으로 머지해 MinuteCandle[] 로.
// 벤더 raw → MinuteBar 정규화는 각 어댑터 책임(키움 "+/-" prefix 제거 등). 여기선 정규화된 바만 받는다.
import type { MinuteBar, MinuteCandle } from "@trade-data-manager/market";

/** 한 시장의 시각별 정규화 분봉 한 건. time = "HH:MM:SS". */
export interface TimeBar {
    time: string;
    bar: MinuteBar;
}

/**
 * KRX·UN 두 시장 바를 시각 기준으로 머지.
 * UN(통합)이 시간 집합의 정본 — UN ⊇ KRX(실측: 통합 = KRX+NXT 합)이라 UN 시각을 모두 돌며 KRX 를 붙인다.
 * KRX 없는 시각(프리마켓·시간외 등 NXT 단독)은 krx=null. 반환은 시간 오름차순.
 */
export function mergeMarkets(
    stockCode: string,
    date: string,
    krx: TimeBar[],
    un: TimeBar[],
): MinuteCandle[] {
    const krxByTime = new Map<string, MinuteBar>();
    for (const { time, bar } of krx) krxByTime.set(time, bar);

    const unByTime = new Map<string, MinuteBar>();
    for (const { time, bar } of un) unByTime.set(time, bar);

    return [...unByTime.keys()]
        .sort()
        .map((time) => ({
            stockCode,
            date,
            time,
            krx: krxByTime.get(time) ?? null,
            un: unByTime.get(time)!,
        }));
}
