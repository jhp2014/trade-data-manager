import type { RankAxis, RankAxisScope, AxisLine, RankPoint, RankTarget } from "#domain";

// 순위 배치 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 조립(줄 렌더)은 클라가 인메모리로: 축 피드를 받아 slotId 로 묶어 타이 셀, orderKey 로 정렬.
// 검색·확률은 후속. 자세한 설계는 domain/rank.

/** 순위 배치 조회(읽기). 축 목록 + 전 축의 줄 피드. */
export interface RankReader {
    /** 전체 축(id 오름차순). */
    listAxes(): Promise<RankAxis[]>;
    /**
     * 전 축의 배치(축별로 orderKey 오름차순). 클라가 slotId 로 묶어 타이 셀 구성.
     * 축 단건 조회를 두지 않는 이유: 소비자(배치·시트·분석·작업셋·차트)가 모두 **전 축**을 한꺼번에 본다 —
     * 축 수만큼 왕복하던 N+1 을 없애고, 캐시 키가 하나라 패널 간 줄이 어긋날 여지도 없앤다.
     */
    listAllLines(): Promise<AxisLine[]>;
}

/**
 * 순위 배치 편집(쓰기). 축 CRUD + 타점 배치/이동/제거.
 * **축은 이름으로, 자리는 타점으로 지목한다** — surrogate id 는 저장소 안에만 산다(로컬 미러와
 * Supabase 가 각자 발급하고 전체교체 때 갈리므로, 계약에 두면 동기화를 건넌 참조가 다른 행을 가리킨다).
 */
export interface RankStore {
    /** 새 축 생성 → 저장본 반환. scope 생략 시 point(타점별). */
    createAxis(name: string, scope?: RankAxisScope): Promise<RankAxis>;
    /** 축 이름 수정. 없는 이름은 조용한 no-op. */
    renameAxis(name: string, newName: string): Promise<void>;
    /** 축 삭제 — slot·placement 도 FK cascade 로 함께 제거. */
    removeAxis(name: string): Promise<void>;
    /**
     * 타점을 축에 꽂거나 이동(멱등 upsert — PK=(code,date,time,axis)). target:
     *   · {kind:"slot"}    → 기존 slot 합류(타이)
     *   · {kind:"between"} → 두 이웃 slot 사이 새 slot(중간키). 양끝 null 허용.
     * 이동으로 비워진 옛 slot 은 함께 GC(유령 slot 방지). 최종 slot 을 반환.
     * **day 축**: point 는 (종목·날짜)만 의미 — 그날 모든 타점을 같은 slot 에 fanout(미배치 타점도 끌어옴).
     * 그날 타점이 0개면 붙일 데 없음 → 거부.
     */
    place(axisName: string, point: RankPoint, target: RankTarget): Promise<{ orderKey: number }>;
    /** 배치 제거 — 비워진 slot 은 GC. 없는 배치는 조용한 no-op. day 축은 그날 전 타점을 함께 제거. */
    unplace(axisName: string, point: RankPoint): Promise<void>;
}
