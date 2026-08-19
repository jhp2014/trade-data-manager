import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// 오늘을 주입해 게이트를 결정적으로 검증한다(실제 시계 무관) — DerivedCache 의 today 주입과 같은 idiom.
const TODAY = "2025-07-03";

let cacheFile: string;
beforeEach(async () => {
    cacheFile = path.join(await fs.mkdtemp(path.join(tmpdir(), "ddc-")), "data-dates.json");
});
afterEach(async () => {
    await fs.rm(path.dirname(cacheFile), { recursive: true, force: true });
});

const make = (reader: FakeReader, today = TODAY): DataDatesCache => new DataDatesCache(reader, cacheFile, () => today);

describe("DataDatesCache", () => {
    it("cold: 파일 없으면 전체 distinct(after=undefined) 스캔 후 파일에 굳힌다", async () => {
        const reader = new FakeReader(() => ["2025-07-01", "2025-07-02"]);
        const cache = make(reader);

        expect(await cache.listDataDates()).toEqual(["2025-07-01", "2025-07-02"]);
        expect(reader.calls).toEqual([undefined]); // 전체 스캔 1회
        const persisted = JSON.parse(await fs.readFile(cacheFile, "utf8"));
        expect(persisted).toMatchObject({ dates: ["2025-07-01", "2025-07-02"], maxDate: "2025-07-02" });
    });

    it("maxDate 가 오늘이면 재호출은 스캔 없이 파일만 반환", async () => {
        const reader = new FakeReader(() => ["2025-07-02", TODAY]);
        const cache = make(reader);

        await cache.listDataDates();
        await cache.listDataDates();
        expect(reader.calls).toEqual([undefined]); // 두 번째는 스캔 안 함(maxDate >= today)
    });

    it("maxDate < 오늘이면 같은 날이라도 재호출마다 꼬리를 재확인한다 — 저녁 수집분이 그날 밤 보여야 한다", async () => {
        // 옛 "하루 1회(checkedAt)" 게이팅의 회귀 방지: 아침에 확인했다는 이유로 20:30 수집분을 다음날까지 숨겼다.
        const collected: string[] = []; // 아직 오늘 데이터 없음
        const reader = new FakeReader((after) => (after === "2025-07-02" ? collected : ["2025-07-01", "2025-07-02"]));
        const cache = make(reader);

        expect(await cache.listDataDates()).toEqual(["2025-07-01", "2025-07-02"]); // cold
        expect(await cache.listDataDates()).toEqual(["2025-07-01", "2025-07-02"]); // 꼬리 재확인(빈 결과)
        expect(reader.calls).toEqual([undefined, "2025-07-02"]);

        collected.push(TODAY); // 저녁 수집이 오늘치를 넣었다
        expect(await cache.listDataDates()).toEqual(["2025-07-01", "2025-07-02", TODAY]);

        await cache.listDataDates(); // 오늘이 들어왔으니 이제 게이팅 — 더는 스캔 안 함
        expect(reader.calls).toEqual([undefined, "2025-07-02", "2025-07-02"]);
    });

    it("꼬리 증분: 심어둔 캐시에서 maxDate 초과만 스캔해 병합", async () => {
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify({ dates: ["2025-07-01", "2025-07-02"], maxDate: "2025-07-02" }));
        const reader = new FakeReader((after) => (after === "2025-07-02" ? [TODAY] : []));
        const cache = make(reader);

        expect(await cache.listDataDates()).toEqual(["2025-07-01", "2025-07-02", TODAY]);
        expect(reader.calls).toEqual(["2025-07-02"]); // 전체가 아니라 꼬리(after=maxDate)만
        const persisted = JSON.parse(await fs.readFile(cacheFile, "utf8"));
        expect(persisted).toMatchObject({ maxDate: TODAY });
    });

    it("손상 파일(JSON 아님)은 miss 처리 — 삭제 후 cold 전체 스캔으로 자가치유", async () => {
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, "{ 잘린 json", "utf8");
        const reader = new FakeReader(() => ["2025-07-01"]);
        const cache = make(reader);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(await cache.listDataDates()).toEqual(["2025-07-01"]);
        expect(reader.calls).toEqual([undefined]); // 손상 = 파일 없음과 동일하게 전체 스캔
        // 재생성된 파일은 정상
        expect(JSON.parse(await fs.readFile(cacheFile, "utf8")).dates).toEqual(["2025-07-01"]);
        warn.mockRestore();
    });

    it("캐시 쓰기 실패는 결과를 죽이지 않는다 — 목록은 메모리에서 그대로 서빙", async () => {
        const reader = new FakeReader(() => ["2025-07-01"]);
        const cache = make(reader);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        // 원자적 교체(rename)를 실패시킨다 — 권한·용량 실패의 대역.
        const rename = vi.spyOn(fs, "rename").mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }));

        expect(await cache.listDataDates()).toEqual(["2025-07-01"]);
        expect(warn).toHaveBeenCalled();
        rename.mockRestore();
        warn.mockRestore();
    });
});
