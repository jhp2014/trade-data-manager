import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PriceLine } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzlePriceLineRepository } from "../priceLine.repository.js";

const pl = (over: Partial<PriceLine> = {}): PriceLine => ({
    stockCode: "005930",
    date: "2026-06-30",
    price: "70000",
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

    it("add — id 를 부여해 반환(price string 왕복, memo null↔undefined)", async () => {
        const added = await repo.add([
            pl({ price: "70000", memo: "1차 지지" }),
            pl({ price: "82000" }),
        ]);
        expect(added).toHaveLength(2);
        expect(added[0].id).toBeDefined();
        expect(added[0].price).toBe("70000");
        expect(added[0].memo).toBe("1차 지지");
        expect(added[1].memo).toBeUndefined();
    });

    it("listByChart — (종목,날짜) 의 선들을 id(그린 순서) 오름차순으로", async () => {
        const lines = await repo.listByChart("005930", "2026-06-30");
        expect(lines.map((l) => l.price)).toEqual(["70000", "82000"]);
    });

    it("update — price 드래그 + memo 편집(주어진 필드만)", async () => {
        const [line] = await repo.listByChart("005930", "2026-06-30");
        await repo.update(line.id!, { price: "71500" });
        await repo.update(line.id!, { memo: "지지 → 저항 전환" });
        const [updated] = await repo.listByChart("005930", "2026-06-30");
        expect(updated.price).toBe("71500");
        expect(updated.memo).toBe("지지 → 저항 전환");
    });

    it("다른 (종목,날짜) 차트끼리 격리", async () => {
        await repo.add([pl({ stockCode: "000660", date: "2026-06-30", price: "150000" })]);
        const other = await repo.listByChart("000660", "2026-06-30");
        expect(other).toHaveLength(1);
        expect(await repo.listByChart("005930", "2026-06-30")).toHaveLength(2);
    });

    it("remove — id 로 1개 삭제", async () => {
        const lines = await repo.listByChart("005930", "2026-06-30");
        await repo.remove(lines[0].id!);
        const rest = await repo.listByChart("005930", "2026-06-30");
        expect(rest.map((l) => l.price)).toEqual(["82000"]);
    });

    it("빈 배열 add 는 no-op", async () => {
        await expect(repo.add([])).resolves.toEqual([]);
    });
});
