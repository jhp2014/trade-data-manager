// PointGrids 대사 — fake store/anchor/minute 주입. 검증 대상은 "언제 굽고·언제 안 읽고·언제 지우나".
import { describe, expect, it } from "vitest";
import type { ChartAnchor, DailyBar, DailyCandle, MinuteCandle } from "@trade-data-manager/market";
import { BASELINE_PARAM } from "@trade-data-manager/market";
import { POINT_GRID_FILE_VERSION, type GridStore, type PointGridFile } from "../grid/gridStore.js";
import { PointGrids, POINT_GRID_CALC_VERSION, type PointGridsDeps } from "../grid/pointGrids.js";

const TODAY = "2026-07-02";
const D = "2026-07-01";

const anchor = (code: string, date: string, anchorDate: string, field: "high" | "low" = "high"): ChartAnchor => ({
    stockCode: code,
    date,
    param: BASELINE_PARAM,
    anchorDate,
    field,
    market: "un",
});
const db = (high: number, low: number): DailyBar => ({ open: String(low), high: String(high), low: String(low), close: String(high), volume: "0", amount: "0" });
const dc = (code: string, date: string, high: number, low = high): DailyCandle => ({ stockCode: code, date, krx: db(high, low), un: db(high, low) });
const fm = (code: string, date: string, time: string, p: number, vol = 200000): MinuteCandle => ({
    stockCode: code,
    date,
    time,
    krx: null,
    un: { open: String(p), high: String(p), low: String(p), close: String(p), volume: String(vol) },
});
const twoBars = (code: string, date: string): MinuteCandle[] => [fm(code, date, "09:10:00", 10000), fm(code, date, "09:20:00", 10100)];

function harness(init: {
    anchors: ChartAnchor[];
    minutes?: Record<string, MinuteCandle[]>;
    adjDaily?: Record<string, DailyCandle[]>;
}) {
    let anchors = init.anchors;
    let nowMs = 0;
    const minuteCalls: string[] = [];
    const files = new Map<string, PointGridFile>();
    const store: GridStore = {
        read: async (d) => files.get(d) ?? null,
        write: async (f) => void files.set(f.date, f),
        remove: async (d) => void files.delete(d),
        listDates: async () => [...files.keys()],
    };
    const deps = {
        minute: {
            getMinuteCandles: async (code: string, date: string) => {
                minuteCalls.push(`${code}|${date}`);
                return init.minutes?.[`${code}|${date}`] ?? [];
            },
        },
        rawDaily: { getRawDailyCandles: async () => [] },
        adjDaily: { getDailyCandles: async (code: string, r: { from: string }) => init.adjDaily?.[`${code}|${r.from}`] ?? [] },
        chartAnchor: { listAll: async () => anchors },
    } as unknown as PointGridsDeps["deps"];
    const grids = new PointGrids({ deps, store, today: () => TODAY, now: () => nowMs });
    return {
        grids,
        files,
        minuteCalls,
        setAnchors: (a: ChartAnchor[]) => (anchors = a),
        setNow: (ms: number) => (nowMs = ms),
    };
}

