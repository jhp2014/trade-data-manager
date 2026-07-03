import type { ReviewPoint, ReviewPointListItem } from "#domain";

/**
 * 복기 타점 저장 포트(outbound). 자연키 (stockCode, date, time) = caseId.
 * memo 만 가변이라 upsert(충돌 시 memo 갱신)로 add/edit 를 겸한다. 자세한 설계는 domain/review/reviewPoint.ts.
 */
export interface ReviewPointRepository {
    /**
     * 타점 추가/수정(멱등 upsert). (stock,date,time) 충돌 시 memo 를 덮어쓴다.
     * (한 배치 안에 같은 키를 중복으로 넣지 말 것 — ON CONFLICT DO UPDATE 는 같은 행 2회 갱신 불가.)
     */
    upsert(points: ReviewPoint[]): Promise<void>;

    /** 이 차트(종목,날짜)의 타점들(시각 오름차순). */
    listByChart(stockCode: string, date: string): Promise<ReviewPoint[]>;

    /** 모든 타점 + 종목명 — 월별 작업셋 목록(날짜 내림차순, 같은 날 시각 오름차순). */
    listAllPoints(): Promise<ReviewPointListItem[]>;

    /** 타점 1개 삭제(자연키로 지목). */
    remove(stockCode: string, date: string, time: string): Promise<void>;
}
