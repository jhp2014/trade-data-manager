import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { runPgTool, sourceDbName } from "./pg";

/** YYYYMMDD-HHmmss (로컬 시각) */
export function timestamp(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return (
        d.getFullYear().toString() +
        p(d.getMonth() + 1) +
        p(d.getDate()) +
        "-" +
        p(d.getHours()) +
        p(d.getMinutes()) +
        p(d.getSeconds())
    );
}

/** 예: trade-data-manager_20260607-233000.dump */
export function dumpFileName(d = new Date()): string {
    return `${sourceDbName()}_${timestamp(d)}.dump`;
}

/** pg_dump -Fc 전체 백업을 targetPath 에 생성. */
export async function createDump(targetPath: string): Promise<void> {
    await runPgTool("pg_dump", sourceDbName(), [
        "-Fc",
        "--no-owner",
        "--no-privileges",
        "-f",
        targetPath,
    ]);
}

/** 파일 SHA-256 (스트리밍). */
export function sha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);
        stream.on("error", reject);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

/** local 덤프를 mybox 폴더로 복사. 복사된 경로 반환. */
export function copyToMybox(localPath: string): string {
    fs.mkdirSync(config.myboxDir, { recursive: true });
    const dest = path.join(config.myboxDir, path.basename(localPath));
    fs.copyFileSync(localPath, dest);
    return dest;
}
