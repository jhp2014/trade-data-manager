import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AxisDeps, ChartAnchor, ChartRef, ComputedAxisDef, GroupMembership } from "@trade-data-manager/market";
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

// 축은 전부 day 그레인이다(2026-09-01 point 축 서버 폐지) — 행 = 차트(종목,날짜).
/** 값 = 종목코드 숫자. missing 에 든 코드는 결손(결과에서 뺀다). params 선언 → 모수 = 그 앵커 있는 차트. */
function fakeAxis(version: number, seen: ChartRef[][], missing = new Set<string>()): ComputedAxisDef {
    return {
        key: "fake",
        name: "가짜 축",
        version,
        strongerWhen: "higher",
        grain: "day",
        inputs: [],
        params: ["baseline"],
        compute(charts) {
            seen.push([...charts]);
            return Promise.resolve(charts.filter((c) => !missing.has(c.stockCode)).map((c) => ({ stockCode: c.stockCode, date: c.date, value: Number(c.stockCode) })));
        },
    };
}

/** 기준선 앵커 — 이 축들의 모수를 세우는 손잡이(차트 소유: 시각 없음). */
const line = (code: string, over: Partial<ChartAnchor> = {}): ChartAnchor =>
    ({ stockCode: code, date: "2026-07-02", param: "baseline", anchorDate: "2026-07-01", field: "high", market: "un", ...over });

// 축이 포트를 안 쓰므로(fakeAxis) 재료 리더는 호출되지 않는다 — 앵커만 지문 계층이 읽는다.
const makeAxisDeps = (anchors: ChartAnchor[] = []): AxisDeps => ({
    minute: { getMinuteCandles: () => Promise.resolve([]) },
    rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
    adjDaily: { getDailyCandles: () => Promise.resolve([]) },
    chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(anchors) },
    marketCap: { getByDateAndCodes: () => Promise.resolve([]) },
});

function makeAxes(
    def: ComputedAxisDef,
    store: AxisValueStore,
    anchors: ChartAnchor[] = [],
    memberships: GroupMembership[] = [],
): ComputedAxes {
    return new ComputedAxes({
        groups: { listAllMemberships: () => Promise.resolve(memberships) },
        axisDeps: makeAxisDeps(anchors),
        defs: [def],
        store,
    });
}

