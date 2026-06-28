import fs from "node:fs";
import path from "node:path";

export type FrameDir = "in" | "out" | "sys";

/** WS 프레임 기록기. 주입형(기본 noop) — recon/디버깅 시 파일로 적재. */
export type FrameLogger = (dir: FrameDir, frame: unknown) => void;

export const noopFrameLogger: FrameLogger = () => {};

/** 한 줄당 1프레임(JSONL)으로 append 하는 파일 기록기. */
export function createFileFrameLogger(filePath: string): FrameLogger {
    const abs = path.resolve(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return (dir, frame) => {
        const line = JSON.stringify({ t: new Date().toISOString(), dir, frame }) + "\n";
        fs.appendFile(abs, line, () => {});
    };
}
