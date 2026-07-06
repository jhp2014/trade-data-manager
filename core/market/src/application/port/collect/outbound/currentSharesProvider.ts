/**
 * 현재 상장주식수 제공 포트(ISP — 폴백용).
 * 예탁원 상장정보일정에 이벤트가 전혀 없는 종목(오래된 안정주: 코퍼레이트 액션이 커버리지 밖)은
 * 역산이 불가하다. 그런 종목은 발행주식수가 기간 내내 불변이므로, 현재 상장주식수를 상수 shares 로 쓴다.
 * 구현은 키움 ka10001(flo_stk). 단위 보정(천주→주)은 어댑터 책임. 없으면 null.
 */
export interface CurrentSharesProvider {
    getCurrentShares(stockCode: string): Promise<string | null>;
}
