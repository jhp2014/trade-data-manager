// POST /rank-minutes 계약 — (종목,날) 집합의 raw UN 분봉(원본 시계열). 진입가 앵커 정규화는
// 클라가 core/market(entryAnchoredBars)로 수행 → 어떤 부분집합이든 서버 재조회 없이 다룬다.
// 요청 바디(days)는 컨트롤러/클라 로컬 정의(저장분 아님) — wire 는 응답 봉투만 소유.

/** 한 분봉의 UN 값(진입가 앵커 %에 필요한 것만). 무손실 string. */
export interface RankMinuteBar {
    time: string; // HH:MM:SS
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
