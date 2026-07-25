// 순위 필터 분석 경로 타입 — 타점의 "진입 후 인트라데이 % 경로"(진입가 앵커).
// 예전엔 서버가 /rank-paths 로 파생해 줬으나, 이제 클라가 raw 분봉(/rank-minutes)을 받아
// core/market entryAnchoredBars 로 만든다. 이 파일은 그 경로의 값 모양(계약)만 소유 — 서버·클라 공용.
// horizon crop·분위·MFE/MAE 는 클라(computePathStats)가 이 위에서 계산.

/** 진입 후 경과 1분 격자의 한 바. % 는 전부 진입가(진입 분봉 UN 종가) 대비. */
export interface RankPathBar {
    t: number; // 진입 후 경과분(진입 바 = 0)
    close: number; // 종가 %
    high: number; // 고가 %(MFE 소스)
    low: number; // 저가 %(MAE 소스)
}

/** 한 타점의 진입~당일 종가 경로. t 오름차순. 분봉이 없으면 bars=[](클라가 표본에서 제외). */
export interface RankPointPath {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    bars: RankPathBar[];
}
