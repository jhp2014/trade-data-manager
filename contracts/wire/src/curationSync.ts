// /curation/sync 계약 — 로컬 미러 당겨오기(읽기 소스 갱신).
//
// 읽기가 로컬 미러에서 나오므로 "상대가 방금 한 작업을 지금 보고 싶다"의 답이 이 엔드포인트다.
// 쓰기는 즉시 원격으로 가지만(dual write) 읽기는 명시적으로 당길 때만 새로워진다 — 비대칭이 의도다:
// 내 작업이 유실될 여지는 없어야 하지만, 상대 작업이 작업 중에 갑자기 끼어들면 작업면이 흔들린다.
export interface CurationSyncStatus {
    /** 마지막 동기화 시각(ISO). 한 번도 안 돌았으면 null. */
    syncedAt: string | null;
    /** 이번에 받아온 주요 4테이블 합계 행수. 상태 조회(GET)면 0. */
    rows: number;
    /** CURATION_DATABASE_URL 미설정 = 원격이 없음 → 아무것도 안 함(로컬 단독 운영). */
    skipped: boolean;
}
