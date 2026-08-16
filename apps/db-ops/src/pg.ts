import { Client } from "pg";
import {
    parseConnFromUrl,
    runPgToolOn as runPgToolOnBin,
    withPgClient,
    type PgConn,
} from "@trade-data-manager/persistence/pg-tool";
import { config } from "./config";

// 원시 헬퍼(URL 파싱·도구 실행·클라이언트)는 @infra/persistence 소유 — api 미러도 같은 걸 쓴다.
// 여기 남는 건 "이 앱의 설정을 물린 래퍼"뿐: 로컬 DATABASE_URL 기준 conn 과 config.pgBinDir.
export { parseConnFromUrl, type PgConn };

/**
 * DATABASE_URL(로컬) 을 파싱한다. dbName 을 주면 DB 이름만 갈아끼우고
 * host/port/user/password 는 그대로 재사용한다. (임시 DB / 유지보수 DB 접속용)
 */
export function parseConn(dbName?: string): PgConn {
    const c = parseConnFromUrl(config.databaseUrl);
    return dbName ? { ...c, database: dbName } : c;
}

/** 원본 DB 이름 (DATABASE_URL 의 path) */
export function sourceDbName(): string {
    return parseConn().database;
}

/** 임의 커넥션으로 pg_dump / pg_restore 실행. bin 경로는 이 앱 설정에서 물린다. */
export function runPgToolOn(
    tool: string,
    conn: PgConn,
    extraArgs: string[],
    extraEnv: Record<string, string> = {},
): Promise<string> {
    return runPgToolOnBin(config.pgBinDir, tool, conn, extraArgs, extraEnv);
}

/** pg_dump / pg_restore 를 로컬(DATABASE_URL) DB 에 실행. runPgToolOn 을 로컬 conn 으로 감싼 것. */
export function runPgTool(tool: string, dbName: string, extraArgs: string[]): Promise<string> {
    return runPgToolOn(tool, parseConn(dbName), extraArgs);
}

/** 지정 DB 에 pg Client 로 접속해 콜백 실행 후 정리. */
export function withClient<T>(dbName: string, fn: (client: Client) => Promise<T>): Promise<T> {
    return withPgClient(parseConn(dbName), fn);
}
