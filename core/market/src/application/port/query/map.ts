import type { MapScope, SimilarityMap } from "#domain";

// 유사도 맵 포트 — 평면 자체만 다룬다. **점(그룹)의 좌표·부모는 그룹이 든다**(port/query/group.ts):
// 그룹 하나는 평면 하나에 살고, 조인 테이블을 두면 아무도 안 쓰는 자유도가 생긴다.
// 설계는 domain/map/similarityMap.ts.

/** 평면 조회. */
export interface MapReader {
    /** 평면 전체(몇 장 안 된다). 그 위의 그룹은 GroupReader.listGroups 에서 mapName 으로 걸러 온다. */
    listMaps(): Promise<SimilarityMap[]>;
}

/**
 * 평면 편집. **지목은 이름으로** — surrogate id 는 저장소 안에만 산다(로컬 미러와 Supabase 가 각자
 * 발급하고 전체교체 때 갈리므로, 계약에 두면 동기화를 건넌 참조가 다른 행을 가리킨다).
 */
export interface MapStore {
    /** 생성. scope 는 만든 뒤 못 바꾼다 — 올릴 수 있는 그룹의 층위가 곧 평면의 정체다. */
    createMap(name: string, scope: MapScope): Promise<SimilarityMap>;
    /** 이름 변경. 없는 이름은 조용한 no-op. */
    renameMap(name: string, newName: string): Promise<void>;
    /**
     * 삭제 — 그 평면의 그룹은 **지워지지 않고 내려온다**(map_id·좌표가 풀린다). 그룹은 평면보다 오래 산다:
     * 평면은 보는 방식일 뿐이고 분류는 그것과 무관하게 남아야 한다.
     * FK 로 안 걸고 앱이 한 트랜잭션에서 처리한다(curation 은 무결성을 앱이 관리하는 스키마).
     */
    removeMap(name: string): Promise<void>;
}
