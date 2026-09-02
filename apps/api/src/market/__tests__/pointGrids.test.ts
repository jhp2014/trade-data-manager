// PointGrids 대사 — fake store/anchor/minute 주입. 검증 대상은 "언제 굽고·언제 안 읽고·언제 지우나".
import { describe, expect, it } from "vitest";
import type { ChartAnchor, DailyBar, DailyCandle, MinuteCandle } from "@trade-data-manager/market";
import { BASELINE_PARAM, decodeChartGrid } from "@trade-data-manager/market";
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

/** 그 종목의 픽스처 봉 전부에서 [from, to] 안만 — 실서비스 리더와 같은 계약(키 매칭이 아니다). */
const rowsIn = (
    src: Record<string, DailyCandle[]> | undefined,
    code: string,
    range: { from: string; to: string },
): DailyCandle[] =>
    Object.entries(src ?? {})
        .filter(([k]) => k.startsWith(`${code}|`))
        .flatMap(([, rows]) => rows)
        .filter((c) => c.date >= range.from && c.date <= range.to);

function harness(init: {
    anchors: ChartAnchor[];
    minutes?: Record<string, MinuteCandle[]>;
    adjDaily?: Record<string, DailyCandle[]>;
    rawDaily?: Record<string, DailyCandle[]>;
    /** 분봉 읽기 직전 훅 — gen 가드 테스트가 비행을 문턱에서 세울 때 쓴다. */
    beforeMinutes?: (key: string) => Promise<void>;
}) {
    let anchors = init.anchors;
    let nowMs = 0;
    const minuteCalls: string[] = [];
    const storeReads: string[] = [];
    const files = new Map<string, PointGridFile>();
    const store: GridStore = {
        read: async (d) => {
            storeReads.push(d);
            return files.get(d) ?? null;
        },
        write: async (f) => void files.set(f.date, f),
        remove: async (d) => void files.delete(d),
        listDates: async () => [...files.keys()],
    };
    const deps = {
        minute: {
            getMinuteCandles: async (code: string, date: string) => {
                minuteCalls.push(`${code}|${date}`);
                await init.beforeMinutes?.(`${code}|${date}`);
                return init.minutes?.[`${code}|${date}`] ?? [];
            },
        },
        // 일봉 리더는 **범위를 실제로 본다**(키 매칭이 아니라 from..to 필터) — 굽기의 창은 그날 하나가
        // 아니라 [date−1개월, date] 이고(그날 기준가 basePricesOf 가 직전 거래일을 찾아야 한다),
        // 키로만 집으면 그 창을 다시 좁히는 회귀를 테스트가 하나도 못 잡는다.
        rawDaily: { getRawDailyCandles: async (code: string, r: { from: string; to: string }) => rowsIn(init.rawDaily, code, r) },
        adjDaily: { getDailyCandles: async (code: string, r: { from: string; to: string }) => rowsIn(init.adjDaily, code, r) },
        chartAnchor: { listAll: async () => anchors },
    } as unknown as PointGridsDeps["deps"];
    const make = (detect?: PointGridsDeps["detect"]): PointGrids =>
        new PointGrids({ deps, store, detect, today: () => TODAY, now: () => nowMs });
    return {
        grids: make(),
        make,
        files,
        minuteCalls,
        storeReads,
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
        expect(file?.charts["A"].grid.touch?.min).toBe(9 * 60 + 10);
    });

    it("그날 기준가(prevBase) — 직전 거래일 종가를 격자에 싣는다(당일 % 의 분모)", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)], [`A|prev`]: [dc("A", "2026-06-30", 8000)] },
            rawDaily: { [`A|prev`]: [dc("A", "2026-06-30", 8000)] },
        });
        await h.grids.reconcile();
        expect(h.files.get(D)?.charts["A"].grid.prevBase).toBe(8000);
    });

    it("KRX 짝(prevBaseKrx) — 같은 전일에서 KRX 종가를 싣고, KRX 만 없으면(세션 없음=0) KRX 만 결손", async () => {
        const split = (code: string, date: string, unClose: number, krxClose: number): DailyCandle => ({
            stockCode: code,
            date,
            krx: db(krxClose, krxClose),
            un: db(unClose, unClose),
        });
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [split("A", "2026-06-20", 9000, 9000)], [`A|prev`]: [split("A", "2026-06-30", 8000, 0)] },
            rawDaily: { [`A|prev`]: [split("A", "2026-06-30", 8000, 0)] },
        });
        await h.grids.reconcile();
        const grid = h.files.get(D)?.charts["A"].grid;
        expect(grid?.prevBase).toBe(8000); // UN 은 산다 — 두 분모는 독립 결손
        expect(grid?.prevBaseKrx).toBeNull();
    });

    it("직전 거래일이 조회 창(1개월) 밖이면 prevBase 는 결손 — 폴백을 지어내지 않는다", async () => {
        // ⚠ 이 케이스가 "창을 그날 하루로 다시 좁히는" 회귀의 그물이다 — 좁히면 위 케이스도 여기처럼 null 이 된다.
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)], [`A|old`]: [dc("A", "2026-03-02", 8000)] },
            rawDaily: { [`A|old`]: [dc("A", "2026-03-02", 8000)] },
        });
        await h.grids.reconcile();
        expect(h.files.get(D)?.charts["A"].grid.prevBase).toBeNull();
    });

    it("이벤트(감자·액분) 낀 차트 — 수정주가 승자를 그 날 원주가 스케일로 되돌려 굽는다", async () => {
        // 차트일의 raw(5000) ≠ adj(10000) → 환산비 0.5. 앵커 캔들 값 9000(수정주가) → base 4500(원주가).
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)], [`A|${D}`]: [dc("A", D, 10000)] },
            rawDaily: { [`A|${D}`]: [dc("A", D, 5000)] },
        });
        await h.grids.reconcile();
        expect(h.files.get(D)?.charts["A"].grid.base).toBe(4500);
    });

    it("분봉 앵커 — 원주가 값을 앵커일 환산비로 **나눠** 수정주가로 올린 뒤 굽는다", async () => {
        // 앵커일 raw 5000 / adj 10000 → scale 0.5. 분봉 값 9000(원주가) ÷ 0.5 = 수정주가 18000.
        // 차트일은 항등(scale 1) → base 18000. 나눗셈·곱셈 방향이 뒤집히면 4500 이 나와 잡힌다.
        const h = harness({
            anchors: [
                { stockCode: "A", date: D, param: BASELINE_PARAM, anchorDate: "2026-06-20", anchorTime: "10:00:00", field: "high", market: "un" },
            ],
            minutes: { [`A|${D}`]: [fm("A", D, "09:10:00", 20000), fm("A", D, "09:20:00", 20100)], "A|2026-06-20": [fm("A", "2026-06-20", "10:00:00", 9000)] },
            rawDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 5000)] },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 10000)] },
        });
        const r = await h.grids.reconcile();
        expect(r).toMatchObject({ baked: 1, materialMissing: [] });
        expect(h.files.get(D)?.charts["A"].grid.base).toBe(18000);
    });

    it("검출 파라미터가 바뀌면 앵커가 그대로여도 다시 굽는다(지문에 옵션 포함)", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        await h.grids.reconcile();
        const other = h.make({ floorEok: 10 });
        const r = await other.reconcile();
        expect(r).toMatchObject({ baked: 1, kept: 0 });
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

    it("재대사는 날짜 파일을 다시 읽지 않는다(상주 메모)", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        await h.grids.reconcile();
        const reads = h.storeReads.length;
        const r = await h.grids.reconcile();
        expect(r).toMatchObject({ kept: 1 });
        expect(h.storeReads.length).toBe(reads);
    });

    it("bundle — 튜플 인코딩 왕복이 파일 캐시의 격자와 일치한다", async () => {
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
        });
        const bundle = await h.grids.bundle();
        expect(bundle.version).toBe(POINT_GRID_CALC_VERSION);
        expect(bundle.dates).toHaveLength(1);
        const decoded = decodeChartGrid(bundle.dates[0].charts[0]);
        expect(decoded.stockCode).toBe("A");
        expect(decoded.grid).toEqual(h.files.get(D)?.charts["A"].grid);
    });

    it("gen 가드 — 낡은 비행의 쓰기·GC 가 새 비행의 산출물을 건드리지 않는다", async () => {
        const D2 = "2026-06-30";
        let release!: () => void;
        const gate = new Promise<void>((res) => (release = res));
        let block = true;
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D), [`B|${D2}`]: twoBars("B", D2) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)], "B|2026-06-21": [dc("B", "2026-06-21", 9500)] },
            beforeMinutes: async (k) => {
                if (k === `A|${D}` && block) await gate;
            },
        });
        const stale = h.grids.reconcile(); // gen0 — A 분봉 읽기 문턱에서 정지
        await new Promise((r) => setTimeout(r, 0));
        h.grids.invalidate();
        block = false;
        h.setAnchors([anchor("B", D2, "2026-06-21")]);
        await h.grids.reconcile(); // gen1 — B 파일 생성, A 는 기대집합 밖
        expect(h.files.has(D2)).toBe(true);
        release();
        await stale; // gen0 완료 — 쓰기·메모·GC 전부 스킵돼야 한다
        expect(h.files.has(D2)).toBe(true); // 낡은 GC 가 새 파일을 안 지움
        expect(h.files.has(D)).toBe(false); // 낡은 비행의 산출물이 파일로 남지 않음
    });

    it("bundle — 비행 중 invalidate 로 gen 이 밀리면 재대사해 빈 번들 200 을 주지 않는다", async () => {
        let release!: () => void;
        const gate = new Promise<void>((res) => (release = res));
        let block = true;
        const h = harness({
            anchors: [anchor("A", D, "2026-06-20")],
            minutes: { [`A|${D}`]: twoBars("A", D) },
            adjDaily: { "A|2026-06-20": [dc("A", "2026-06-20", 9000)] },
            beforeMinutes: async (k) => {
                if (k === `A|${D}` && block) await gate;
            },
        });
        const p = h.grids.bundle(); // 콜드 — 첫 대사가 A 분봉 문턱에서 정지(gen0)
        await new Promise((r) => setTimeout(r, 0));
        h.grids.invalidate(); // 앵커 편집 — gen0 비행의 산출물은 전부 버려진다
        block = false;
        release();
        const bundle = await p; // 재대사(gen1)가 돌아 실제 격자가 실려야 한다
        expect(bundle.dates).toHaveLength(1);
        expect(bundle.dates[0].charts).toHaveLength(1);
        expect(decodeChartGrid(bundle.dates[0].charts[0]).stockCode).toBe("A");
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
