import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

// CACHE_ROOT 가 모듈 로드 시 env 에서 굳으므로, env 세팅 후 동적 import(파일별 모듈 격리 전제).
let cacheDir: string;
let mod: typeof import("../daySnapshotCache.js");

beforeAll(async () => {
    cacheDir = await fs.mkdtemp(path.join(tmpdir(), "dsc-"));
    process.env.DAY_SNAPSHOT_CACHE_DIR = cacheDir;
    mod = await import("../daySnapshotCache.js");
});
afterAll(async () => {
    delete process.env.DAY_SNAPSHOT_CACHE_DIR;
    await fs.rm(cacheDir, { recursive: true, force: true });
});

describe("daySnapshotCache read/write", () => {
    it("write→read 라운드트립, 없는 날짜는 null", async () => {
        const file = { date: "2026-06-25", stocks: [] };
        await mod.writeSnapshot(file);
        expect(await mod.readSnapshot("2026-06-25")).toEqual(file);
        expect(await mod.readSnapshot("2026-06-24")).toBeNull();
    });

    it("손상 파일(gzip 아님)은 miss 처리 — 삭제 후 null(재빌드 자가치유)", async () => {
        const fp = path.join(cacheDir, "2026-06-26.json.gz");
        await fs.writeFile(fp, "gzip 이 아닌 내용", "utf8");
        expect(await mod.readSnapshot("2026-06-26")).toBeNull();
        // 손상 파일이 치워져 다음 빌드가 재생성 가능
        await expect(fs.access(fp)).rejects.toMatchObject({ code: "ENOENT" });
    });
});
