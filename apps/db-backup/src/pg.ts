import { spawn } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { config } from "./config";

export interface PgConn {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

/** 임의 URL → PgConn. host/port/user/password/database 추출(쿼리는 무시 — SSL 은 호출부가 PGSSLMODE 로 제어). */
export function parseConnFromUrl(url: string): PgConn {
    const u = new URL(url);
    return {
        host: u.hostname || "localhost",
        port: u.port ? Number(u.port) : 5432,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    };
}

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

function toolPath(tool: string): string {
    const exe = process.platform === "win32" ? `${tool}.exe` : tool;
    return path.join(config.pgBinDir, exe);
}

/**
 * 임의 커넥션으로 pg_dump / pg_restore 실행. 비밀번호는 PGPASSWORD 로 전달(프로세스 인자 노출 방지).
 * extraEnv 로 PGSSLMODE 등 주입 가능(예: Supabase 대상은 require = libpq 암호화·인증서검증 생략).
 * 종료코드 0 이 아니면 stderr 를 담아 throw.
 */
export function runPgToolOn(
    tool: string,
    conn: PgConn,
    extraArgs: string[],
    extraEnv: Record<string, string> = {},
): Promise<string> {
    const args = ["-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database, ...extraArgs];
    return new Promise((resolve, reject) => {
        const child = spawn(toolPath(tool), args, {
            env: { ...process.env, PGPASSWORD: conn.password, PGCLIENTENCODING: "UTF8", ...extraEnv },
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolve(stdout);
            else reject(new Error(`${tool} 종료코드 ${code}\n${stderr.trim()}`));
        });
    });
}

/** pg_dump / pg_restore 를 로컬(DATABASE_URL) DB 에 실행. runPgToolOn 을 로컬 conn 으로 감싼 것. */
export function runPgTool(tool: string, dbName: string, extraArgs: string[]): Promise<string> {
    return runPgToolOn(tool, parseConn(dbName), extraArgs);
}

/** 지정 DB 에 pg Client 로 접속해 콜백 실행 후 정리. */
export async function withClient<T>(dbName: string, fn: (client: Client) => Promise<T>): Promise<T> {
    const c = parseConn(dbName);
    const client = new Client({
        host: c.host,
        port: c.port,
        user: c.user,
        password: c.password,
        database: c.database,
    });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}
