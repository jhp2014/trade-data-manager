import { spawn, execSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

// ESM 환경에서 __dirname 재구성
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // Windows: pnpm.cmd / Unix: pnpm
    const isWindows = process.platform === "win32";
    const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
    const mode = dev ? "dev" : "start";

    logger.info(`[next] ${mode} 모드로 포트 ${port}에서 기동 중...`);

    const child: ChildProcess = spawn(pnpm, ["exec", "next", mode, "-p", String(port)], {
        cwd: appDir,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
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

            const timer = setTimeout(() => {
                if (!child.killed) {
                    logger.warn("[next] SIGTERM 후 5초 경과, SIGKILL 송신");
                    child.kill("SIGKILL");
                }
            }, 5000);

            child.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });

            // Windows: taskkill로 프로세스 트리 전체 종료
            if (process.platform === "win32" && child.pid) {
                try {
                    execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
                } catch {
                    // 이미 종료된 경우 무시
                }
            } else {
                child.kill("SIGTERM");
            }
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
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`외부 서버에 접근할 수 없습니다 (${healthUrl}): ${message}`);
    }
}

export function getAppDir(): string {
    const dir = path.resolve(__dirname, "../../");
    if (!fs.existsSync(path.join(dir, "package.json"))) {
        throw new Error(
            `[chart-capture] getAppDir() 결과가 chart-capture 루트가 아닙니다: ${dir}`,
        );
    }
    return dir;
}