describe("ComputedAxes", () => {
    let store: ReturnType<typeof memoryStore>;
    let seen: ChartRef[][];

    beforeEach(() => {
        store = memoryStore();
        seen = [];
    });

    it("cold 빌드 후 warm 에서는 다시 계산하지 않는다", async () => {
        const anchors = [line("001"), line("002")];
        const def = fakeAxis(1, seen);

        const first = await makeAxes(def, store, anchors).feeds();
        expect(first[0].values.map((v) => v.value)).toEqual([1, 2]);
        expect(seen).toHaveLength(1);

        const second = await makeAxes(def, store, anchors).feeds();
        expect(second[0].values.map((v) => v.value)).toEqual([1, 2]);
        expect(seen).toHaveLength(1); // compute 재호출 없음
    });

    it("행이 늘면 새 행만 계산한다(축이 행별 독립이라 가능)", async () => {
        const def = fakeAxis(1, seen);
        await makeAxes(def, store, [line("001")]).feeds();

        const feeds = await makeAxes(def, store, [line("001"), line("002")]).feeds();
        expect(seen[1].map((c) => c.stockCode)).toEqual(["002"]); // 001 은 캐시에서
        expect(feeds[0].values.map((v) => v.value)).toEqual([1, 2]);
    });

    it("행이 사라지면 캐시에서도 지운다", async () => {
        const def = fakeAxis(1, seen);
        await makeAxes(def, store, [line("001"), line("002")]).feeds();

        const feeds = await makeAxes(def, store, [line("001")]).feeds();
        expect(feeds[0].values.map((v) => v.stockCode)).toEqual(["001"]);
        expect(Object.keys(store.files.get("fake")!.values)).toEqual(["001|2026-07-02"]);
    });

    it("계산식 버전이 오르면 전량 재계산한다", async () => {
        const anchors = [line("001"), line("002")];
        await makeAxes(fakeAxis(1, seen), store, anchors).feeds();
        await makeAxes(fakeAxis(2, seen), store, anchors).feeds();
        expect(seen[1].map((c) => c.stockCode)).toEqual(["001", "002"]);
        expect(store.files.get("fake")!.version).toBe(2);
    });

    it("결손은 피드에서 빠지고, 굳히지 않아 다음에 다시 시도한다", async () => {
        const def = fakeAxis(1, seen, new Set(["002"]));
        const anchors = [line("001"), line("002")];

        const feeds = await makeAxes(def, store, anchors).feeds();
        expect(feeds[0].values.map((v) => v.stockCode)).toEqual(["001"]); // 002 결손

        await makeAxes(def, store, anchors).feeds();
        expect(seen[1].map((c) => c.stockCode)).toEqual(["002"]); // 재료가 나중에 채워질 수 있으므로 재시도
    });

    it("바뀜 게 없으면 캐시를 다시 쓰지 않는다", async () => {
        const def = fakeAxis(1, seen);
        await makeAxes(def, store, [line("001")]).feeds();
        const writesAfterCold = store.writes;

        await makeAxes(def, store, [line("001")]).feeds();
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
            grain: "day",
            inputs: [],
            params: ["baseline"],
            async compute(charts) {
                seen.push([...charts]);
                await gate; // "굽는 중" 상태를 고정
                return charts.map((c) => ({ stockCode: c.stockCode, date: c.date, value: 1 }));
            },
        };
        const axes = makeAxes(def, store, [line("001")]);

        const first = axes.feeds();
        await vi.waitFor(() => expect(seen).toHaveLength(1)); // 빌드가 compute 까지 진입

        axes.invalidate(); // 앵커 변경 직후
        const second = axes.feeds(); // 변경 후 refetch — 옆 굽기에 합류하면 방금 편집이 응답에 없다

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
        const feeds = await makeAxes(fakeAxis(1, seen), broken, [line("001")]).feeds();
        expect(feeds[0].values.map((v) => v.value)).toEqual([1]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

// ── 앵커 지문 — params 선언 축의 자동 무효화(무효화의 심장) ─────────────────
describe("ComputedAxes 앵커 지문", () => {
    let store: ReturnType<typeof memoryStore>;
    let seen: ChartRef[][];

    beforeEach(() => {
        store = memoryStore();
        seen = [];
    });

    /** params 축 — 값 = 앵커가 가리키는 날짜의 일(day). 앵커가 바뀌면 값이 바뀌어야 정상. */
    function paramAxis(): ComputedAxisDef {
        return {
            key: "param-fake",
            name: "앵커 가짜 축",
            version: 1,
            strongerWhen: "higher",
            grain: "day",
            inputs: [],
            params: ["baseline"],
            async compute(charts, deps) {
                seen.push([...charts]);
                const anchors = await deps.chartAnchor.listAll();
                const byChart = new Map(anchors.filter((a) => a.param === "baseline").map((a) => [`${a.stockCode}|${a.date}`, a]));
                return charts.flatMap((c) => {
                    const a = byChart.get(`${c.stockCode}|${c.date}`);
                    return a ? [{ stockCode: c.stockCode, date: c.date, value: Number(a.anchorDate.slice(8)) }] : [];
                });
            },
        };
    }

    it("앵커를 옮기면 **그 차트만** 새 값으로 다시 굽는다(나머지는 캐시 히트)", async () => {
        const a1 = [line("001", { anchorDate: "2026-06-10" }), line("002", { anchorDate: "2026-06-20" })];
        const first = await makeAxes(paramAxis(), store, a1).feeds();
        expect(first[0].values.map((v) => v.value)).toEqual([10, 20]);

        // 001 의 앵커만 6/10 → 6/15 로 이동. 002 는 그대로.
        const a2 = [line("001", { anchorDate: "2026-06-15" }), line("002", { anchorDate: "2026-06-20" })];
        const second = await makeAxes(paramAxis(), store, a2).feeds();
        expect(second[0].values.map((v) => v.value)).toEqual([15, 20]);
        expect(seen[1].map((c) => c.stockCode)).toEqual(["001"]); // 002 는 재계산 안 됨
    });

    it("앵커를 해제하면 예냠 값이 캐시에 남지 않는다(결손으로 빠진다)", async () => {
        await makeAxes(paramAxis(), store, [line("001", { anchorDate: "2026-06-10" })]).feeds();
        expect(store.files.get("param-fake")!.values).toHaveProperty(["001|2026-07-02"]);

        const after = await makeAxes(paramAxis(), store, []).feeds();
        expect(after[0].values).toEqual([]); // 피드에서 사라짐
        expect(store.files.get("param-fake")!.values).toEqual({}); // 예냠 값이 굳어 있지 않다
    });

    /** 필수 baseline + 선택 ignore-candle 축 — 값은 baseline 만 쓰고, 무시 캔들은 있을 수도 없을 수도 있다. */
    function mixedAxis(): ComputedAxisDef {
        return { ...paramAxis(), key: "mixed-fake", optionalParams: ["ignore-candle"] };
    }
    const ignore = (code: string, anchorDate: string): ChartAnchor =>
        ({ stockCode: code, date: "2026-07-02", param: "ignore-candle", anchorDate });

    it("한 param 에 앵커가 여럿일 때 행 순서가 바뀜도 재계산하지 않는다(지문 정렬)", async () => {
        const base = line("001", { anchorDate: "2026-06-10" });
        const ig1 = ignore("001", "2026-06-01");
        const ig2 = ignore("001", "2026-06-02");

        await makeAxes(mixedAxis(), store, [base, ig1, ig2]).feeds();
        await makeAxes(mixedAxis(), store, [ig2, base, ig1]).feeds(); // 같은 집합, DB 행 순서만 다름
        expect(seen).toHaveLength(1);

        await makeAxes(mixedAxis(), store, [base, ig1]).feeds(); // 무시 캔들 하나 해제 = 진짜 변경
        expect(seen).toHaveLength(2);
    });

    it("선택 파라미터만 찍힐 차트는 모수 밖(입력 전)이라 결손 경고가 상시로 울지 않는다", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        // 001 만 기준선까지 찍혔고(값 나옴), 나머지 넷은 무시 캔들만 = 아직 입력 전 → 모수에 없다.
        const anchors = [line("001", { anchorDate: "2026-06-10" }), ...["002", "003", "004", "005"].map((c) => ignore(c, "2026-06-01"))];

        const feeds = await makeAxes(mixedAxis(), store, anchors).feeds();
        expect(feeds[0].values.map((v) => v.stockCode)).toEqual(["001"]);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    // 지문 자체(순수 함수) — 위 시나리오들이 캐시 대조 경로를 보고, 여기는 문자열 규칙만 직접 본다.
    it("fingerprintOf — 선언 안 된 param 제외·정렬 안정", () => {
        const def = { ...paramAxis(), optionalParams: ["ignore-candle"] };
        const base = line("001", { anchorDate: "2026-06-10" });
        const ig1 = ignore("001", "2026-06-01");
        const ig2 = ignore("001", "2026-06-02");
        const alien: ChartAnchor = { ...base, param: "undeclared" }; // 선언 안 된 param 은 지문 밖

        // 같은 집합이면 행 순서와 무관하게 같은 문자열(직렬화 전체 정렬).
        const fp = fingerprintOf(def, [base, ig1, ig2, alien]);
        expect(fingerprintOf(def, [ig2, alien, base, ig1])).toBe(fp);
        expect(fingerprintOf(def, [base, ig1])).not.toBe(fp); // 무시 캔들 하나 해제 = 진짜 변경

        // params 없는 축은 항상 ""(캐시 히트는 존재 여부만으로).
        expect(fingerprintOf({ ...def, params: undefined, optionalParams: undefined }, [base])).toBe("");
    });

    it("params 없는 축은 앵커가 바뀜도 재계산하지 않는다", async () => {
        const plain: ComputedAxisDef = {
            key: "fake", name: "가짜", version: 1, strongerWhen: "higher", grain: "day", inputs: [],
            compute(charts) { seen.push([...charts]); return Promise.resolve(charts.map((c) => ({ stockCode: c.stockCode, date: c.date, value: 1 }))); },
        };
        await makeAxes(plain, store, [line("001")]).feeds();
        await makeAxes(plain, store, [line("001", { anchorDate: "2026-06-10" })]).feeds();
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

    beforeEach(() => {
        store = memoryStore();
        seenCharts = [];
    });

    it("모수 = 필수 param 앵커가 있는 차트 — **타점이 0이어도** 행이 된다(재편의 수용 기준)", async () => {
        // 타점은 001 하나뿐인데 기준선은 001·002 두 차트에 있다 → 행은 둘.
        const axes = makeAxes(dayAxis(1), store, [line("001"), line("002")]);
        const feeds = await axes.feeds();
        expect(feeds[0].values).toEqual([
            { stockCode: "001", date: "2026-07-02", value: 1 },
            { stockCode: "002", date: "2026-07-02", value: 2 },
        ]);
        expect(feeds[0].values.every((v) => v.time === undefined)).toBe(true); // 행 = 차트, 시각 없음
    });

    it("필수 앵커 없는 차트는 모수 밖(입력 전) — 앵커 있는 차트만 compute 에 들어간다", async () => {
        const axes = makeAxes(dayAxis(1), store, [line("001")]);
        const feeds = await axes.feeds();
        expect(seenCharts[0].map((c) => c.stockCode)).toEqual(["001"]);
        expect(feeds[0].values.map((v) => v.stockCode)).toEqual(["001"]);
    });

    it("캐시 행 키 = chartKey — warm 에서 재계산하지 않고, 앵커 해제로 행이 소멸하면 지운다", async () => {
        const anchors = [line("001"), line("002")];
        await makeAxes(dayAxis(1), store, anchors).feeds();
        expect(Object.keys(store.files.get("fake-day")!.values).sort()).toEqual(["001|2026-07-02", "002|2026-07-02"]);

        await makeAxes(dayAxis(1), store, anchors).feeds();
        expect(seenCharts).toHaveLength(1); // warm — compute 재호출 없음

        const after = await makeAxes(dayAxis(1), store, [line("001")]).feeds(); // 002 해제
        expect(after[0].values.map((v) => v.stockCode)).toEqual(["001"]);
        expect(Object.keys(store.files.get("fake-day")!.values)).toEqual(["001|2026-07-02"]);
    });

    it("차트 소유 앵커가 바뀌면 그 차트만 다시 굽는다 — 타점 소유 앵커는 day 축 지문 밖", async () => {
        const anchors = [line("001"), line("002")];
        await makeAxes(dayAxis(1), store, anchors).feeds();

        const moved = [line("001", { anchorDate: "2026-06-30" }), line("002")];
        await makeAxes(dayAxis(1), store, moved).feeds();
        expect(seenCharts[1].map((c) => c.stockCode)).toEqual(["001"]); // 002 는 캐시 히트

        // 같은 차트에 다른 param 앵커가 붙어도 그 축의 재료가 아니면 지문이 안 바뀐다.
        const withOtherParam = [...moved, line("001", { param: "ignore-candle", field: undefined, market: undefined })];
        await makeAxes(dayAxis(1), store, withOtherParam).feeds();
        expect(seenCharts).toHaveLength(2); // 재계산 없음
    });
});

// ── 앵커 무관 day 축 — 모수 = 후보 하루 전부(앵커 ∪ 그룹) ─────────────────
// 클라 candidateDaysOf 와 같은 정의여야 한다. 옛 규칙(타점 차트로 폴백)은 실측 54행이라 축이 조용히 비었다.
describe("ComputedAxes 앵커 무관 day 축", () => {
    let store: ReturnType<typeof memoryStore>;
    let seenCharts: { stockCode: string; date: string }[][];

    /** params 없는 day 축 — 재료가 시장 데이터로 완결되는 축(전일 고가 % 류). */
    function openDayAxis(): ComputedAxisDef {
        return {
            key: "fake-open-day",
            name: "가짜 앵커무관 day 축",
            version: 1,
            strongerWhen: "higher",
            grain: "day",
            inputs: [],
            compute(charts) {
                seenCharts.push([...charts]);
                return Promise.resolve(charts.map((c) => ({ stockCode: c.stockCode, date: c.date, value: Number(c.stockCode) })));
            },
        };
    }

    const member = (code: string): GroupMembership => ({ stockCode: code, date: "2026-07-02", groupNames: ["형태:돌파"] });

    beforeEach(() => {
        store = memoryStore();
        seenCharts = [];
    });

    // 타점은 항이 아니다 — 격자 파생물이라 사람 편집물이 아니고, 클라 candidateDaysOf 와 같은 정의다.
    it("모수 = 앵커 ∪ 그룹 — 둘 중 무엇이든 흔적이 있으면 행이 된다(타점만 있는 하루는 아니다)", async () => {
        const axes = makeAxes(openDayAxis(), store, [line("002")], [member("003")]);
        const feeds = await axes.feeds();
        expect(feeds[0].values.map((v) => v.stockCode).sort()).toEqual(["002", "003"]);
        expect(feeds[0].values.every((v) => v.time === undefined)).toBe(true); // 행 = 차트
    });

    it("흔적이 하나도 없으면 모수가 빈다 — 없는 하루를 지어내지 않는다", async () => {
        const feeds = await makeAxes(openDayAxis(), store).feeds();
        expect(feeds[0].values).toEqual([]);
        expect(seenCharts[0] ?? []).toEqual([]);
    });

    it("같은 하루가 여러 흔적을 가져도 행은 하나다", async () => {
        const axes = makeAxes(openDayAxis(), store, [line("001")], [member("001")]);
        const feeds = await axes.feeds();
        expect(feeds[0].values).toHaveLength(1);
    });

    it("앵커를 옮겨도 재계산이 없다 — 지문이 비어 있다(캐시 영구 히트, version 상향이 유일한 처방)", async () => {
        await makeAxes(openDayAxis(), store, [line("001")]).feeds();
        await makeAxes(openDayAxis(), store, [line("001", { anchorDate: "2026-06-30" })]).feeds();
        expect(seenCharts).toHaveLength(1);
    });
});
