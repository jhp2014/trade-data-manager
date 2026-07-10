import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { MinuteDateReader } from "@trade-data-manager/market";
import { DataDatesCache } from "../dataDatesCache.js";

// after 호출을 기록하는 fake 리더. calls[i] = i번째 listMinuteDates 의 after 인자.
class FakeReader implements MinuteDateReader {
    calls: (string | undefined)[] = [];
    constructor(private readonly byAfter: (after?: string) => string[]) {}
    async listMinuteDates(after?: string): Promise<string[]> {
        this.calls.push(after);
        return this.byAfter(after);
    }
}

const today = (): string => {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

let cacheFile: string;
beforeEach(async () => {
    cacheFile = path.join(await fs.mkdtemp(path.join(tmpdir(), "ddc-")), "data-dates.json");
});
afterEach(async () => {
    await fs.rm(path.dirname(cacheFile), { recursive: true, force: true });
});

describe("DataDatesCache", () => {
    it("cold: 파일 없으면 전체 distinct(after=undefined) 스캔 후 파일에 굳힌다", async () => {
        const reader = new FakeReader(() => ["2025-07-01", "2025-07-02"]);
        const cache = new DataDatesCache(reader, cacheFile);

        expect(await cache.listDataDates()).toEqual(["2025-07-01", "2025-07-02"]);
        expect(reader.calls).toEqual([undefined]); // 전체 스캔 1회
        const persisted = JSON.parse(await fs.readFile(cacheFile, "utf8"));
        expect(persisted).toMatchObject({ dates: ["2025-07-01", "2025-07-02"], maxDate: "2025-07-02", checkedAt: today() });
    });

    it("warm: 같은 날 재호출은 게이팅 — 재스캔 없이 파일만 반환", async () => {
        const reader = new FakeReader(() => ["2025-07-01"]);
        const cache = new DataDatesCache(reader, cacheFile);

        await cache.listDataDates();
        await cache.listDataDates();
        expect(reader.calls).toEqual([undefined]); // 두 번째는 스캔 안 함(checkedAt === today)
    });

    it("꼬리 증분: checkedAt 이 과거면 maxDate 초과만 스캔해 병합", async () => {
        // 어제까지 확인된 캐시를 직접 심는다.
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(
            cacheFile,
            JSON.stringify({ dates: ["2025-07-01", "2025-07-02"], maxDate: "2025-07-02", checkedAt: "2000-01-01" }),
        );
        const reader = new FakeReader((after) => (after === "2025-07-02" ? ["2025-07-03"] : []));
        const cache = new DataDatesCache(reader, cacheFile);

        expect(await cache.listDataDates()).toEqual(["2025-07-01", "2025-07-02", "2025-07-03"]);
        expect(reader.calls).toEqual(["2025-07-02"]); // 전체가 아니라 꼬리(after=maxDate)만
        const persisted = JSON.parse(await fs.readFile(cacheFile, "utf8"));
        expect(persisted).toMatchObject({ maxDate: "2025-07-03", checkedAt: today() });
    });

    it("꼬리 증분에 새 날짜가 없으면 목록 유지 + checkedAt 만 갱신", async () => {
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(
            cacheFile,
            JSON.stringify({ dates: ["2025-07-01"], maxDate: "2025-07-01", checkedAt: "2000-01-01" }),
        );
        const reader = new FakeReader(() => []);
        const cache = new DataDatesCache(reader, cacheFile);

        expect(await cache.listDataDates()).toEqual(["2025-07-01"]);
        expect(JSON.parse(await fs.readFile(cacheFile, "utf8")).checkedAt).toBe(today());
    });
});
