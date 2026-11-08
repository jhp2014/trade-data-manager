import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { packageRoot } from "./paths.js";

let envLoaded = false;

/** 패키지 자체 .env(infra/daishin/.env)를 1회 로드한다. 이미 설정된 process.env 는 덮지 않는다. */
function ensureDaishinEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env"), quiet: true });
}

/** 원천 파일 폴더. 없으면 즉시 실패 — 엉뚱한 곳(cwd)에 쓰거나 읽지 않게. */
export function rawDirFromEnv(): string {
    ensureDaishinEnvLoaded();
    const dir = process.env.DAISHIN_RAW_DIR?.trim();
    if (!dir) throw new Error("DAISHIN_RAW_DIR 이 없다 — infra/daishin/.env 를 확인할 것(.env.example 참고)");
    return dir;
}
