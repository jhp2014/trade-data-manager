import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { isNoLedger, keepSameStock, morningCapOf, pruneDayFlows } from "./queries.js";
import { ApiError } from "./http.js";

const dates = (qc: QueryClient) =>
    qc
        .getQueryCache()
        .findAll({ queryKey: ["day-flow"] })
        .map((q) => String(q.queryKey[1]))
        .sort();

describe("pruneDayFlows", () => {
    it("최근 본 날짜 keep 개만 남긴다", () => {
        const qc = new QueryClient();
        const usedAt = new Map<string, number>();
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"].forEach((d, i) => {
            qc.setQueryData(["day-flow", d], { date: d, stocks: [] });
            usedAt.set(d, i);
        });
        pruneDayFlows(qc, 3, usedAt);
        expect(dates(qc)).toEqual(["2026-07-03", "2026-07-04", "2026-07-05"]);
    });

    it("지금 보고 있는(구독 중인) 날짜는 오래됐어도 남긴다", () => {
        const qc = new QueryClient();
        const usedAt = new Map<string, number>();
        ["2026-07-01", "2026-07-02", "2026-07-03"].forEach((d, i) => {
            qc.setQueryData(["day-flow", d], { date: d, stocks: [] });
            usedAt.set(d, i);
        });
        const unsub = new QueryObserver(qc, { queryKey: ["day-flow", "2026-07-01"], enabled: false }).subscribe(() => {});
        pruneDayFlows(qc, 1, usedAt);
        expect(dates(qc)).toEqual(["2026-07-01", "2026-07-03"]);
        unsub();
    });

    it("다른 쿼리(차트 등)는 건드리지 않는다", () => {
        const qc = new QueryClient();
        qc.setQueryData(["chart", "402340", "2026-07-31"], {});
        qc.setQueryData(["day-flow", "2026-07-01"], {});
        qc.setQueryData(["day-flow", "2026-07-02"], {});
        pruneDayFlows(qc, 1, new Map([["2026-07-02", 1]]));
        expect(qc.getQueryData(["chart", "402340", "2026-07-31"])).toBeDefined();
        expect(dates(qc)).toEqual(["2026-07-02"]);
    });
});

describe("morningCapOf", () => {
    const rows = [
        { date: "2026-02-02", cap: "100" },
        { date: "2026-02-03", cap: "200" },
    ];
    it("date < D 인 마지막 줄 — D 자신의 줄(그날 종가)은 안 본다", () => {
        expect(morningCapOf(rows, "2026-02-03")).toBe("100");
        expect(morningCapOf(rows, "2026-02-04")).toBe("200");
    });
    it("앞선 줄이 없으면 null", () => {
        expect(morningCapOf(rows, "2026-02-02")).toBeNull();
        expect(morningCapOf([], "2026-02-03")).toBeNull();
    });
});

describe("keepSameStock", () => {
    it("같은 종목이면 직전 데이터를 잇고, 종목이 바뀌면 비운다", () => {
        const prev = { rows: [1] };
        expect(keepSameStock("005930")(prev, { queryKey: ["daily", "005930", "2026-05-28"] })).toBe(prev);
        expect(keepSameStock("000660")(prev, { queryKey: ["daily", "005930", "2026-05-28"] })).toBeUndefined();
        expect(keepSameStock("005930")(undefined, undefined)).toBeUndefined();
    });
});

describe("isNoLedger — 장부 없는 날(404 「분류 없는 날」)만 가른다", () => {
    it("lab-api 의 장부 없음 404 → true", () => {
        expect(isNoLedger(new ApiError("x", 404, JSON.stringify({ error: "분류 없는 날: 2026-11-10" })))).toBe(true);
    });
    it("배선 404(없는 경로) · 다른 상태 · JSON 아닌 본문 · ApiError 아님 → false(오류로 보인다)", () => {
        expect(isNoLedger(new ApiError("x", 404, JSON.stringify({ error: "없는 경로: /replay/day" })))).toBe(false);
        expect(isNoLedger(new ApiError("x", 500, JSON.stringify({ error: "분류 없는 날: 2026-11-10" })))).toBe(false);
        expect(isNoLedger(new ApiError("x", 404, "<html>not found</html>"))).toBe(false);
        expect(isNoLedger(new Error("분류 없는 날"))).toBe(false);
    });
});
