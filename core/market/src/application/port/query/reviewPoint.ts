import type { ReviewPoint } from "#domain";

// 복기 타점 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 자연키 (stockCode, date, time) = caseId. 자세한 설계는 domain/review/reviewPoint.ts.

/** 복기 타점 조회(읽기). 차트 주석 표시·월별 작업셋 소비자가 의존. */
export interface ReviewPointReader {
    /** 이 차트(종목,날짜)의 타점들(시각 오름차순). */
    listByChart(stockCode: string, date: string): Promise<ReviewPoint[]>;

    /** 모든 타점(종목명 없음 — 이름은 app 레이어가 market.stock_master 로 붙인다). 날짜 내림차순, 같은 날 시각 오름차순. */
    listAllPoints(): Promise<ReviewPoint[]>;
}

/** 복기 타점 편집(쓰기). memo 만 가변이라 upsert 로 add/edit 를 겸한다. */
export interface ReviewPointStore {
    /**
     * 타점 추가/수정(멱등 upsert). (stock,date,time) 충돌 시 memo 를 덮어쓴다.
     * (한 배치 안에 같은 키를 중복으로 넣지 말 것 — ON CONFLICT DO UPDATE 는 같은 행 2회 갱신 불가.)
     */
    upsert(points: ReviewPoint[]): Promise<void>;

    /** 타점 1개 삭제(자연키로 지목). */
    remove(stockCode: string, date: string, time: string): Promise<void>;
}
