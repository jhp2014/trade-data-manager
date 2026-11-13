import type { DateRange, MinuteCandle } from "#domain";

/** 종목-날 좌표. */
export interface MinuteStockDay {
    stockCode: string;
    date: string;
}

/**
 * 옛 분봉 수리 포트(collect — 대상 찾기 + 종목-날 통째 교체). 구현은 infra/persistence(Drizzle).
 * 쓰임 = NXT 출범 뒤 토스분을 다른 소스(대신)로 바꾸기(decisions 「옛 분봉 — 토스 바탕 + 대신 수리」).
 */
export interface MinuteRepairStore {
    /**
     * 분봉 KRX 칸이 전부 빈 종목-날 — NXT 출범(2025-03-04) 뒤 토스가 넣은 날이 이 모양이다(토스는 통합 시세뿐이라
     * KRX 칸을 비웠고, 그때 NXT·지금 빠진 종목은 통합 칸도 KRX 체결뿐이었다). 날짜·종목 오름차순.
     * 대신 K+N 으로 바꾸면 KRX 칸이 차서 빠지므로 재실행 = 남은 것만. 그날 KRX 체결이 아예 없던 날(거래정지 중 NXT 만)은 남는다.
     */
    listKrxlessMinuteDays(range: DateRange): Promise<MinuteStockDay[]>;
    /**
     * 그 종목-날의 분봉을 지우고 candles 로 채운다(한 트랜잭션). 자연키 upsert 와 달리 새 소스에 없는 시각이 남지 않는다.
     * candles 는 전부 그 종목-날이어야 하고 비어 있으면 안 된다(지우기만 하는 쓰임은 없다).
     */
    replaceMinuteCandlesOfDay(stockCode: string, date: string, candles: MinuteCandle[]): Promise<void>;
}
