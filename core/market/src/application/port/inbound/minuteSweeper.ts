// Inbound(driving) 포트 — 한 거래일 분봉 수집·선별 적재(복기 3단계).
// fetch 는 넓게(거래대금 탑400 ∪ ≥15%), 저장은 좁게(분단위 누적거래대금 ever-탑100 ∪ ≥15% 게이너).
export interface MinuteSweepResult {
    date: string;
    /** fetch 대상(거래대금 탑400 ∪ ≥15%) 종목 수. */
    poolSize: number;
    /** 실제 분봉 받은 종목 수(실패 제외). */
    fetched: number;
    /** 저장 필터 통과해 영속화한 종목 수. */
    stored: number;
    failed: { stockCode: string; error: string }[];
}

export interface MinuteSweepOptions {
    /** fetch pool 상한(스모크용). 미지정 = 전체 pool. */
    poolLimit?: number;
    /** 저장 기준 = 분단위 누적거래대금 상위 몇 위(기본 100, 확정값). 테스트/튜닝용 노브. */
    minuteTop?: number;
    /** 분봉 fetch 동시 실행 상한(기본 8). 풀이 rate limit 자체 페이싱하므로 천장은 안 넘는다. */
    concurrency?: number;
    /** 종목 단위 진행 콜백(앱에서 로깅). done 은 완료 순서(동시성이라 입력순 아님). */
    onFetch?: (done: number, total: number, stockCode: string) => void;
}

export interface MinuteSweeper {
    /** date 의 pool 분봉을 받아(휘발) 선별한 종목만 영속화한다. 종목 fetch 실패는 모아서 계속. */
    sweepMinutesForDate(date: string, options?: MinuteSweepOptions): Promise<MinuteSweepResult>;
}
