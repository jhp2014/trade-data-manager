// Inbound(driving) 포트 — 당일 시총 입력(상시 운영 Command, 쓰기).
// 백필이 끝난 뒤의 일상 경로: 매일 ka10099 한 스윕으로 전일종가×현재주식수를 그날 칸에 1행씩 upsert.

export interface DailyMarketCapRecordResult {
    date: string;
    /** 스냅샷 종목 수(개별주식 유니버스). */
    universe: number;
    /** 기록한 시총 행 수(거래정지·결손 제외分 빠짐). */
    stored: number;
}

export interface DailyMarketCapRecorder {
    /** date 칸에 전종목 시총 기록 = 전일종가 × 현재주식수. 장중 아무 때나 호출(전일종가 기준). */
    record(date: string): Promise<DailyMarketCapRecordResult>;
}
