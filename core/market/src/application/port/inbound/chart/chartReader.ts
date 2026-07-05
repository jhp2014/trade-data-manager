import type { DailyCandle, MarketCloses, MinuteCandle } from "#domain";

/**
 * 한 종목·한 거래일의 차트 raw 번들 — 파생값 0(순수 시계열만).
 * 소비자(클라)는 이걸 받아 domain 순수함수로 %·누적·임계count 를 계산한다.
 *  - daily: [date−2년, date] inclusive, 시간 오름차순. **수정주가**(일봉 pane 연속 차트용).
 *  - minutes: 당일, **dense**(densifyMinutes 적용 — VI/무거래 내부갭이 flat-fill 된 연속 시계열). **원주가**. 채움정책은 서버(도메인)가 소유.
 *  - rawBase: 분봉 % 기준가 = 직전 거래일 **원주가** 종가(시장별) 스칼라. 분봉이 원주가라 base 도 원주가여야 스케일이 맞는다
 *    (수정주가 일봉에서 뽑으면 권리락/액분 종목에서 % 가 팩터만큼 틀어짐). 전체 원주가 일봉을 나르지 않고 이 한 값만 싣는다.
 *    상장 첫날 등 직전 캔들 없으면 null → 클라가 당일 첫 시가로 폴백.
 */
export interface ChartBundle {
    stockCode: string;
    daily: DailyCandle[];
    minutes: MinuteCandle[];
    rawBase: MarketCloses | null;
}

/**
 * 차트 조회 리더(읽기 Query) — (종목, 날짜)로 일봉2년+당일 dense분봉 raw 를 내려준다.
 * 주석(price line·review point)은 별개 컨텍스트라 ChartAnnotationReader 로 분리한다.
 */
export interface ChartReader {
    chartByCode(stockCode: string, date: string): Promise<ChartBundle>;
}
