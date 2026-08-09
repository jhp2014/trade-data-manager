// POST /rank-minutes 계약 — (종목,날) 집합의 raw UN 분봉(원본 시계열). 진입가 앵커 정규화는
// 클라가 core/market(entryAnchoredBars)로 수행 → 어떤 부분집합이든 서버 재조회 없이 다룬다.
// 요청 바디(days)는 컨트롤러/클라 로컬 정의(저장분 아님) — wire 는 응답 봉투만 소유.

/**
 * 한 분봉의 UN 값. 무손실 string.
 * `open` 은 골격 패널의 **캔들 오버레이**가 쓴다 — 캔들을 이 원주가 경로에서 당기는 이유는 골격 피벗이
 * 해소되는 소스와 **같은 가격 공간**이어야 손으로 찍은 점이 자기 캔들 꼭짓점에 정확히 앉기 때문이다
 * (복기 스냅샷의 % OHLC 는 기준가 이벤트 보정이 들어가 액분·감자 종목에서 미세하게 갈린다).
 */
export interface RankMinuteBar {
    time: string; // HH:MM:SS
    open: string;
    high: string;
    low: string;
    close: string;
}

/** 한 (종목,날)의 시간 오름차순 UN 분봉. 분봉 없으면 bars=[]. */
export interface RankDayMinutes {
    stockCode: string;
    date: string; // YYYY-MM-DD
    bars: RankMinuteBar[];
}
