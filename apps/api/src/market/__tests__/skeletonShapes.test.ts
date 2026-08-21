import { describe, it, expect } from "vitest";
import type { AxisDeps, ChartAnchor, MinuteCandle, PreviousClose, ReviewPoint } from "@trade-data-manager/market";
import { BASELINE_PARAM, SKELETON_MINUTE_PARAM } from "@trade-data-manager/market";
import { SkeletonShapes } from "../rank/skeletonShapes.js";

// 골격 좌표 읽기모델 — 리졸버 자체는 core 테스트의 몫이고, 여기는 **조립 규칙**만 본다:
// 전일 종가의 배치·생략, 결손 차트 탈락, 선(levels) 범위의 합집합.

const D = "2026-07-02";

const minutePivot = (code: string, time: string, field: "high" | "low" = "high"): ChartAnchor => ({
    stockCode: code, date: D, param: SKELETON_MINUTE_PARAM, anchorDate: D, anchorTime: time, field, market: "un",
});
const baselineMinute = (code: string, time: string): ChartAnchor => ({
    stockCode: code, date: D, param: BASELINE_PARAM, anchorDate: D, anchorTime: time, field: "close", market: "un",
});

const bar = (p: number): MinuteCandle["un"] => ({ open: String(p), high: String(p), low: String(p), close: String(p), volume: "1" });
const candle = (code: string, time: string, p: number): MinuteCandle => ({ stockCode: code, date: D, time, krx: null, un: bar(p) });

function makeShapes(cfg: {
    anchors?: ChartAnchor[];
    points?: ReviewPoint[];
    minutes?: MinuteCandle[];
    prevCloses?: PreviousClose[];
    /** getPreviousCloses 호출 기록 — 날짜별 배치 규칙 검증용. */
    prevCalls?: { date: string; codes: string[] }[];
}): SkeletonShapes {
    const axisDeps: AxisDeps = {
        minute: { getMinuteCandles: (code, date) => Promise.resolve((cfg.minutes ?? []).filter((c) => c.stockCode === code && c.date === date)) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: () => Promise.resolve([]) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(cfg.anchors ?? []) },
        reviewPoints: { listAllPoints: () => Promise.resolve(cfg.points ?? []) },
    };
    return new SkeletonShapes({
        points: { listAllPoints: () => Promise.resolve(cfg.points ?? []) },
        axisDeps,
        prevClose: {
            getPreviousCloses: (date, codes) => {
                cfg.prevCalls?.push({ date, codes: [...codes].sort() });
                return Promise.resolve((cfg.prevCloses ?? []).filter((r) => codes.includes(r.stockCode)));
            },
        },
    });
}

