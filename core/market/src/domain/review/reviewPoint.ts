// core/market/domain/review — 타점 좌표. **저장물이 아니다**(2026-09-01 손 타점 폐지):
// 타점은 이제 격자(domain/grid)에서 읽기 시점에 파생되고, 여기 남은 건 그 파생물을 지목하는
// 좌표 타입과 키 직렬화뿐이다 — 화면·캐시·맵이 같은 문자열 계약을 봐야 해서 도메인에 산다.
// (옛 review_points 테이블·outcome·memo·순위 배치 하류는 전부 사라졌다.)

/**
 * 타점 좌표 삼중키 — 화면·캐시·시트가 파생 타점 하나를 지목할 때 쓰는 최소 식별자.
 * 큐레이션 속성(outcome·memo) 없이 "어느 타점이냐"만 말한다.
 */
export interface ReviewPointKey {
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
}

/**
 * 타점 키 직렬화 — `stockCode|date|time`. 캐시 키·맵 키·DOM data-* 가 전부 이 형식을 쓴다.
 * 구분자 `|` 는 종목코드(영숫자)·날짜·시각 어디에도 안 나온다. **여기가 유일한 정의다** — 리졸버·캐시·클라가
 * 각자 문자열을 조립하면 구분자 계약이 흩어져 한 곳만 바뀌는 사고가 난다(4곳 중복을 걷어낸 자리).
 */
export const pointKeyOf = (p: ReviewPointKey): string => `${p.stockCode}|${p.date}|${p.time}`;

/** 차트 키 직렬화 — `stockCode|date`. 차트(종목,날짜) grain 의 맵 키. pointKeyOf 와 같은 계약. */
export const chartKeyOf = (c: { stockCode: string; date: string }): string => `${c.stockCode}|${c.date}`;