describe("PointGrids 대사", () => {
    it("첫 대사 — 기준선 확정 차트를 굽고 날짜 파일에 쓴다(척도 항등이면 base = 앵커 캔들 값)", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        const r = await h.grids.reconcile();
        expect(r).toMatchObject({ charts: 1, baked: 1, kept: 0, unresolved: 0 });
        const file = h.files.get(D);
        expect(file?.v).toBe(POINT_GRID_FILE_VERSION);
        expect(file?.version).toBe(POINT_GRID_CALC_VERSION);
        expect(file?.charts["A"].grid.base).toBe(9000);
        expect(file?.charts["A"].grid.touchMin).toBe(9 * 60 + 10);
    });

    it("무변경 재대사 — 지문 히트, 분봉 읽기 0회", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        await h.grids.reconcile();
        const before = h.minuteCalls.length;
        const r = await h.grids.reconcile();
        expect(r).toMatchObject({ baked: 0, kept: 1 });
        expect(h.minuteCalls.length).toBe(before);
    });

    it("앵커 좌표 변경 — 지문 불일치라 그 차트만 다시 굽는다", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20", "high")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000, 8800)] },
        });
        await h.grids.reconcile();
        h.setAnchors([anchor("A", D, "2026-06-20", "low")]);
        const r = await h.grids.reconcile();
        expect(r).toMatchObject({ baked: 1, kept: 0 });
        expect(h.files.get(D)?.charts["A"].grid.base).toBe(8800);
    });

    it("기준선 삭제 — 남은 차트는 유지, 지운 차트 항목만 파일에서 걷힌다", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20"), anchor("B", D, "2026-06-21")],
            minutes: { [`A|${D}`]: twoBars("A", D), [`B|${D}`]: twoBars("B", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)], "B|2026-06-21": [dc("B", "2026-06-21", 9500)] },
        });
        await h.grids.reconcile();
        expect(Object.keys(h.files.get(D)?.charts ?? {}).sort()).toEqual(["A", "B"]);
        h.setAnchors([anchor("A", D, "2026-06-20")]);
        const r = await h.grids.reconcile();
        expect(r).toMatchObject({ kept: 1, removedCharts: 1 });
        expect(Object.keys(h.files.get(D)?.charts ?? {})).toEqual(["A"]);
    });

    it("참조 없는 날짜 파일 GC — 단, 기대집합이 통째로 비면 지우지 않는다(미러 초기화 사고 방지)", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        h.files.set("2026-05-05", { v: POINT_GRID_FILE_VERSION, version: POINT_GRID_CALC_VERSION, date: "2026-05-05", charts: {} });
        const r = await h.grids.reconcile();
        expect(r.removedDates).toBe(1);
        expect(h.files.has("2026-05-05")).toBe(false);

        h.setAnchors([]);
        const r2 = await h.grids.reconcile();
        expect(r2.charts).toBe(0);
        expect(h.files.has(D)).toBe(true); // 전량 삭제 대신 보존
    });

    it("오늘(및 미래) 날짜 차트는 굽지 않는다", async () => {
        const h = harness({
            anchors: [anchor("A", TODAY, "2026-06-20")],
            minutes: { [`A|${TODAY}`]: twoBars("A", TODAY) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        const r = await h.grids.reconcile();
        expect(r.charts).toBe(0);
        expect(h.minuteCalls).toEqual([]);
    });

    it("당일 캔들에 그은 기준선은 기대집합에서 빠진다(dropSameDayAnchors)", async () => {
        const h = harness({
            anchors: [anchor("A", D, D)],
            minutes: { [`A|${D}`]: twoBars("A", D) },
        });
        const r = await h.grids.reconcile();
        expect(r.charts).toBe(0);
    });

    it("재료 없음(분봉 0건) — 항목을 안 만들고, TTL 안에서는 재조회하지 않다가 지나면 재시도한다", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        const r1 = await h.grids.reconcile();
        expect(r1.materialMissing).toEqual([{ stockCode: "A", date: D }]);
        expect(h.files.has(D)).toBe(false);
        const calls = h.minuteCalls.length;
        const r2 = await h.grids.reconcile();
        expect(r2.materialMissing).toHaveLength(1);
        expect(h.minuteCalls.length).toBe(calls); // TTL 내 — 분봉 재조회 억제
        h.setNow(11 * 60_000);
        await h.grids.reconcile();
        expect(h.minuteCalls.length).toBeGreaterThan(calls); // TTL 경과 — 재시도
    });

    it("기준선 캔들을 못 읽으면(미수집) 재료 없음 — 낡은 항목도 남기지 않는다", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: {},
        });
        const r = await h.grids.reconcile();
        expect(r.materialMissing).toHaveLength(1);
        expect(h.files.has(D)).toBe(false);
    });
});
