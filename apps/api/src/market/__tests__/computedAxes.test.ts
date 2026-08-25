import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AxisDeps, ChartAnchor, ComputedAxisDef, ReviewPoint, ReviewPointKey } from "@trade-data-manager/market";
import { ComputedAxes } from "../rank/computedAxes.js";
import { fingerprintOf } from "../rank/axisFingerprint.js";
import type { AxisValueFile, AxisValueStore } from "../rank/axisValueStore.js";

// 인메모리 저장소 — 파일 I/O 없이 증분·무효화 규칙만 본다.
function memoryStore(): AxisValueStore & { files: Map<string, AxisValueFile>; writes: number } {
    const files = new Map<string, AxisValueFile>();
    return {
        files,
        writes: 0,
        read: (key) => Promise.resolve(files.get(key) ?? null),
        write(file) {
            this.writes++;
            files.set(file.key, structuredClone(file));
            return Promise.resolve();
        },
    };
}

const pt = (code: string, time = "09:00:00"): ReviewPoint => ({ stockCode: code, date: "2026-07-02", time });

/** 값 = 종목코드 숫자. missing 에 든 코드는 결손(결과에서 뺀다). */
function fakeAxis(version: number, seen: ReviewPointKey[][], missing = new Set<string>()): ComputedAxisDef {
    return {
        key: "fake",
        name: "가짜 축",
        version,
        strongerWhen: "higher",
        inputs: [],
        compute(points) {
            seen.push([...points]);
            return Promise.resolve(points.filter((p) => !missing.has(p.stockCode)).map((p) => ({ ...p, value: Number(p.stockCode) })));
        },
    };
}

// 축이 포트를 안 쓰므로(fakeAxis) 재료 리더는 호출되지 않는다 — 앵커만 지문 계층이 읽는다.
const makeAxisDeps = (anchors: ChartAnchor[] = []): AxisDeps => ({
    minute: { getMinuteCandles: () => Promise.resolve([]) },
    rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
    adjDaily: { getDailyCandles: () => Promise.resolve([]) },
    chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(anchors) },
    reviewPoints: { listAllPoints: () => Promise.resolve([]) },
});

function makeAxes(points: ReviewPoint[], def: ComputedAxisDef, store: AxisValueStore, anchors: ChartAnchor[] = []): ComputedAxes {
    return new ComputedAxes({
        points: { listAllPoints: () => Promise.resolve(points) },
        axisDeps: makeAxisDeps(anchors),
        defs: [def],
        store,
    });
}

