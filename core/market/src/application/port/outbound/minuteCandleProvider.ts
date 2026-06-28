import type { MinuteCandle } from "../../../domain/index.js";

/**
 * 분봉 제공 포트(ISP — 분봉 능력만). 조회 단위는 거래일 하루.
 * 구현은 단일 벤더(KIS/키움) 또는 둘을 (종목,날) 단위로 라우팅하는 수집기일 수 있다
 * (양쪽 CredentialPool 합산으로 유량 ~2배) — 소비자는 구분하지 않는다.
 * KRX·UN 두 바 머지와 페이지네이션은 어댑터 내부. 반환은 시간 오름차순.
 */
export interface MinuteCandleProvider {
    getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]>;
}
