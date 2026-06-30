import { describe, it, expect } from "vitest";
import { densifyMinutes } from "../minuteBackfill.js";
import type { MinuteBar, MinuteCandle } from "../model.js";

const bar = (close: string, volume = "10"): MinuteBar => ({
    open: close,
    high: close,
    low: close,
    close,
    volume,
});

const candle = (time: string, un: MinuteBar, krx: MinuteBar | null): MinuteCandle => ({
    stockCode: "005930",
    date: "2026-06-26",
    time,
    krx,
    un,
});

describe("densifyMinutes", () => {
    it("빈 입력은 빈 배열", () => {
        expect(densifyMinutes([])).toEqual([]);
    });

    it("내부 갭을 직전 종가 평탄봉(거래량 0)으로 채운다", () => {
        const input = [
            candle("09:00:00", bar("100"), bar("100")),
            // 09:01 누락(무거래/VI)
            candle("09:02:00", bar("110"), bar("110")),
        ];
        const out = densifyMinutes(input);
        expect(out.map((c) => c.time)).toEqual(["09:00:00", "09:01:00", "09:02:00"]);
        const filled = out[1];
        expect(filled.un).toEqual({ open: "100", high: "100", low: "100", close: "100", volume: "0" });
        expect(filled.krx).toEqual({ open: "100", high: "100", low: "100", close: "100", volume: "0" });
    });

    it("선두 갭(첫 봉 이전)은 채우지 않는다 — 첫 봉부터 시작", () => {
        const out = densifyMinutes([
            candle("09:05:00", bar("100"), bar("100")),
            candle("09:06:00", bar("101"), bar("101")),
        ]);
        expect(out[0].time).toBe("09:05:00");
        expect(out).toHaveLength(2);
    });

    it("KRX 범위 밖(프리마켓 등 NXT 단독)은 krx=null 유지, UN만 채움", () => {
        const input = [
            candle("08:00:00", bar("100"), null), // 프리마켓: KRX 없음
            // 08:01 누락
            candle("08:02:00", bar("102"), null),
            candle("09:00:00", bar("105"), bar("105")), // 정규장: KRX 시작
        ];
        const out = densifyMinutes(input);
        const at0801 = out.find((c) => c.time === "08:01:00")!;
        expect(at0801.krx).toBeNull(); // KRX 범위 전 → null 유지
        expect(at0801.un).toEqual({ open: "100", high: "100", low: "100", close: "100", volume: "0" });
    });

    it("장중 KRX 갭(krx===null 이지만 KRX 범위 안)은 직전 KRX 종가로 채운다", () => {
        const input = [
            candle("09:00:00", bar("100"), bar("100")),
            candle("09:01:00", bar("110"), null), // UN만 체결, KRX는 VI 정지 → 범위 안 갭
            candle("09:02:00", bar("120"), bar("120")),
        ];
        const out = densifyMinutes(input);
        const mid = out.find((c) => c.time === "09:01:00")!;
        expect(mid.krx).toEqual({ open: "100", high: "100", low: "100", close: "100", volume: "0" });
        expect(mid.un).toEqual(bar("110")); // UN 은 실제 체결 그대로
    });
});
