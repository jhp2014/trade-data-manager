import type { DailyCandle, MinuteCandle } from "#domain";

/**
 * 한 종목·한 거래일의 차트 raw 번들 — 파생값 0(순수 시계열만).
 * 소비자(클라)는 이걸 받아 domain 순수함수로 %·누적·임계count 를 계산한다.
 *  - daily: [date−2년, date] inclusive, 시간 오름차순. 분봉 % 기준가(직전 거래일 종가)도 이 안에 있어 별도 조회 불필요.
 *  - minutes: 당일, **dense**(densifyMinutes 적용 — VI/무거래 내부갭이 flat-fill 된 연속 시계열). 채움정책은 서버(도메인)가 소유한다.
 */
export interface ChartBundle {
    stockCode: string;
    daily: DailyCandle[];
    minutes: MinuteCandle[];
}

/**
 * 차트 조회 리더(읽기 Query) — (종목, 날짜)로 일봉2년+당일 dense분봉 raw 를 내려준다.
 * 테마/이슈 → 코드 해석은 DaySummary(byTheme/byIssue)가 소유하고, 그 코드들을 chartsByCodes 로 벌크 조회한다(조립은 상위 app).
 * 주석(price line·review point)은 별개 컨텍스트라 ChartAnnotationReader 로 분리한다.
 */
export interface ChartReader {
    chartByCode(stockCode: string, date: string): Promise<ChartBundle>;
    /** 여러 종목 벌크 — 결과는 입력 코드 순서. 데이터 없는 코드는 daily/minutes 빈 배열. */
    chartsByCodes(stockCodes: string[], date: string): Promise<ChartBundle[]>;
}
