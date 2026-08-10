import type { MapCorpus, MapPlacement, MapPlacementMove, MapScope, NewMapPlacement, SimilarityMap } from "#domain";

// 유사도 맵 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 설계는 domain/map/similarityMap.ts. 무리(MapGroup) 쓰기는 아직 없다 — 게이트("손 배치가 견딜 만한가")에
// 무리가 필요 없어 나중 슬라이스로 미뤘다. 읽기 계약에는 이미 자리가 있다(MapCorpus.groups).

/** 맵 조회(읽기). 전 맵을 한 벌로. */
export interface MapReader {
    /** 맵·무리·자리 전부 한 번에(단건 조회 없음 — 이유는 MapCorpus 주석). */
    loadCorpus(): Promise<MapCorpus>;
}

/** 맵 편집(쓰기). */
export interface MapStore {
    /** 맵 생성 → DB 가 부여한 id 를 채워 반환. 같은 이름은 거부(유니크). */
    createMap(name: string, scope: MapScope): Promise<SimilarityMap>;
    /** 이름 변경(자리·무리는 id 참조라 무관). 없는 id 는 조용한 no-op. */
    renameMap(id: string, name: string): Promise<void>;
    /** 맵 삭제 — 무리·자리도 cascade 로 함께. 되돌릴 수 없다(호출부가 확인시킬 것). */
    removeMap(id: string): Promise<void>;

    /**
     * 자리 추가 → 저장된 행들(id 포함)을 **입력 순서대로** 반환.
     * 배열인 이유는 이동과 같다: 트레이에서 여럿을 한 번에 끌어 놓는 게 정상 조작이다.
     * ⚠ 항목 키의 모양이 맵 scope 와 맞는지는 **여기서** 막는다(day 에 시각이 들어오거나 point 에 없거나).
     */
    addPlacements(mapId: string, entries: NewMapPlacement[]): Promise<MapPlacement[]>;
    /** 자리 이동(좌표만). 다중선택·무리째 드래그가 한 요청이라 부분 실패가 없다. 없는 id 는 조용히 건너뛴다. */
    movePlacements(mapId: string, moves: MapPlacementMove[]): Promise<void>;
    /** 자리 제거. 항목이 아니라 **그 자리 하나**를 지운다(다른 무리의 형제 자리는 남는다). */
    removePlacements(mapId: string, ids: string[]): Promise<void>;
}
