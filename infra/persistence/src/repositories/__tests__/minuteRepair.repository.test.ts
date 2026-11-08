import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DailyBar, MinuteBar, MinuteCandle } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleMinuteCandleRepository } from "../minuteCandle.repository.js";
import { DrizzleRawDailyCandleRepository } from "../rawDailyCandle.repository.js";

const D = "2025-05-20";
const bar = (close: string, volume = "10"): MinuteBar => ({ open: close, high: close, low: close, close, volume });
const day = (volume: string): DailyBar => ({ open: "1", high: "1", low: "1", close: "1", volume, amount: "1" });
const m = (stockCode: string, time: string, krx: MinuteBar | null, un: MinuteBar): MinuteCandle => ({ stockCode, date: D, time, krx, un });

describe("DrizzleMinuteCandleRepository — 옛 분봉 수리 (pglite)", () => {
    let t: TestDb;
    let minute: DrizzleMinuteCandleRepository;

    beforeAll(async () => {
        t = await createTestDb();
        minute = new DrizzleMinuteCandleRepository(t.db);
        const raw = new DrizzleRawDailyCandleRepository(t.db);
        await raw.saveRawDailyCandles([
            { stockCode: "000001", date: D, krx: day("100"), un: day("150") }, // NXT 체결 있음 + 분봉에 NXT 봉 없음 → 대상
            { stockCode: "000002", date: D, krx: day("100"), un: day("150") }, // NXT 봉 있음 → 정상
            { stockCode: "000003", date: D, krx: day("100"), un: day("100") }, // NXT 체결 없음 → 정상
            { stockCode: "000004", date: D, krx: day("100"), un: day("150") }, // 15:35 KRX 시간외 봉만(KRX 칸 참) → 대상
        ]);
        await minute.saveMinuteCandles([
            m("000001", "09:00:00", null, bar("1")),
            m("000001", "09:01:00", null, bar("1")),
            m("000002", "08:00:00", null, bar("1")),
            m("000002", "09:00:00", null, bar("1")),
            m("000003", "09:00:00", null, bar("1")),
            m("000004", "09:00:00", bar("1"), bar("1")),
            m("000004", "15:35:00", bar("1"), bar("1")),
        ]);
    });
    afterAll(async () => {
        await t.close();
    });

    it("NXT 봉을 잃은 종목-날만 찾는다", async () => {
        expect(await minute.listNxtLostMinuteDays({ from: "2025-03-04", to: "2025-06-30" })).toEqual([
            { stockCode: "000001", date: D },
            { stockCode: "000004", date: D },
        ]);
        expect(await minute.listNxtLostMinuteDays({ from: "2025-06-01", to: "2025-06-30" })).toEqual([]);
    });

    it("종목-날 통째 교체 — 새 소스에 없는 시각은 지워지고 다른 종목은 그대로", async () => {
        await minute.replaceMinuteCandlesOfDay("000001", D, [
            m("000001", "08:00:00", null, bar("2", "5")),
            m("000001", "09:00:00", bar("2"), bar("2", "15")),
        ]);
        const got = await minute.getMinuteCandles("000001", D);
        expect(got.map((c) => [c.time, c.un.volume, c.krx?.volume ?? null])).toEqual([
            ["08:00:00", "5", null],
            ["09:00:00", "15", "10"],
        ]);
        expect(await minute.getMinuteCandles("000003", D)).toHaveLength(1);
        // 고친 종목-날은 대상에서 빠진다(재실행 = 남은 것만)
        expect(await minute.listNxtLostMinuteDays({ from: D, to: D })).toEqual([{ stockCode: "000004", date: D }]);
    });

    it("빈 분봉·다른 종목-날 봉으로는 교체하지 않는다(기존 그대로)", async () => {
        await expect(minute.replaceMinuteCandlesOfDay("000003", D, [])).rejects.toThrow("빈 분봉");
        await expect(
            minute.replaceMinuteCandlesOfDay("000003", D, [m("000009", "09:00:00", null, bar("1"))]),
        ).rejects.toThrow("섞였다");
        expect(await minute.getMinuteCandles("000003", D)).toHaveLength(1);
    });

    it("넣기가 실패하면 지운 것도 되돌린다(한 트랜잭션)", async () => {
        const before = await minute.getMinuteCandles("000004", D);
        await expect(
            minute.replaceMinuteCandlesOfDay("000004", D, [m("000004", "09:00:00", null, bar("not-a-number"))]),
        ).rejects.toThrow();
        expect(await minute.getMinuteCandles("000004", D)).toEqual(before);
    });

    it("경계 시각 — 정규장 끝(15:30)은 NXT 봉이 아니고 15:31·08:59 는 NXT 봉이다", async () => {
        const E = "2025-05-21";
        await new DrizzleRawDailyCandleRepository(t.db).saveRawDailyCandles(
            ["000011", "000012", "000013"].map((stockCode) => ({ stockCode, date: E, krx: day("100"), un: day("150") })),
        );
        const n = (stockCode: string, time: string): MinuteCandle => ({ ...m(stockCode, time, null, bar("1")), date: E });
        await minute.saveMinuteCandles([n("000011", "15:30:00"), n("000012", "15:31:00"), n("000013", "08:59:00")]);
        expect(await minute.listNxtLostMinuteDays({ from: E, to: E })).toEqual([{ stockCode: "000011", date: E }]);
    });
});
