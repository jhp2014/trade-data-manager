import { describe, it, expect } from "vitest";
import { makeSheetsClient } from "../client.js";
import type { SheetsTransport } from "../transport.js";
import { SheetsError } from "../errors.js";

/**
 * fake transport — 네트워크 없이 client 의 캐시/헤더초기화/자가복구를 검증한다.
 * calls 에 호출 흔적을 남기고 values/tabs 로 상태를 흉내낸다.
 */
function createFake(opts?: { tabs?: string[] }) {
    const calls: string[] = [];
    const tabs = new Set(opts?.tabs ?? ["review"]);
    let values: string[][] = [];
    let failAppendOnce = false;

    const transport: SheetsTransport = {
        async getValues(_id, range) {
            calls.push(`get:${range}`);
            return values;
        },
        async updateValues(_id, range, v) {
            calls.push(`update:${range}`);
            values = v;
        },
        async clearValues(_id, range) {
            calls.push(`clear:${range}`);
            values = [];
        },
        async appendValues(_id, range, v) {
            calls.push(`append:${range}`);
            if (failAppendOnce) {
                failAppendOnce = false;
                throw new SheetsError("탭 없음", { status: 400 });
            }
            values.push(...v);
        },
        async getTabTitles() {
            calls.push("titles");
            return [...tabs];
        },
        async addTab(_id, t) {
            calls.push(`addTab:${t}`);
            tabs.add(t);
        },
    };

    return {
        transport,
        calls,
        get values() {
            return values;
        },
        removeTab: (t: string) => tabs.delete(t),
        failNextAppend: () => {
            failAppendOnce = true;
        },
    };
}

describe("appendRows", () => {
    it("빈 탭이면 헤더를 먼저 쓴다", async () => {
        const f = createFake();
        const c = makeSheetsClient(f.transport);

        const r = await c.appendRows({
            spreadsheetId: "s",
            tab: "review",
            rows: [["a", "b"]],
            headers: ["h1", "h2"],
        });

        expect(r.wroteHeaders).toBe(true);
        expect(f.values).toEqual([
            ["h1", "h2"],
            ["a", "b"],
        ]);
    });

    it("2회차는 캐시로 append 1회만(존재/공백 확인 생략)", async () => {
        const f = createFake();
        const c = makeSheetsClient(f.transport);

        await c.appendRows({ spreadsheetId: "s", tab: "review", rows: [["a", "b"]], headers: ["h1", "h2"] });
        f.calls.length = 0;

        const r2 = await c.appendRows({ spreadsheetId: "s", tab: "review", rows: [["c", "d"]], headers: ["h1", "h2"] });

        expect(r2.wroteHeaders).toBe(false);
        expect(f.calls).toEqual(["append:'review'!A1"]);
        expect(f.values).toEqual([
            ["h1", "h2"],
            ["a", "b"],
            ["c", "d"],
        ]);
    });

    it("외부 탭삭제로 append 실패 시 느린 경로로 자가복구한다", async () => {
        const f = createFake();
        const c = makeSheetsClient(f.transport);

        await c.appendRows({ spreadsheetId: "s", tab: "review", rows: [["a", "b"]], headers: ["h1", "h2"] });

        f.removeTab("review");
        f.failNextAppend();
        f.calls.length = 0;

        await c.appendRows({ spreadsheetId: "s", tab: "review", rows: [["e", "f"]], headers: ["h1", "h2"] });

        // 빠른 경로 append 시도(실패) → 캐시 무효화 → 느린 경로: 탭 재생성 + append
        expect(f.calls[0]).toBe("append:'review'!A1");
        expect(f.calls).toContain("addTab:review");
    });
});

describe("overwriteTab", () => {
    it("탭 보장 → clear → A1부터 update 순서", async () => {
        const f = createFake();
        const c = makeSheetsClient(f.transport);

        await c.overwriteTab({ spreadsheetId: "s", tab: "review", matrix: [["x"]] });

        expect(f.calls).toEqual(["titles", "clear:'review'", "update:'review'!A1"]);
        expect(f.values).toEqual([["x"]]);
    });
});

describe("readMatrix", () => {
    it("범위 미지정은 탭 전체, 지정 시 탭!범위", async () => {
        const f = createFake();
        const c = makeSheetsClient(f.transport);

        await c.readMatrix("s", "review");
        await c.readMatrix("s", "review", { range: "A1:B2" });

        expect(f.calls).toEqual(["get:'review'", "get:'review'!A1:B2"]);
    });
});
