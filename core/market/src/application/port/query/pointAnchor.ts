import type { PointAnchor, ReviewPointKey } from "#domain";

// 타점 파라미터 앵커 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 자연키 (타점, param) — 한 타점은 한 param 하나(upsert 교체). 자세한 설계는 domain/review/pointAnchor.ts.

/** 앵커 조회(읽기). 차트 표시(그 차트 타점들의 앵커) + 계산 축(전 타점 배치 조회)이 의존. */
export interface PointAnchorReader {
    /** 이 차트(종목,날짜) 모든 타점의 앵커들. */
    listByChart(stockCode: string, date: string): Promise<PointAnchor[]>;
    /** 전 앵커 — 계산 축 굽기(전 타점 대상)용. 타점 수 규모라 페이징 불필요. */
    listAll(): Promise<PointAnchor[]>;
}

/** 앵커 편집(쓰기). 차트 우클릭 메뉴가 의존. */
export interface PointAnchorStore {
    /** 앵커 지정/교체(멱등 upsert — PK=(타점,param)). */
    upsert(anchor: PointAnchor): Promise<void>;
    /** 앵커 해제(자연키로 지목). 없는 앵커는 조용한 no-op. */
    remove(point: ReviewPointKey, param: string): Promise<void>;
}
