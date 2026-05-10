import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { logger } from "../lib/logger";

export interface NextServerHandle {
    baseUrl: string;
    stop: () => Promise<void>;
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const healthUrl = `${url}/api/health`;

    while (Date.now() < deadline) {
        try {
            const res = await fetch(healthUrl);
            if (res.ok) return;
        } catch {
            // 아직 기동 중
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Next.js 서버가 ${timeoutMs}ms 내에 응답하지 않았습니다: ${healthUrl}`);
}

export async function startNextServer(params: {
    port: number;
    dev: boolean;
    startTimeoutMs: number;
    appDir: string;
}): Promise<NextServerHandle> {
    const { port, dev, startTimeoutMs, appDir } = params;
    const command = dev ? "next" : "next";
    const args = dev ? ["dev", "-p", String(port)] : ["start", "-p", String(port)];

    logger.info(`[next] ${dev ? "dev" : "start"} 모드로 포트 ${port}에서 기동 중...`);

    const child: ChildProcess = spawn("pnpm", ["exec", command, ...args], {
        cwd: appDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
    });

    child.stdout?.on("data", (d: Buffer) => {
        const line = d.toString().trim();
        if (line) logger.info(`[next] ${line}`);
    });
    child.stderr?.on("data", (d: Buffer) => {
        const line = d.toString().trim();
        if (line) logger.info(`[next] ${line}`);
    });

    const baseUrl = `http://localhost:${port}`;
    await waitForHealth(baseUrl, startTimeoutMs);
    logger.info(`[next] 준비 완료: ${baseUrl}`);

    const stop = async (): Promise<void> => {
        return new Promise((resolve) => {
            if (!child.pid || child.killed) {
                resolve();
                return;
            }
            child.once("exit", () => resolve());
            child.kill("SIGTERM");
            // 5초 후 SIGKILL
            const timer = setTimeout(() => {
                if (!child.killed) child.kill("SIGKILL");
                resolve();
            }, 5000);
            child.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });
        });
    };

    return { baseUrl, stop };
}

export async function verifyExternalServer(url: string): Promise<void> {
    const healthUrl = `${url}/api/health`;
    try {
        const res = await fetch(healthUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        logger.info(`[next] 외부 서버 확인 완료: ${url}`);
    } catch (err) {
        throw new Error(`외부 서버에 접근할 수 없습니다 (${healthUrl}): ${err}`);
    }
}

export function getAppDir(): string {
    return path.resolve(__dirname, "../../..");
}
