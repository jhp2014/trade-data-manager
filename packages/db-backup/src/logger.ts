import fs from "node:fs";
import path from "node:path";

export interface Logger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}

/**
 * 콘솔 + 월별 로그 파일에 동시 기록.
 * 무인(스케줄러) 실행이라 콘솔 출력이 사라지므로 파일 로그를 함께 남긴다.
 */
export function createLogger(logDir: string): Logger {
    fs.mkdirSync(logDir, { recursive: true });
    const ym = new Date().toISOString().slice(0, 7).replace("-", "");
    const file = path.join(logDir, `db-backup-${ym}.log`);

    const write = (level: "INFO" | "WARN" | "ERROR", msg: string): void => {
        const line = `[${level}] ${new Date().toISOString()} ${msg}`;
        if (level === "ERROR") console.error(line);
        else if (level === "WARN") console.warn(line);
        else console.log(line);
        try {
            fs.appendFileSync(file, line + "\n", "utf-8");
        } catch {
            /* 로그 파일 기록 실패는 백업 자체를 막지 않는다 */
        }
    };

    return {
        info: (m) => write("INFO", m),
        warn: (m) => write("WARN", m),
        error: (m) => write("ERROR", m),
    };
}
