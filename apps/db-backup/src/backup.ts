import crypto from "node:crypto";
import fs from "node:fs";
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

/** 파일 해시 (스트리밍). algo: "sha256" | "md5" 등. */
export function fileHash(filePath: string, algo: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash(algo);
        const stream = fs.createReadStream(filePath);
        stream.on("error", reject);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

export const sha256 = (filePath: string): Promise<string> => fileHash(filePath, "sha256");
/** Google Drive 의 md5Checksum 과 대조해 업로드 무결성 검증용. */
export const md5 = (filePath: string): Promise<string> => fileHash(filePath, "md5");
