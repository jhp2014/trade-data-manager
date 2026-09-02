import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DailyMarketCap, DailyStockStat } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { dailyCandles, dailyCandlesRaw } from "../../schema/market.js";
import { DrizzleDailyMarketCapRepository } from "../dailyMarketCap.repository.js";

const stat = (
    stockCode: string,
    date: string,
    marketCap: string,
    listShares: string,
    sectTpNm: string | null = null,
): DailyStockStat => ({ stockCode, date, marketCap, listShares, sectTpNm });

const cap = (stockCode: string, date: string, marketCap: string): DailyMarketCap => ({
    stockCode,
    date,
    marketCap,
});

/**
 * fillMissingTradedDays 는 "그날 거래했나"를 일봉으로 판정하고 값은 원주가 종가로 만든다 →
 * 수정본·원주가 둘 다 심는다. close 는 원주가 KRX 종가(계산에 쓰이는 값).
 */
async function seedCandles(t: TestDb, stockCode: string, tradeDate: string, close: number): Promise<void> {
    const ohlcv = {
        openKrx: close, highKrx: close, lowKrx: close, closeKrx: close, volumeKrx: 0n, amountKrx: 0n,
        openUn: close, highUn: close, lowUn: close, closeUn: close, volumeUn: 0n, amountUn: 0n,
    };
    await t.db.insert(dailyCandles).values({ tradeDate, stockCode, ...ohlcv });
    await t.db.insert(dailyCandlesRaw).values({ stockCode, tradeDate, ...ohlcv });
}

describe("DrizzleDailyMarketCapRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleDailyMarketCapRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleDailyMarketCapRepository(t.db);
    });
    afterAll(async () => {
        await t.close();
    });

    it("저장 왕복 — 그 코드만(없는 코드 제외), bigint↔string 무손실", async () => {
        await repo.saveDailyStats([
            stat("005930", "2026-06-25", "400000000000000", "5969782550"),
            stat("000660", "2026-06-25", "100000000000000", "728002365"),
        ]);
        const got = await repo.getPreviousByDateAndCodes("2026-06-26", ["005930", "999999"]);
        expect(got).toEqual([cap("005930", "2026-06-25", "400000000000000")]);
    });

    it("빈 코드 → 빈 결과", async () => {
        expect(await repo.getPreviousByDateAndCodes("2026-06-26", [])).toEqual([]);
    });

    it("upsert — 같은 (종목,날) 재저장은 3컬럼 전부 갱신", async () => {
        await repo.saveDailyStats([stat("111111", "2026-06-25", "100", "10", "벤처기업부")]);
        await repo.saveDailyStats([stat("111111", "2026-06-25", "200", "20", "관리종목(소속부없음)")]);
        expect(await repo.getPreviousByDateAndCodes("2026-06-26", ["111111"])).toEqual([
            cap("111111", "2026-06-25", "200"),
        ]);
    });

    it("getPreviousByDateAndCodes — 종목별 '그 날짜 미만 최신 1행'(달력 하루 전이 아니다)", async () => {
        await repo.saveDailyStats([
            stat("A", "2026-07-01", "100", "1"),
            stat("A", "2026-07-03", "300", "3"), // 직전 = 7/03 (7/06 기준)
            stat("B", "2026-06-30", "500", "5"), // B 는 거래정지로 7월 행이 없다 → 6/30 이 직전
        ]);
        const got = await repo.getPreviousByDateAndCodes("2026-07-06", ["A", "B"]);
        expect(got.sort((x, y) => x.stockCode.localeCompare(y.stockCode))).toEqual([
            cap("A", "2026-07-03", "300"),
            cap("B", "2026-06-30", "500"),
        ]);
    });

    it("getPreviousByDateAndCodes — 그 날짜 행은 절대 안 준다(당일 배제)", async () => {
        await repo.saveDailyStats([stat("C", "2026-07-06", "999", "9")]);
        expect(await repo.getPreviousByDateAndCodes("2026-07-06", ["C"])).toEqual([]);
    });

    it("fillMissingTradedDays — 그 종목의 마지막 거래일 구멍만 채운다(직전 주식수 × 그날 종가)", async () => {
        // D: 7/01 행 있음(주식수 77) → 7/02 에 거래했지만 소스가 안 줌.
        // ① D 의 일봉은 7/02 가 끝 ② 시장 일봉은 7/03 에도 있다(장은 계속 돌았다) → 상장폐지 → 채운다.
        await repo.saveDailyStats([stat("D", "2026-07-01", "1000", "77")]);
        await seedCandles(t, "D", "2026-07-02", 300);
        // 장이 계속 돌았다는 증거. 이 종목은 소스가 정상으로 줬어야 하므로 시총 행도 같이 둔다
        // (안 두면 MKT 가 스스로 구멍이 돼 unresolved 로 잡힌다).
        await seedCandles(t, "MKT", "2026-07-03", 100);
        await repo.saveDailyStats([stat("MKT", "2026-07-03", "100", "1")]);

        const r = await repo.fillMissingTradedDays({ from: "2026-07-01", to: "2026-07-31" });
        expect(r).toEqual({ inherited: 1, unresolved: 0 });
        expect(await repo.getPreviousByDateAndCodes("2026-07-03", ["D"])).toEqual([
            cap("D", "2026-07-02", String(77 * 300)), // 직전 주식수 × 그날 원주가 종가
        ]);
    });

    it("fillMissingTradedDays — 이후 행이 있는 중간 구멍은 안 채우고 센다(주식수가 바뀌었을 수 있다)", async () => {
        // F: 8/04 가 구멍인데 F 는 8/05 에도 거래했다 → 마지막 날이 아니다(재상장 당일일 수 있다) → 손대지 않는다.
        await repo.saveDailyStats([
            stat("F", "2026-08-03", "1000", "77"),
            stat("F", "2026-08-05", "2000", "154"),
        ]);
        await seedCandles(t, "F", "2026-08-04", 300);
        await seedCandles(t, "F", "2026-08-05", 600);

        const r = await repo.fillMissingTradedDays({ from: "2026-08-01", to: "2026-08-31" });
        expect(r).toEqual({ inherited: 0, unresolved: 1 });
        expect(await repo.getPreviousByDateAndCodes("2026-08-05", ["F"])).toEqual([
            cap("F", "2026-08-03", "1000"), // 8/04 는 안 채워졌으니 직전은 여전히 8/03
        ]);
    });

    it("fillMissingTradedDays — 수집 최신일의 구멍은 채우지 않는다(마지막 날 오인 방지)", async () => {
        // H: 9/10 에 거래했는데 소스가 안 줌. 그 뒤 일봉이 아무 종목에도 없다 = 그냥 데이터의 끝이지
        // H 가 상장폐지된 게 아니다. 여기서 채우면 수집 실패한 날 전 종목이 조용히 조작된다.
        await repo.saveDailyStats([stat("H", "2026-09-09", "1000", "77")]);
        await seedCandles(t, "H", "2026-09-10", 300);
        const r = await repo.fillMissingTradedDays({ from: "2026-09-01", to: "2026-09-30" });
        expect(r).toEqual({ inherited: 0, unresolved: 1 });
    });

    it("fillMissingTradedDays — 일봉 없는 (종목,날)은 애초에 대상이 아니다", async () => {
        // G: 시총 행도 일봉도 없다(주말·상장 전 같은 자리) → 세지도 채우지도 않는다.
        await repo.saveDailyStats([stat("G", "2026-10-01", "1000", "77")]);
        const r = await repo.fillMissingTradedDays({ from: "2026-10-01", to: "2026-10-31" });
        expect(r).toEqual({ inherited: 0, unresolved: 0 });
    });
});
