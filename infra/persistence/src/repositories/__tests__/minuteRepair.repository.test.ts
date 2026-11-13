import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MinuteBar, MinuteCandle } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleMinuteCandleRepository } from "../minuteCandle.repository.js";

const D = "2025-05-20";
const bar = (close: string, volume = "10"): MinuteBar => ({ open: close, high: close, low: close, close, volume });
const m = (stockCode: string, time: string, krx: MinuteBar | null, un: MinuteBar): MinuteCandle => ({ stockCode, date: D, time, krx, un });

describe("DrizzleMinuteCandleRepository — 옛 분봉 수리 (pglite)", () => {
    let t: TestDb;
    let minute: DrizzleMinuteCandleRepository;

    beforeAll(async () => {
        t = await createTestDb();
        minute = new DrizzleMinuteCandleRepository(t.db);
        await minute.saveMinuteCandles([
            // 토스분 — KRX 칸이 전부 비었다 → 대상
            m("000001", "09:00:00", null, bar("1")),
            m("000001", "09:01:00", null, bar("1")),
            m("000002", "08:00:00", null, bar("1")),
            m("000002", "09:00:00", null, bar("1")),
            // KRX 칸이 하나라도 차 있다(키움·대신분 — NXT 단독 봉은 비어 있다) → 대상 아님
            m("000003", "08:00:00", null, bar("1")),
            m("000003", "09:00:00", bar("1"), bar("1")),
        ]);
    });
    afterAll(async () => {
        await t.close();
    });

    it("KRX 칸이 전부 빈 종목-날만 찾는다", async () => {
        expect(await minute.listKrxlessMinuteDays({ from: "2025-03-04", to: "2025-06-30" })).toEqual([
            { stockCode: "000001", date: D },
            { stockCode: "000002", date: D },
        ]);
        expect(await minute.listKrxlessMinuteDays({ from: "2025-06-01", to: "2025-06-30" })).toEqual([]);
    });

    it("종목-날 통째 교체 — 새 소스에 없는 시각은 지워지고 다른 종목은 그대로, 고친 날은 대상에서 빠진다", async () => {
        await minute.replaceMinuteCandlesOfDay("000001", D, [
            m("000001", "08:00:00", null, bar("2", "5")),
            m("000001", "09:00:00", bar("2"), bar("2", "15")),
        ]);
        const got = await minute.getMinuteCandles("000001", D);
        expect(got.map((c) => [c.time, c.un.volume, c.krx?.volume ?? null])).toEqual([
            ["08:00:00", "5", null],
            ["09:00:00", "15", "10"],
        ]);
        expect(await minute.getMinuteCandles("000003", D)).toHaveLength(2);
        expect(await minute.listKrxlessMinuteDays({ from: D, to: D })).toEqual([{ stockCode: "000002", date: D }]);
    });

    it("빈 분봉·다른 종목-날 봉으로는 교체하지 않는다(기존 그대로)", async () => {
        await expect(minute.replaceMinuteCandlesOfDay("000003", D, [])).rejects.toThrow("빈 분봉");
        await expect(
            minute.replaceMinuteCandlesOfDay("000003", D, [m("000009", "09:00:00", null, bar("1"))]),
        ).rejects.toThrow("섞였다");
        expect(await minute.getMinuteCandles("000003", D)).toHaveLength(2);
    });

    it("넣기가 실패하면 지운 것도 되돌린다(한 트랜잭션)", async () => {
        const before = await minute.getMinuteCandles("000002", D);
        await expect(
            minute.replaceMinuteCandlesOfDay("000002", D, [m("000002", "09:00:00", null, bar("not-a-number"))]),
        ).rejects.toThrow();
        expect(await minute.getMinuteCandles("000002", D)).toEqual(before);
    });
});
