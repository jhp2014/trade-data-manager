import type { RankAxis, RankAxisScope, PlacedPoint, RankPoint, RankTarget } from "#domain";

// 순위 배치 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 조립(줄 렌더)은 클라가 인메모리로: 한 축 피드를 받아 slotId 로 묶어 타이 셀, orderKey 로 정렬.
// 검색·확률은 후속. 자세한 설계는 domain/rank.

/** 순위 배치 조회(읽기). 축 목록 + 한 축의 줄 피드. */
export interface RankReader {
    /** 전체 축(id 오름차순). */
    listAxes(): Promise<RankAxis[]>;
    /** 한 축의 모든 배치(orderKey 오름차순). 클라가 slotId 로 묶어 타이 셀 구성. */
    listAxisLine(axisId: string): Promise<PlacedPoint[]>;
}

/** 순위 배치 편집(쓰기). 축 CRUD + 타점 배치/이동/제거. */
export interface RankStore {
    /** 새 축 생성 → DB 가 부여한 id 를 채워 반환. scope 생략 시 point(타점별). */
    createAxis(name: string, scope?: RankAxisScope): Promise<RankAxis>;
    /** 축 이름 수정. 없는 id 는 조용한 no-op. */
    renameAxis(id: string, name: string): Promise<void>;
    /** 축 삭제 — slot·placement 도 FK cascade 로 함께 제거. */
    removeAxis(id: string): Promise<void>;
    /**
     * 타점을 축에 꽂거나 이동(멱등 upsert — PK=(code,date,time,axis)). target:
     *   · {kind:"slot"}    → 기존 slot 합류(타이)
     *   · {kind:"between"} → 두 이웃 slot 사이 새 slot(중간키). 양끝 null 허용.
     * 이동으로 비워진 옛 slot 은 함께 GC(유령 slot 방지). 최종 slot 을 반환.
     * **day 축**: point 는 (종목·날짜)만 의미 — 그날 모든 타점을 같은 slot 에 fanout(미배치 타점도 끌어옴).
     * 그날 타점이 0개면 붙일 데 없음 → 거부.
     */
    place(axisId: string, point: RankPoint, target: RankTarget): Promise<{ slotId: string; orderKey: number }>;
    /** 배치 제거 — 비워진 slot 은 GC. 없는 배치는 조용한 no-op. day 축은 그날 전 타점을 함께 제거. */
    unplace(axisId: string, point: RankPoint): Promise<void>;
}
