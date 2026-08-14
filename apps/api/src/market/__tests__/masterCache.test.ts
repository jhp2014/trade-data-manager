// MasterCache 의 **무효화**가 두 슬롯을 다 덮나 — 코드별 캐시와 이름표 전량 목록.
//
// 이 파일의 이유: 전량 목록이 나중에 붙은 두 번째 슬롯이라, refresh() 가 예전 그대로 Map 만 비우면
// 신규상장이 화면에서 **영영 이름 없이** 뜬다(서버가 재시작될 때까지). 조회는 성공하고 응답도 200이라
// 아무도 모른다 — 옛 /stocks/meta 가 초과분을 조용히 버리던 것과 같은 종류의 침묵이다.
import { describe, it, expect } from "vitest";
import type { StockMaster, StockMasterMeta, StockMasterReader } from "@trade-data-manager/market";
import { MasterCache } from "../board/masterCache.js";

/** 호출 횟수를 세는 대역 — 캐시가 실제로 DB 를 안 쳤는지는 이걸로만 알 수 있다. */
function fakeReader(names: string[]): StockMasterReader & { allCalls: number; codeCalls: number } {
    const reader = {
        allCalls: 0,
        codeCalls: 0,
        async listAllMeta(): Promise<StockMasterMeta[]> {
            reader.allCalls++;
            return names.map((name, i) => ({ stockCode: String(i).padStart(6, "0"), name, market: "거래소" }));
        },
        async getByStockCodes(codes: string[]): Promise<StockMaster[]> {
            reader.codeCalls++;
            return codes.map((stockCode) => ({ stockCode, name: `이름${stockCode}`, market: "거래소" }) as StockMaster);
        },
    };
    return reader;
}

describe("MasterCache — 이름표 전량", () => {
    it("두 번째 호출은 DB 를 안 친다", async () => {
        const reader = fakeReader(["삼성전자"]);
        const cache = new MasterCache(reader);
        await cache.listAllMeta();
        const second = await cache.listAllMeta();
        expect(reader.allCalls).toBe(1);
        expect(second[0].name).toBe("삼성전자");
    });

    it("refresh 는 전량 목록도 비운다 — 안 그러면 신규상장이 영영 안 보인다", async () => {
        const names = ["삼성전자"];
        const reader = fakeReader(names);
        const cache = new MasterCache(reader);
        expect(await cache.listAllMeta()).toHaveLength(1);

        names.push("새로상장"); // 수집이 새 종목을 넣은 상황
        cache.refresh();

        expect(await cache.listAllMeta()).toHaveLength(2);
        expect(reader.allCalls).toBe(2);
    });

    it("refresh 는 코드별 캐시도 함께 비운다 — 무효화 지점은 하나여야 한다", async () => {
        const reader = fakeReader([]);
        const cache = new MasterCache(reader);
        await cache.getByStockCodes(["005930"]);
        await cache.getByStockCodes(["005930"]); // 캐시 적중 — 안 친다
        expect(reader.codeCalls).toBe(1);

        cache.refresh();
        await cache.getByStockCodes(["005930"]);
        expect(reader.codeCalls).toBe(2);
    });
});
