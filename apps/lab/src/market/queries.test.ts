import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { pruneDayReplays } from "./queries.js";

const dates = (qc: QueryClient) =>
    qc
        .getQueryCache()
        .findAll({ queryKey: ["day-replay"] })
        .map((q) => String(q.queryKey[1]))
        .sort();

describe("pruneDayReplays", () => {
    it("최근 본 날짜 keep 개만 남긴다", () => {
        const qc = new QueryClient();
        const usedAt = new Map<string, number>();
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"].forEach((d, i) => {
            qc.setQueryData(["day-replay", d], { date: d, stocks: [] });
            usedAt.set(d, i);
        });
        pruneDayReplays(qc, 3, usedAt);
        expect(dates(qc)).toEqual(["2026-07-03", "2026-07-04", "2026-07-05"]);
    });

    it("지금 보고 있는(구독 중인) 날짜는 오래됐어도 남긴다", () => {
        const qc = new QueryClient();
        const usedAt = new Map<string, number>();
        ["2026-07-01", "2026-07-02", "2026-07-03"].forEach((d, i) => {
            qc.setQueryData(["day-replay", d], { date: d, stocks: [] });
            usedAt.set(d, i);
        });
        const unsub = new QueryObserver(qc, { queryKey: ["day-replay", "2026-07-01"], enabled: false }).subscribe(() => {});
        pruneDayReplays(qc, 1, usedAt);
        expect(dates(qc)).toEqual(["2026-07-01", "2026-07-03"]);
        unsub();
    });

    it("다른 쿼리(차트 등)는 건드리지 않는다", () => {
        const qc = new QueryClient();
        qc.setQueryData(["chart", "402340", "2026-07-31"], {});
        qc.setQueryData(["day-replay", "2026-07-01"], {});
        qc.setQueryData(["day-replay", "2026-07-02"], {});
        pruneDayReplays(qc, 1, new Map([["2026-07-02", 1]]));
        expect(qc.getQueryData(["chart", "402340", "2026-07-31"])).toBeDefined();
        expect(dates(qc)).toEqual(["2026-07-02"]);
    });
});
