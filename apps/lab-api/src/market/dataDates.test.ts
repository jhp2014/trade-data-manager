// 물화 로직만 본다(쿼리는 가짜 reader) — 파일 생성(cold)·증분 머지(warm 꼬리)·오늘 생략 게이트·손상 자가치유.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MaterializedDataDates } from "./dataDates.js";

let dir: string;
let file: string;
let calls: (string | undefined)[];

/** after 기록 + after 이후 날짜만 돌려주는 가짜 reader. */
const reader = (all: string[]) => ({
    listMinuteDates: async (after?: string) => {
        calls.push(after);
        return after === undefined ? all : all.filter((d) => d > after);
    },
});
const make = (all: string[], today: string) => new MaterializedDataDates(reader(all), file, () => today);

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "data-dates-"));
    file = join(dir, "data-dates.json");
    calls = [];
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("MaterializedDataDates", () => {
    it("cold — 전체 스캔(after 없음) 후 파일 생성", async () => {
        const m = make(["2025-01-02", "2025-01-03"], "2025-01-05");
        expect(await m.list()).toEqual(["2025-01-02", "2025-01-03"]);
        expect(calls).toEqual([undefined]);
        expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ dates: ["2025-01-02", "2025-01-03"], maxDate: "2025-01-03" });
    });

    it("warm 꼬리 — maxDate 초과만 증분 스캔해 머지, 파일 갱신", async () => {
        await writeFile(file, JSON.stringify({ dates: ["2025-01-02"], maxDate: "2025-01-02" }), "utf8");
        const m = make(["2025-01-02", "2025-01-03"], "2025-01-05");
        expect(await m.list()).toEqual(["2025-01-02", "2025-01-03"]);
        expect(calls).toEqual(["2025-01-02"]);
        expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ dates: ["2025-01-02", "2025-01-03"], maxDate: "2025-01-03" });
    });

    it("maxDate ≥ 오늘이면 스캔 생략(쿼리 0회)", async () => {
        await writeFile(file, JSON.stringify({ dates: ["2025-01-02", "2025-01-05"], maxDate: "2025-01-05" }), "utf8");
        const m = make(["안 읽는다"], "2025-01-05");
        expect(await m.list()).toEqual(["2025-01-02", "2025-01-05"]);
        expect(calls).toEqual([]);
    });

    it("손상 파일 — 치우고 cold 재빌드(자가치유)", async () => {
        await writeFile(file, "{부서진 json", "utf8");
        const m = make(["2025-01-02"], "2025-01-05");
        expect(await m.list()).toEqual(["2025-01-02"]);
        expect(calls).toEqual([undefined]);
        expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ dates: ["2025-01-02"], maxDate: "2025-01-02" });
    });
});
