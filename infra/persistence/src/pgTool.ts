import { spawn } from "node:child_process";
import path from "node:path";
import { Client } from "pg";

/**
 * pg_dump / pg_restore 같은 PostgreSQL 클라이언트 도구를 돌리기 위한 원시 헬퍼.
 * 설정(어느 DB·어느 bin 경로)을 읽지 않는다 — 전부 인자로 받는다.
 * 소비자가 둘(db-ops CLI·api 미러)이라 여기 둔다. 설정 결합은 각 앱의 래퍼가 진다.
 */
export interface PgConn {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

/** 임의 URL → PgConn. 쿼리스트링은 무시 — SSL 은 호출부가 PGSSLMODE 로 제어한다. */
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
 * 도구 실행. 비밀번호는 PGPASSWORD 로 전달(프로세스 인자 노출 방지).
 * extraEnv 로 PGSSLMODE 등 주입 가능(예: Supabase 대상은 require = 암호화·인증서검증 생략).
 * 종료코드 0 이 아니면 stderr 를 담아 throw.
 */
export function runPgToolOn(
    pgBinDir: string,
    tool: string,
    conn: PgConn,
    extraArgs: string[],
    extraEnv: Record<string, string> = {},
): Promise<string> {
    const exe = process.platform === "win32" ? `${tool}.exe` : tool;
    const args = ["-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database, ...extraArgs];
    return new Promise((resolve, reject) => {
        const child = spawn(path.join(pgBinDir, exe), args, {
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

/** 지정 커넥션에 pg Client 로 접속해 콜백 실행 후 정리. */
export async function withPgClient<T>(conn: PgConn, fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client(conn);
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}
