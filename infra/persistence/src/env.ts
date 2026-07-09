import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

/** 패키지 자급 .env(infra/db/.env)를 1회 로드. config 주입 경로(테스트 등)는 이걸 안 부르면 디스크 무관. */
export function ensureDbEnvLoaded(): void {
    if (loaded) return;
    const __dirname = dirname(fileURLToPath(import.meta.url));
    config({ path: resolve(__dirname, "../.env") });
    loaded = true;
}

/** .env 를 로드하고 DATABASE_URL 을 돌려준다. 없으면 throw. */
export function getDatabaseUrl(): string {
    ensureDbEnvLoaded();
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 미설정 — infra/db/.env 를 확인하세요.");
    return url;
}

/**
 * 설정된 curation 전용 DB URL(CURATION_DATABASE_URL). 미설정이면 null = market 과 같은 DB(별도 분리 안 됨).
 * "없을 때 어디로 붙나"는 커넥션이 필요한 시점의 정책이라 여기서 정하지 않는다 —
 *   · 풀 팩토리(db.createCurationPoolFromEnv): null 이면 market DB 로 폴백(분리 전 과도기 동일 동작),
 *   · db-backup 미러: null 이면 "별도 DB 없음"으로 보고 미러를 건너뛴다.
 */
export function getCurationDatabaseUrl(): string | null {
    ensureDbEnvLoaded();
    return process.env.CURATION_DATABASE_URL?.trim() || null;
}
