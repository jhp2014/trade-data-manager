import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDaishinRaw, parseMinuteDayFile, RAW_HEADER } from "../rawFiles.js";

const FILE = `﻿# StockChart 1m opt9=0 opt10=3\r\n${RAW_HEADER}\r\nK,901,447,447,447,447,561,250000\r\nN,801,450,451,449,450,10,4500\r\n`;

describe("parseMinuteDayFile", () => {
    it("메모·BOM·CRLF 를 넘기고 시장별로 나눈다", () => {
        const day = parseMinuteDayFile(FILE, "t");
        expect(day.krx).toEqual([{ end: 901, open: "447", high: "447", low: "447", close: "447", volume: "561", amount: "250000" }]);
        expect(day.nxt.map((b) => b.end)).toEqual([801]);
    });

    it("머리줄만 있으면 빈 날이다", () => {
        expect(parseMinuteDayFile(`${RAW_HEADER}\n`, "t")).toEqual({ krx: [], nxt: [] });
    });

    it("형식이 어긋나면 실패한다", () => {
        expect(() => parseMinuteDayFile("", "t")).toThrow("머리줄이 없다");
        expect(() => parseMinuteDayFile(`${RAW_HEADER}\nA,901,1,1,1,1,1,1`, "t")).toThrow("K·N");
        expect(() => parseMinuteDayFile(`${RAW_HEADER}\nK,901,1,1,1,1,,1`, "t")).toThrow("수치");
        expect(() => parseMinuteDayFile(`${RAW_HEADER}\nK,901,1,1,1,1,1`, "t")).toThrow("열 수");
    });
});

describe("createDaishinRaw", () => {
    let dir = "";
    afterEach(async () => {
        if (dir) await fs.rm(dir, { recursive: true, force: true });
    });

    it("없는 종목-날은 null, 있는 건 읽는다, 대상 목록을 쓴다", async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), "daishin-"));
        const raw = createDaishinRaw(dir);
        expect(await raw.readMinuteDay("000040", "2025-05-20")).toBeNull();
        await fs.mkdir(path.join(dir, "2025-05-20"));
        await fs.writeFile(raw.dayFilePath("000040", "2025-05-20"), FILE);
        expect((await raw.readMinuteDay("000040", "2025-05-20"))?.krx).toHaveLength(1);
        const file = await raw.writeTargets([{ stockCode: "000040", date: "2025-05-20" }]);
        expect(await fs.readFile(file, "utf8")).toBe("000040,2025-05-20\n");
    });
});
