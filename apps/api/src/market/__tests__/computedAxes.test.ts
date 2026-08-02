import { describe, it, expect, beforeEach } from "vitest";
import type { AxisDeps, ComputedAxisDef, ReviewPoint, ReviewPointKey } from "@trade-data-manager/market";
import { ComputedAxes, type AxisValueFile, type AxisValueStore } from "../rank/computedAxes.js";

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

// 축이 포트를 안 쓰므로(fakeAxis) 재료 리더는 호출되지 않는다 — 타입만 채운다.
const axisDeps = {
    minute: { getMinuteCandles: () => Promise.resolve([]) },
    rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
    adjDaily: { getDailyCandles: () => Promise.resolve([]) },
} satisfies AxisDeps;

function makeAxes(points: ReviewPoint[], def: ComputedAxisDef, store: AxisValueStore): ComputedAxes {
    return new ComputedAxes({
        points: { listAllPoints: () => Promise.resolve(points), listByChart: () => Promise.resolve([]) },
        axisDeps,
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
});
