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