describe("SkeletonShapes", () => {
    it("분봉 골격을 벽시계 분 좌표로 내고, 전일 종가(UN)를 싣는다", async () => {
        const shapes = makeShapes({
            anchors: [minutePivot("0001", "09:00:00", "low"), minutePivot("0001", "09:10:00", "high")],
            minutes: [candle("0001", "09:00:00", 100), candle("0001", "09:10:00", 120)],
            prevCloses: [{ stockCode: "0001", krxClose: "90", unClose: "95" }],
        });
        const feed = await shapes.feed();
        expect(feed.daily).toEqual([]);
        expect(feed.minute).toHaveLength(1);
        expect(feed.minute[0]).toMatchObject({
            stockCode: "0001",
            date: D,
            pivots: [{ t: 540, price: 100 }, { t: 550, price: 120 }],
            prevClose: 95,
        });
    });

    it("전일 종가가 없으면 키를 지어내지 않는다(절대 뷰가 결손으로 안다)", async () => {
        const shapes = makeShapes({
            anchors: [minutePivot("0001", "09:00:00", "low"), minutePivot("0001", "09:10:00", "high")],
            minutes: [candle("0001", "09:00:00", 100), candle("0001", "09:10:00", 120)],
            prevCloses: [],
        });
        const feed = await shapes.feed();
        expect(feed.minute[0]).not.toHaveProperty("prevClose");
    });

    it("피벗 하나라도 미수집이면 그 골격은 통째로 빠진다(부분 형태를 지어내지 않는다)", async () => {
        const shapes = makeShapes({
            anchors: [minutePivot("0001", "09:00:00", "low"), minutePivot("0001", "09:10:00", "high")],
            minutes: [candle("0001", "09:00:00", 100)], // 09:10 미수집
        });
        const feed = await shapes.feed();
        expect(feed.minute).toEqual([]);
    });

    it("타점 종가를 합성 피벗으로 병합한다(synthetic 표시)", async () => {
        const shapes = makeShapes({
            anchors: [minutePivot("0001", "09:00:00", "low"), minutePivot("0001", "09:10:00", "high")],
            points: [{ stockCode: "0001", date: D, time: "09:05:00" }],
            minutes: [candle("0001", "09:00:00", 100), candle("0001", "09:05:00", 105), candle("0001", "09:10:00", 120)],
        });
        const feed = await shapes.feed();
        expect(feed.minute[0].pivots).toEqual([
            { t: 540, price: 100 },
            { t: 545, price: 105, synthetic: true },
            { t: 550, price: 120 },
        ]);
    });

    it("선(levels) 범위는 합집합 — 골격 없이 타점만 있는 차트도 선을 갖는다", async () => {
        const shapes = makeShapes({
            anchors: [baselineMinute("0002", "10:00:00")],
            points: [{ stockCode: "0002", date: D, time: "10:00:00" }],
            minutes: [candle("0002", "10:00:00", 500)],
        });
        const feed = await shapes.feed();
        expect(feed.minute).toEqual([]);
        expect(feed.levels).toEqual([{ stockCode: "0002", date: D, levels: [{ price: 500, baseline: true }] }]);
    });

    it("전일 종가 조회는 날짜별 코드 배치 — 같은 날 차트들은 한 번에 묻는다", async () => {
        const prevCalls: { date: string; codes: string[] }[] = [];
        const shapes = makeShapes({
            anchors: [
                minutePivot("0001", "09:00:00", "low"), minutePivot("0001", "09:10:00", "high"),
                minutePivot("0003", "09:00:00", "low"), minutePivot("0003", "09:10:00", "high"),
            ],
            minutes: [
                candle("0001", "09:00:00", 100), candle("0001", "09:10:00", 120),
                candle("0003", "09:00:00", 200), candle("0003", "09:10:00", 220),
            ],
            prevCalls,
        });
        await shapes.feed();
        expect(prevCalls).toEqual([{ date: D, codes: ["0001", "0003"] }]);
    });

    it("동시 feed 는 굽기 하나를 나눠 받고, invalidate 뒤의 feed 는 합류하지 않는다(변경 전 재료)", async () => {
        // 앵커 읽기(빌드 첫 단계)를 게이트로 잡아 "굽는 중"을 만든다.
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let listAllCalls = 0;
        const axisDeps: AxisDeps = {
            minute: { getMinuteCandles: () => Promise.resolve([]) },
            rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
            adjDaily: { getDailyCandles: () => Promise.resolve([]) },
            chartAnchor: {
                listByChart: () => Promise.resolve([]),
                listAll: async () => {
                    listAllCalls++;
                    await gate;
                    return [];
                },
            },
            reviewPoints: { listAllPoints: () => Promise.resolve([]) },
        };
        const shapes = new SkeletonShapes({
            points: { listAllPoints: () => Promise.resolve([]) },
            axisDeps,
            prevClose: { getPreviousCloses: () => Promise.resolve([]) },
        });

        const first = shapes.feed();
        expect(shapes.feed()).toBe(first); // 같은 세대 — 굽기 공유

        shapes.invalidate(); // 앵커/타점 변경 직후
        const second = shapes.feed();
        expect(second).not.toBe(first); // 변경 전에 시작된 굽기에 합류하지 않는다

        release();
        await Promise.all([first, second]);
        expect(listAllCalls).toBe(2);
    });
});
