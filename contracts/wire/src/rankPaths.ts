// /rank-paths 계약 — 순위 필터로 좁힌 타점 집합의 "진입 후 인트라데이 경로"(파생 읽기모델).
// situation(review point 삼중키)의 진입가 대비 % 경로를 당일 종가까지 반환한다. horizon crop·분위·MFE/MAE 는 클라가 계산.
// 요청 바디(points)는 컨트롤러/클라 로컬 정의(저장분 아님) — wire 는 응답 봉투만 소유한다.

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
