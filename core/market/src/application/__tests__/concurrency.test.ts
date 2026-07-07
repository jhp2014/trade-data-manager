import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../concurrency.js";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("mapWithConcurrency", () => {
    it("결과를 입력 순서로 보존(완료 순서와 무관)", async () => {
        // 인덱스가 클수록 빨리 끝나게 해도 결과는 입력 순서.
        const out = await mapWithConcurrency([0, 1, 2, 3], 4, async (n) => {
            await new Promise((r) => setTimeout(r, (4 - n) * 5));
            return n * 10;
        });
        expect(out).toEqual([0, 10, 20, 30]);
    });

    it("동시 실행이 limit 을 넘지 않는다", async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await tick();
            inFlight--;
        });
        expect(maxInFlight).toBeLessThanOrEqual(3);
    });

    it("모든 항목에 대해 fn 을 정확히 한 번씩 호출", async () => {
        const seen = new Set<number>();
        await mapWithConcurrency([5, 6, 7, 8, 9], 2, async (n) => {
            seen.add(n);
        });
        expect([...seen].sort()).toEqual([5, 6, 7, 8, 9]);
    });

    it("빈 입력은 빈 배열", async () => {
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    });

    it("limit 이 NaN/Infinity/0/음수 여도 전 항목을 정상 처리(워커 0 으로 새지 않음)", async () => {
        const fn = async (n: number): Promise<number> => n * 2;
        for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -5]) {
            expect(await mapWithConcurrency([1, 2, 3], bad, fn)).toEqual([2, 4, 6]);
        }
    });
});
