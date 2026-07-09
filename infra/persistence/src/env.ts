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
 * curation 스키마 전용 DB URL. CURATION_DATABASE_URL 을 쓰되, 미설정이면 DATABASE_URL 로 폴백한다.
 * 폴백 = market/curation 분리(Supabase) 전 과도기: 두 풀이 같은 물리 DB를 가리켜 기존과 동일 동작.
 * Supabase 생성 후 CURATION_DATABASE_URL 만 채우면 curation 이 그쪽으로 갈아탄다(코드 변경 없음).
 */
export function getCurationDatabaseUrl(): string {
    ensureDbEnvLoaded();
    return process.env.CURATION_DATABASE_URL ?? getDatabaseUrl();
}
