// lab 저장 선 파일 — 임시 폴더에 실제로 쓰고 읽는다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LabChartLine } from "@trade-data-manager/wire";
import { makeChartLineStore, parseLine } from "./chartLines.js";

let dir: string;
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "chart-lines-"));
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

const L = (over: Partial<LabChartLine> = {}): LabChartLine => ({ chartDate: "2026-07-28", anchorDate: "2026-06-26", anchorTime: null, field: "H", market: "un", ...over });

describe("makeChartLineStore", () => {
    it("더하기·중복·차트별 목록 — 종목 파일 하나에 정렬해 쓴다", async () => {
        const s = makeChartLineStore(dir);
        expect(await s.list("000660", "2026-07-28")).toEqual([]);
        await s.add("000660", L({ anchorDate: "2026-07-06", field: "L" }));
        await s.add("000660", L());
        await s.add("000660", L()); // 같은 좌표 — 그대로
        const other = await s.add("000660", L({ chartDate: "2026-07-30" }));
        expect(other).toEqual([L({ chartDate: "2026-07-30" })]);
        expect(await s.list("000660", "2026-07-28")).toEqual([L(), L({ anchorDate: "2026-07-06", field: "L" })]);
        const text = await fs.readFile(path.join(dir, "000660.jsonl"), "utf8");
        expect(text.trim().split("\n")).toHaveLength(3);
    });
    it("지우기 — 마지막 선을 지우면 파일도 없앤다", async () => {
        const s = makeChartLineStore(dir);
        await s.add("000660", L());
        expect(await s.remove("000660", L())).toEqual([]);
        await expect(fs.stat(path.join(dir, "000660.jsonl"))).rejects.toThrow();
    });
    it("파일을 밖에서 고치면 다음 읽기에 보인다(mtime) · 깨진 줄은 던진다", async () => {
        const s = makeChartLineStore(dir);
        await s.add("000660", L());
        const f = path.join(dir, "000660.jsonl");
        await new Promise((r) => setTimeout(r, 20));
        await fs.writeFile(f, JSON.stringify(L({ field: "C" })) + "\n");
        expect((await s.list("000660"))[0].field).toBe("C");
        await new Promise((r) => setTimeout(r, 20));
        await fs.writeFile(f, "{깨짐\n");
        await expect(s.list("000660")).rejects.toThrow(/000660.jsonl:1/);
    });
    it("겹친 쓰기도 서로를 지우지 않는다", async () => {
        const s = makeChartLineStore(dir);
        await Promise.all([s.add("000660", L()), s.add("000660", L({ field: "L" })), s.add("000660", L({ field: "C" }))]);
        expect(await s.list("000660")).toHaveLength(3);
    });
});

describe("makeChartLineStore — 가장자리", () => {
    it("없는 선 지우기는 파일을 건드리지 않고, 밖에서 지운 파일은 빈 목록", async () => {
        const s = makeChartLineStore(dir);
        await s.add("000660", L());
        const f = path.join(dir, "000660.jsonl");
        const before = (await fs.stat(f)).mtimeMs;
        expect(await s.remove("000660", L({ field: "C" }))).toEqual([L()]);
        expect((await fs.stat(f)).mtimeMs).toBe(before);
        await fs.rm(f);
        expect(await s.list("000660")).toEqual([]);
    });
    it("더하기 응답은 GET 과 같은 순서", async () => {
        const s = makeChartLineStore(dir);
        await s.add("000660", L({ anchorDate: "2026-07-06" }));
        expect(await s.add("000660", L({ anchorDate: "2026-06-01" }))).toEqual(await s.list("000660", "2026-07-28"));
    });
});

describe("parseLine", () => {
    it("모르는 칸은 버리고, 틀린 좌표는 400 재료", () => {
        expect(parseLine({ ...L(), extra: 1 })).toEqual(L());
        expect(() => parseLine(L({ anchorDate: "2026-07-29" }))).toThrow(/뒤입니다/);
        expect(() => parseLine({ ...L(), field: "X" })).toThrow(/O\|H\|L\|C/);
        expect(() => parseLine(L({ anchorTime: "09:31:00", market: "krx" }))).toThrow(/un 만/);
        expect(parseLine(L({ anchorDate: "2026-07-28", anchorTime: "09:31:00" })).anchorTime).toBe("09:31:00");
        expect(() => parseLine(L({ chartDate: "2026-02-30" }))).toThrow(/유효한 날짜가 아님/);
        expect(() => parseLine(L({ anchorDate: "2026-07-28", anchorTime: "99:99:99" }))).toThrow(/HH:MM:SS/);
    });
});
