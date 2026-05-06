import path from "node:path";

/**
 * DECKS_DIR 환경변수에서 베이스 디렉토리 경로 해석.
 * 미설정 시 throw.
 */
export function resolveDecksBaseDir(): string {
    const dir = process.env.DECKS_DIR;
    if (!dir || dir.trim() === "") {
        throw new Error(
            "[deck] DECKS_DIR environment variable is not set. " +
            "Please configure it in your .env file."
        );
    }
    return path.resolve(dir);
}

/**
 * 베이스 디렉토리와 하위 경로를 합쳐 절대 경로 반환.
 * subPath가 베이스 디렉토리 밖으로 나가지 않는지 검증 (path traversal 방지).
 */
export function resolveDeckSubDir(subPath: string): string {
    const base = resolveDecksBaseDir();
    const resolved = path.resolve(base, subPath);
    if (!resolved.startsWith(base)) {
        throw new Error(
            `[deck] Resolved path escapes base directory: ${resolved}`
        );
    }
    return resolved;
}
