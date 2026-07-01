import { describe, it, expect } from "vitest";
import { ChartAnnotationService } from "../chartAnnotationService.js";
import type { PriceLine, ReviewPoint } from "#domain";

interface Data {
    linesByCode?: Record<string, PriceLine[]>;
    pointsByCode?: Record<string, ReviewPoint[]>;
}

function service(d: Data) {
    return new ChartAnnotationService({
        priceLine: {
            listByChart: async (code) => d.linesByCode?.[code] ?? [],
            add: async (lines) => lines,
            update: async () => {},
            remove: async () => {},
        },
        reviewPoint: {
            listByChart: async (code) => d.pointsByCode?.[code] ?? [],
            upsert: async () => {},
            remove: async () => {},
        },
    });
}

const date = "2026-06-26";

describe("ChartAnnotationService", () => {
    it("한 종목의 가격선 + 타점을 함께 조회", async () => {
        const line: PriceLine = { id: "1", stockCode: "005930", date, price: "70000" };
        const point: ReviewPoint = { stockCode: "005930", date, time: "09:30:00", memo: "돌파" };
        const a = await service({ linesByCode: { "005930": [line] }, pointsByCode: { "005930": [point] } })
            .annotationsByCode("005930", date);
        expect(a).toEqual({ stockCode: "005930", priceLines: [line], reviewPoints: [point] });
    });

    it("annotationsByCodes 는 입력 순서 유지, 없는 코드는 빈 배열", async () => {
        const line: PriceLine = { id: "1", stockCode: "005930", date, price: "70000" };
        const list = await service({ linesByCode: { "005930": [line] } })
            .annotationsByCodes(["005930", "999999"], date);
        expect(list.map((x) => x.stockCode)).toEqual(["005930", "999999"]);
        expect(list[0].priceLines).toEqual([line]);
        expect(list[1]).toEqual({ stockCode: "999999", priceLines: [], reviewPoints: [] });
    });
});
