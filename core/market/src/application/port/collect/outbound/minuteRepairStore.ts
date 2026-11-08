import type { DateRange, MinuteCandle } from "#domain";

/** 종목-날 좌표. */
export interface MinuteStockDay {
    stockCode: string;
    date: string;
}

/**
 * 옛 분봉 수리 포트(collect — 대상 찾기 + 종목-날 통째 교체). 구현은 infra/persistence(Drizzle).
 * 쓰임 = 토스 바탕 분봉 중 토스가 틀린 종목-날을 다른 소스(대신)로 바꾸기(decisions 「옛 분봉 — 토스 바탕 + 대신 수리」).
 */
export interface MinuteRepairStore {
    /**
     * 「NXT 봉을 잃은」 종목-날 — 분봉에 NXT 단독 봉(KRX 칸이 빈 정규장 밖 봉)이 하나도 없는데
     * 원주가 일봉의 통합 거래량 ≠ KRX 거래량(그날 NXT 체결이 있었다). 날짜·종목 오름차순.
     * 재발 탐지로도 쓴다. 고친 뒤엔 보통 NXT 봉(프리·애프터)이 생겨 빠지지만, 그날 NXT 체결이 정규장 안뿐이면 남는다(다시 바꿔도 같은 값).
     */
    listNxtLostMinuteDays(range: DateRange): Promise<MinuteStockDay[]>;
    /**
     * 그 종목-날의 분봉을 지우고 candles 로 채운다(한 트랜잭션). 자연키 upsert 와 달리 새 소스에 없는 시각이 남지 않는다.
     * candles 는 전부 그 종목-날이어야 하고 비어 있으면 안 된다(지우기만 하는 쓰임은 없다).
     */
    replaceMinuteCandlesOfDay(stockCode: string, date: string, candles: MinuteCandle[]): Promise<void>;
}
