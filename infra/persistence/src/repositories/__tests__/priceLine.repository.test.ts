import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PriceLine } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzlePriceLineRepository } from "../priceLine.repository.js";

const pl = (over: Partial<PriceLine> = {}): PriceLine => ({
    stockCode: "005930",
    date: "2026-06-30",
    anchorDate: "2026-06-30",
    field: "high",
    ...over,
});

describe("DrizzlePriceLineRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzlePriceLineRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzlePriceLineRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("add — id 부여 반환. 일봉 앵커(anchorTime undefined) + memo null↔undefined", async () => {
        const added = await repo.add([
            pl({ anchorDate: "2026-06-25", memo: "1차 지지" }),
            pl({ anchorDate: "2026-06-28" }),
        ]);
        expect(added).toHaveLength(2);
        expect(added[0].id).toBeDefined();
        expect(added[0].anchorDate).toBe("2026-06-25");
        expect(added[0].anchorTime).toBeUndefined(); // 일봉 앵커
        expect(added[0].field).toBe("high");
        expect(added[0].memo).toBe("1차 지지");
        expect(added[1].memo).toBeUndefined();
    });

    it("분봉 앵커(anchorTime + field) 왕복", async () => {
        const [line] = await repo.add([
            pl({ date: "2026-07-01", anchorDate: "2026-07-01", anchorTime: "09:31:00", field: "low" }),
        ]);
        const [got] = await repo.listByChart("005930", "2026-07-01");
        expect(got.id).toBe(line.id);
        expect(got.anchorTime).toBe("09:31:00"); // 분봉 앵커
        expect(got.field).toBe("low");
    });

    it("listByChart — (종목,날짜) 의 선들을 id(그린 순서) 오름차순으로", async () => {
        const lines = await repo.listByChart("005930", "2026-06-30");
        expect(lines.map((l) => l.anchorDate)).toEqual(["2026-06-25", "2026-06-28"]);
    });

    it("다른 (종목,날짜) 차트끼리 격리", async () => {
        await repo.add([pl({ stockCode: "000660", date: "2026-06-30", anchorDate: "2026-06-30" })]);
        const other = await repo.listByChart("000660", "2026-06-30");
        expect(other).toHaveLength(1);
        expect(await repo.listByChart("005930", "2026-06-30")).toHaveLength(2);
    });

    it("remove — id 로 1개 삭제", async () => {
        const lines = await repo.listByChart("005930", "2026-06-30");
        await repo.remove(lines[0].id!);
        const rest = await repo.listByChart("005930", "2026-06-30");
        expect(rest.map((l) => l.anchorDate)).toEqual(["2026-06-28"]);
    });

    it("빈 배열 add 는 no-op", async () => {
        await expect(repo.add([])).resolves.toEqual([]);
    });
});
