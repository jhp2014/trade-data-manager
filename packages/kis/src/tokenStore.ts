import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { MaybePromise } from "./util.js";
import { packageRoot } from "./paths.js";

export interface TokenCacheEntry {
    access_token: string;
    /** KIS 만료시각 문자열 "YYYY-MM-DD HH:MM:SS". */
    expires_at: string;
}

/**
 * 토큰 캐시 저장소 추상화. 키별(=appkey 해시) 토큰을 보관한다.
 * 기본은 파일 구현이지만 주입형이라 나중에 DB 등으로 교체 가능.
 *
 * KIS 는 토큰 발급이 1초당 1건이고 24h 유효 → 캐시 재활용이 특히 중요(불필요 재발급 = EGW00133).
 */
export interface TokenStore {
    load(key: string): MaybePromise<TokenCacheEntry | null>;
    save(key: string, entry: TokenCacheEntry): MaybePromise<void>;
}

/** appkey 를 노출하지 않는 짧은 캐시 키(파일명/로그용). */
export function credentialCacheKey(appKey: string): string {
    return crypto.createHash("sha1").update(appKey).digest("hex").slice(0, 12);
}

/** 기본 토큰 캐시 디렉토리: <패키지>/.cache/kis-tokens (cwd 무관, 소비 앱들이 공유). */
const DEFAULT_TOKEN_DIR = path.join(packageRoot, ".cache", "kis-tokens");

/**
 * 파일 기반 토큰 저장소. 키마다 별도 파일이라 멀티키여도 서로 덮어쓰지 않는다.
 * 기본 경로는 패키지 기준이라, 어느 앱에서 발급하든 같은 캐시를 공유해 토큰을 재활용한다.
 * (멀티프로세스 동시 발급 race 는 인지된 한계 — 필요 시 DB 구현으로 교체.)
 */
export function createFileTokenStore(dir = DEFAULT_TOKEN_DIR): TokenStore {
    const baseDir = path.resolve(dir);
    const fileFor = (key: string) => path.join(baseDir, `${key}.json`);
    return {
        load(key) {
            const p = fileFor(key);
            if (!fs.existsSync(p)) return null;
            try {
                return JSON.parse(fs.readFileSync(p, "utf8")) as TokenCacheEntry;
            } catch {
                return null;
            }
        },
        save(key, entry) {
            fs.mkdirSync(baseDir, { recursive: true });
            fs.writeFileSync(fileFor(key), JSON.stringify(entry));
        },
    };
}

/** 인메모리 토큰 저장소 (테스트/일회성 프로세스용). */
export function createMemoryTokenStore(): TokenStore {
    const m = new Map<string, TokenCacheEntry>();
    return {
        load: (key) => m.get(key) ?? null,
        save: (key, entry) => {
            m.set(key, entry);
        },
    };
}
