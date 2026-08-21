import type { ReviewPoint } from "#domain";

// 복기 타점 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 자연키 (stockCode, date, time) = caseId. 자세한 설계는 domain/review/reviewPoint.ts.

/** 복기 타점 조회(읽기). 복제본 피드·읽기모델(계산 축·골격)이 의존.
 *  (옛 listByChart — per-chart GET — 은 클라 복제본 셀렉터가 흡수하며 은퇴.) */
export interface ReviewPointReader {
    /** 모든 타점(종목명 없음 — 이름은 클라 부팅 사전 stock-master). 날짜 내림차순, 같은 날 시각 오름차순. */
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