describe("ComputedAxes", () => {
    let store: ReturnType<typeof memoryStore>;
    let seen: ReviewPointKey[][];

    beforeEach(() => {
        store = memoryStore();
        seen = [];
    });

    it("cold 빌드 후 warm 에서는 다시 계산하지 않는다", async () => {
        const points = [pt("001"), pt("002")];
        const def = fakeAxis(1, seen);

        const first = await makeAxes(points, def, store).feeds();
        expect(first[0].values.map((v) => v.value)).toEqual([1, 2]);
        expect(seen).toHaveLength(1);

        const second = await makeAxes(points, def, store).feeds();
        expect(second[0].values.map((v) => v.value)).toEqual([1, 2]);
        expect(seen).toHaveLength(1); // compute 재호출 없음
    });

    it("타점이 늘면 새 타점만 계산한다(축이 타점별 독립이라 가능)", async () => {
        const def = fakeAxis(1, seen);
        await makeAxes([pt("001")], def, store).feeds();

        const feeds = await makeAxes([pt("001"), pt("002")], def, store).feeds();
        expect(seen[1].map((p) => p.stockCode)).toEqual(["002"]); // 001 은 캐시에서
        expect(feeds[0].values.map((v) => v.value)).toEqual([1, 2]);
    });

    it("타점이 사라지면 캐시에서도 지운다", async () => {
        const def = fakeAxis(1, seen);
        await makeAxes([pt("001"), pt("002")], def, store).feeds();

        const feeds = await makeAxes([pt("001")], def, store).feeds();
        expect(feeds[0].values.map((v) => v.stockCode)).toEqual(["001"]);
        expect(Object.keys(store.files.get("fake")!.values)).toEqual(["001|2026-07-02|09:00:00"]);
    });

    it("계산식 버전이 오르면 전량 재계산한다", async () => {
        const points = [pt("001"), pt("002")];
        await makeAxes(points, fakeAxis(1, seen), store).feeds();
        await makeAxes(points, fakeAxis(2, seen), store).feeds();
        expect(seen[1].map((p) => p.stockCode)).toEqual(["001", "002"]);
        expect(store.files.get("fake")!.version).toBe(2);
    });

    it("결손은 피드에서 빠지고, 굳히지 않아 다음에 다시 시도한다", async () => {
        const def = fakeAxis(1, seen, new Set(["002"]));
        const points = [pt("001"), pt("002")];

        const feeds = await makeAxes(points, def, store).feeds();
        expect(feeds[0].values.map((v) => v.stockCode)).toEqual(["001"]); // 002 결손

        await makeAxes(points, def, store).feeds();
        expect(seen[1].map((p) => p.stockCode)).toEqual(["002"]); // 재료가 나중에 채워질 수 있으므로 재시도
    });

    it("바뀐 게 없으면 캐시를 다시 쓰지 않는다", async () => {
        const points = [pt("001")];
        const def = fakeAxis(1, seen);
        await makeAxes(points, def, store).feeds();
        const writesAfterCold = store.writes;

        await makeAxes(points, def, store).feeds();
        expect(store.writes).toBe(writesAfterCold);
    });

    it("invalidate 뒤의 요청은 진행 중이던 굽기에 합류하지 않는다(변경 전 재료로 구운 것)", async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const def: ComputedAxisDef = {
            key: "slow",
            name: "느린 축",
            version: 1,
            strongerWhen: "higher",
            inputs: [],
            async compute(points) {
                seen.push([...points]);
                await gate; // "굽는 중" 상태를 고정
                return points.map((p) => ({ ...p, value: 1 }));
            },
        };
        const axes = makeAxes([pt("001")], def, store);

        const first = axes.feeds();
        await vi.waitFor(() => expect(seen).toHaveLength(1)); // 빌드가 compute 까지 진입

        axes.invalidate(); // 앵커/타점 변경 직후
        const second = axes.feeds(); // 변경 후 refetch — 옛 굽기에 합류하면 방금 편집이 응답에 없다

        release();
        await Promise.all([first, second]);
        expect(seen).toHaveLength(2); // 합류했다면 1
    });

    it("캐시 쓰기 실패는 피드를 죽이지 않는다 — 값은 메모리에서 그대로 서빙", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const broken: AxisValueStore = {
            read: () => Promise.resolve(null),
            write: () => Promise.reject(new Error("EACCES")),
        };
        const feeds = await makeAxes([pt("001")], fakeAxis(1, seen), broken).feeds();
        expect(feeds[0].values.map((v) => v.value)).toEqual([1]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

// ── 앵커 지문 — params 선언 축의 자동 무효화(무효화의 심장) ─────────────────
describe("ComputedAxes 앵커 지문", () => {
    let store: ReturnType<typeof memoryStore>;
    let seen: ReviewPointKey[][];

    beforeEach(() => {
        store = memoryStore();
        seen = [];
    });

    // 차트 소유 앵커 — 타점 시각이 없다(그 차트의 모든 타점에 적용). id 는 지문이 안 읽으므로 아무 값.
    const anchor = (p: ReviewPointKey, anchorDate: string): ChartAnchor =>
        ({ stockCode: p.stockCode, date: p.date, param: "baseline", anchorDate, field: "high", market: "un" });

    /** params 축 — 값 = 앵커가 가리키는 날짜의 일(day). 앵커가 바뀌면 값이 바뀌어야 정상. */
    function paramAxis(): ComputedAxisDef {
        return {
            key: "param-fake",
            name: "앵커 가짜 축",
            version: 1,
            strongerWhen: "higher",
            inputs: [],
            params: ["baseline"],
            async compute(points, deps) {
                seen.push([...points]);
                const anchors = await deps.chartAnchor.listAll();
                const byChart = new Map(anchors.filter((a) => a.param === "baseline").map((a) => [`${a.stockCode}|${a.date}`, a]));
                return points.flatMap((p) => {
                    const a = byChart.get(`${p.stockCode}|${p.date}`);
                    return a ? [{ ...p, value: Number(a.anchorDate.slice(8)) }] : [];
                });
            },
        };
    }

    it("pointCoupled — 같은 차트에 타점이 늘면 **형제도** 다시 굽는다(합성 경로가 바뀌므로)", async () => {
        // 분봉 골격 축의 성질: 값이 형제 타점 집합에 의존한다(타점 종가 합성). 지문에 시각 목록이 안 들어가면
        // 새 타점이 형제의 참값을 바꿨는데 캐시가 그대로인 조용한 스테일이 남는다 — 그걸 여기서 고정한다.
        const coupled = { ...paramAxis(), key: "coupled-fake", pointCoupled: true };
        const p1 = pt("001", "14:00:00");
        const a = [anchor(p1, "2026-06-10")];
        await makeAxes([p1], coupled, store, a).feeds();
        expect(seen[0].map((p) => p.time)).toEqual(["14:00:00"]);

        // 같은 차트에 10:00 타점 추가 → 14:00 의 지문이 바뀌어 둘 다 다시 굽는다.
        const p2 = pt("001", "10:00:00");
        await makeAxes([p1, p2], { ...coupled }, store, a).feeds();
        expect(seen[1].map((p) => p.time).sort()).toEqual(["10:00:00", "14:00:00"]);

        // 다른 차트 타점 추가는 형제가 아니다 — 그 타점만 계산.
        const other = pt("002", "11:00:00");
        await makeAxes([p1, p2, other], { ...coupled }, store, [...a, anchor(other, "2026-06-20")]).feeds();
        expect(seen[2].map((p) => p.stockCode)).toEqual(["002"]);
    });

    it("앵커를 옮기면 **그 타점만** 새 값으로 다시 굽는다(나머지는 캐시 히트)", async () => {
        const points = [pt("001"), pt("002")];
        const a1 = [anchor(points[0], "2026-06-10"), anchor(points[1], "2026-06-20")];
        const first = await makeAxes(points, paramAxis(), store, a1).feeds();
        expect(first[0].values.map((v) => v.value)).toEqual([10, 20]);

        // 001 의 앵커만 6/10 → 6/15 로 이동. 002 는 그대로.
        const a2 = [anchor(points[0], "2026-06-15"), anchor(points[1], "2026-06-20")];
        const second = await makeAxes(points, paramAxis(), store, a2).feeds();
        expect(second[0].values.map((v) => v.value)).toEqual([15, 20]);
        expect(seen[1].map((p) => p.stockCode)).toEqual(["001"]); // 002 는 재계산 안 됨
    });


    it("차트 소유 — 선 하나를 바꾸면 그 차트의 **모든 타점**이 다시 구워진다", async () => {
        const points = [pt("001", "09:00:00"), pt("001", "10:00:00"), pt("002")];
        const a1 = [anchor(points[0], "2026-06-10"), anchor(points[2], "2026-06-20")];
        const first = await makeAxes(points, paramAxis(), store, a1).feeds();
        expect(first[0].values.map((v) => v.value)).toEqual([10, 10, 20]); // 001 두 타점이 같은 선을 본다

        // 001 차트의 선만 이동 — 001 의 두 타점이 함께 stale, 002 는 캐시 히트.
        const a2 = [anchor(points[0], "2026-06-15"), anchor(points[2], "2026-06-20")];
        const second = await makeAxes(points, paramAxis(), store, a2).feeds();
        expect(second[0].values.map((v) => v.value)).toEqual([15, 15, 20]);
        expect(seen[1].map((p) => `${p.stockCode} ${p.time}`)).toEqual(["001 09:00:00", "001 10:00:00"]);
    });

    it("앵커를 해제하면 옛 값이 캐시에 남지 않는다(결손으로 빠진다)", async () => {
        const points = [pt("001")];
        await makeAxes(points, paramAxis(), store, [anchor(points[0], "2026-06-10")]).feeds();
        expect(store.files.get("param-fake")!.values).toHaveProperty(["001|2026-07-02|09:00:00"]);

        const after = await makeAxes(points, paramAxis(), store, []).feeds();
        expect(after[0].values).toEqual([]); // 피드에서 사라짐
        expect(store.files.get("param-fake")!.values).toEqual({}); // 옛 값이 굳어 있지 않다
    });

    /** 필수 baseline + 선택 ignore-candle 축 — 값은 baseline 만 쓰고, 무시 캔들은 있을 수도 없을 수도 있다. */
    function mixedAxis(): ComputedAxisDef {
        const base = paramAxis();
        return { ...base, key: "mixed-fake", optionalParams: ["ignore-candle"] };
    }
    const ignore = (p: ReviewPointKey, anchorDate: string): ChartAnchor =>
        ({ stockCode: p.stockCode, date: p.date, param: "ignore-candle", anchorDate });

    it("한 param 에 앵커가 여럿일 때 행 순서가 바뀌어도 재계산하지 않는다(지문 정렬)", async () => {
        const points = [pt("001")];
        const base = anchor(points[0], "2026-06-10");
        const ig1 = ignore(points[0], "2026-06-01");
        const ig2 = ignore(points[0], "2026-06-02");

        await makeAxes(points, mixedAxis(), store, [base, ig1, ig2]).feeds();
        await makeAxes(points, mixedAxis(), store, [ig2, base, ig1]).feeds(); // 같은 집합, DB 행 순서만 다름
        expect(seen).toHaveLength(1);

        await makeAxes(points, mixedAxis(), store, [base, ig1]).feeds(); // 무시 캔들 하나 해제 = 진짜 변경
        expect(seen).toHaveLength(2);
    });

    it("선택 파라미터만 찍힌 타점은 '입력 전'이라 결손 경고 분모에서 빠진다", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const points = [pt("001"), pt("002"), pt("003"), pt("004"), pt("005")];
        // 001 만 기준선까지 찍혔고(값 나옴), 나머지 넷은 무시 캔들만 찍힌 상태 = 아직 입력 전.
        const anchors = [anchor(points[0], "2026-06-10"), ...points.slice(1).map((p) => ignore(p, "2026-06-01"))];

        await makeAxes(points, mixedAxis(), store, anchors).feeds();

        // 지문 유무로 분모를 세면 5건 중 4건 결손(80%)이 되어 정상 상태가 상시 경고가 된다.
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    // 지문 자체(순수 함수) — 위 시나리오들이 캐시 대조 경로를 보고, 여기는 문자열 규칙만 직접 본다.
    it("fingerprintOf — 선언 안 된 param 제외·정렬 안정·pointCoupled 형제 시각 접미", () => {
        const def = { ...paramAxis(), optionalParams: ["ignore-candle"] };
        const p = pt("001");
        const base = anchor(p, "2026-06-10");
        const ig1 = ignore(p, "2026-06-01");
        const ig2 = ignore(p, "2026-06-02");
        const alien: ChartAnchor = { ...base, param: "undeclared" }; // 선언 안 된 param 은 지문 밖

        // 같은 집합이면 행 순서와 무관하게 같은 문자열(직렬화 전체 정렬).
        const fp = fingerprintOf(def, [base, ig1, ig2, alien], []);
        expect(fingerprintOf(def, [ig2, alien, base, ig1], [])).toBe(fp);
        expect(fingerprintOf(def, [base, ig1], [])).not.toBe(fp); // 무시 캔들 하나 해제 = 진짜 변경

        // params 없는 축은 항상 ""(캐시 히트는 존재 여부만으로).
        expect(fingerprintOf({ ...def, params: undefined, optionalParams: undefined }, [base], [])).toBe("");

        // pointCoupled — 형제 시각 목록이 정렬돼 붙는다(순서 무관, 집합 변경만 지문 변경).
        const coupled = { ...def, pointCoupled: true };
        expect(fingerprintOf(coupled, [base], ["14:00:00", "10:00:00"])).toBe(fingerprintOf(coupled, [base], ["10:00:00", "14:00:00"]));
        expect(fingerprintOf(coupled, [base], ["10:00:00"])).not.toBe(fingerprintOf(coupled, [base], ["10:00:00", "14:00:00"]));
    });

    it("params 없는 축은 앵커가 바뀌어도 재계산하지 않는다", async () => {
        const points = [pt("001")];
        const plain: ComputedAxisDef = {
            key: "fake", name: "가짜", version: 1, strongerWhen: "higher", inputs: [],
            compute(pts) { seen.push([...pts]); return Promise.resolve(pts.map((p) => ({ ...p, value: 1 }))); },
        };
        await makeAxes(points, plain, store, []).feeds();
        await makeAxes(points, plain, store, [anchor(points[0], "2026-06-10")]).feeds();
        expect(seen).toHaveLength(1); // 두 번째 호출은 전부 캐시 히트
    });
});


// ── day 축 — 행 = 차트(종목,날짜), 모수 = 필수 param 앵커가 있는 차트 ─────────────
describe("ComputedAxes day 축", () => {
    let store: ReturnType<typeof memoryStore>;
    let seenCharts: { stockCode: string; date: string }[][];

    /** 값 = 종목코드 숫자. 행 = 차트 — 결과에 time 이 없다. */
    function dayAxis(version: number): ComputedAxisDef {
        return {
            key: "fake-day",
            name: "가짜 day 축",
            version,
            strongerWhen: "higher",
            grain: "day",
            inputs: [],
            params: ["baseline"],
            compute(charts) {
                seenCharts.push([...charts]);
                return Promise.resolve(charts.map((c) => ({ stockCode: c.stockCode, date: c.date, value: Number(c.stockCode) })));
            },
        };
    }

    const line = (code: string, over: Partial<ChartAnchor> = {}): ChartAnchor =>
        ({ stockCode: code, date: "2026-07-02", param: "baseline", anchorDate: "2026-07-01", field: "high", market: "un", ...over });

    beforeEach(() => {
        store = memoryStore();
        seenCharts = [];
    });

    it("모수 = 필수 param 앵커가 있는 차트 — **타점이 0이어도** 행이 된다(재편의 수용 기준)", async () => {
        // 타점은 001 하나뿐인데 기준선은 001·002 두 차트에 있다 → 행은 둘.
        const axes = makeAxes([pt("001")], dayAxis(1), store, [line("001"), line("002")]);
        const feeds = await axes.feeds();
        expect(feeds[0].values).toEqual([
            { stockCode: "001", date: "2026-07-02", value: 1 },
            { stockCode: "002", date: "2026-07-02", value: 2 },
        ]);
        expect(feeds[0].values.every((v) => v.time === undefined)).toBe(true); // 행 = 차트, 시각 없음
    });

    it("필수 앵커 없는 차트는 모수 밖(입력 전) — 타점이 있어도 compute 에 안 들어간다", async () => {
        const axes = makeAxes([pt("003")], dayAxis(1), store, [line("001")]);
        const feeds = await axes.feeds();
        expect(seenCharts[0].map((c) => c.stockCode)).toEqual(["001"]);
        expect(feeds[0].values.map((v) => v.stockCode)).toEqual(["001"]);
    });

    it("캐시 행 키 = chartKey — warm 에서 재계산하지 않고, 앵커 해제로 행이 소멸하면 지운다", async () => {
        const anchors = [line("001"), line("002")];
        await makeAxes([], dayAxis(1), store, anchors).feeds();
        expect(Object.keys(store.files.get("fake-day")!.values).sort()).toEqual(["001|2026-07-02", "002|2026-07-02"]);

        await makeAxes([], dayAxis(1), store, anchors).feeds();
        expect(seenCharts).toHaveLength(1); // warm — compute 재호출 없음

        const after = await makeAxes([], dayAxis(1), store, [line("001")]).feeds(); // 002 해제
        expect(after[0].values.map((v) => v.stockCode)).toEqual(["001"]);
        expect(Object.keys(store.files.get("fake-day")!.values)).toEqual(["001|2026-07-02"]);
    });

    it("차트 소유 앵커가 바뀌면 그 차트만 다시 굽는다 — 타점 소유 앵커는 day 축 지문 밖", async () => {
        const anchors = [line("001"), line("002")];
        await makeAxes([], dayAxis(1), store, anchors).feeds();

        const moved = [line("001", { anchorDate: "2026-06-30" }), line("002")];
        await makeAxes([], dayAxis(1), store, moved).feeds();
        expect(seenCharts[1].map((c) => c.stockCode)).toEqual(["001"]); // 002 는 캐시 히트

        // 타점 소유 앵커(time 있음)는 재료가 아니다 — 지문도 모수도 안 바뀐다.
        const withPointAnchor = [...moved, line("001", { time: "09:00:00", param: "baseline" })];
        await makeAxes([], dayAxis(1), store, withPointAnchor).feeds();
        expect(seenCharts).toHaveLength(2); // 재계산 없음
    });
});
