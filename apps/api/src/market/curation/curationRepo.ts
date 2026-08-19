import { createDb, getCurationDatabaseUrl } from "@trade-data-manager/persistence";
import { localReadDualWrite } from "./mirrorWrite.js";
import type { Pool } from "../pool.js";

/**
 * 큐레이션 저장소 한 벌 — **읽기는 로컬 미러, 쓰기는 Supabase + 로컬 재생**(mirrorWrite 주석에 이유).
 * 로컬 미러는 market 과 같은 DB 의 curation 스키마라 MARKET_POOL 로 읽는다(별도 풀이 필요 없다).
 * writes 목록이 곧 "무엇이 쓰기인가"의 단일 출처 — 여기 안 적힌 메서드는 전부 로컬로만 간다.
 */
export const curationRepo = <T extends object>(
    make: (db: ReturnType<typeof createDb>) => T,
    writes: readonly (keyof T & string)[],
    label: string,
    localPool: Pool,
    remotePool: Pool,
): T => {
    const local = make(createDb(localPool));
    // CURATION_DATABASE_URL 미설정이면 curation 풀은 같은 로컬 DB 로 폴백돼 있다(createCurationPoolFromEnv).
    // 이때 dual write 를 태우면 **같은 DB 에 모든 쓰기가 두 번** 간다 — 원격이 없으니 프록시 없이 로컬 한 벌.
    if (getCurationDatabaseUrl() === null) return local;
    return localReadDualWrite(local, make(createDb(remotePool)), writes, label);
};
