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

/**
 * DATABASE_URL 을 파싱한다. dbName 을 주면 DB 이름만 갈아끼우고
 * host/port/user/password 는 그대로 재사용한다. (임시 DB / 유지보수 DB 접속용)
 */
export function parseConn(dbName?: string): PgConn {
    const u = new URL(config.databaseUrl);
    return {
        host: u.hostname || "localhost",
        port: u.port ? Number(u.port) : 5432,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: dbName ?? decodeURIComponent(u.pathname.replace(/^\//, "")),
    };
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
 * pg_dump / pg_restore 실행. 비밀번호는 PGPASSWORD 로 전달(프로세스 인자 노출 방지).
 * 종료코드 0 이 아니면 stderr 를 담아 throw.
 */
export function runPgTool(tool: string, dbName: string, extraArgs: string[]): Promise<string> {
    const c = parseConn(dbName);
    const args = ["-h", c.host, "-p", String(c.port), "-U", c.user, "-d", c.database, ...extraArgs];
    return new Promise((resolve, reject) => {
        const child = spawn(toolPath(tool), args, {
            env: { ...process.env, PGPASSWORD: c.password, PGCLIENTENCODING: "UTF8" },
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
