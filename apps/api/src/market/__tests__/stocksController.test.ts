import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { StocksController } from "../stocks/stocks.controller.js";
import type { MasterCache } from "../board/masterCache.js";

/** 마스터 캐시 대역 — 받은 코드를 그대로 되돌려 준다(무엇이 실제로 전달됐나만 본다). */
const fakeMaster = (seen: string[][]): MasterCache =>
    ({
        getByStockCodes: async (codes: string[]) => {
            seen.push(codes);
            return codes.map((stockCode) => ({ stockCode, name: `이름${stockCode}`, market: "KRX" }));
        },
    }) as unknown as MasterCache;

const codesOf = (n: number): string => Array.from({ length: n }, (_, i) => String(i).padStart(6, "0")).join(",");

describe("GET /stocks/meta — 개수 상한", () => {
    it("상한 안이면 받은 코드를 전부 넘긴다", async () => {
        const seen: string[][] = [];
        const out = await new StocksController(fakeMaster(seen)).meta(codesOf(500));
        expect(seen[0]).toHaveLength(500);
        expect(out).toHaveLength(500);
    });

    // 이게 이 파일의 이유다: 예전엔 501번째부터 조용히 버려 응답이 200이었고, 그 종목들만
    // 화면에서 이름 대신 코드로 떴다 — 에러도 경고도 없이.
    it("상한을 넘으면 자르지 않고 400 — 조용히 버리면 그 종목만 이름이 사라진다", async () => {
        const seen: string[][] = [];
        const controller = new StocksController(fakeMaster(seen));
        await expect(controller.meta(codesOf(501))).rejects.toThrow(BadRequestException);
        expect(seen).toHaveLength(0); // 조회 자체가 안 나간다
    });

    it("받은 개수를 메시지에 담는다 — 얼마나 나눠야 하는지 알 수 있게", async () => {
        const controller = new StocksController(fakeMaster([]));
        await expect(controller.meta(codesOf(700))).rejects.toThrow(/500개까지.*700/);
    });

    it("빈 입력·공백은 빈 배열(에러 아님)", async () => {
        const seen: string[][] = [];
        const controller = new StocksController(fakeMaster(seen));
        expect(await controller.meta(undefined)).toEqual([]);
        expect(await controller.meta(" , ,")).toEqual([]);
        expect(seen).toHaveLength(0);
    });

    it("비표준 코드가 섞이면 400 — 개수와 같은 규칙(조용히 버리지 않는다)", async () => {
        const controller = new StocksController(fakeMaster([]));
        await expect(controller.meta("005930,abc")).rejects.toThrow(BadRequestException);
    });
});
