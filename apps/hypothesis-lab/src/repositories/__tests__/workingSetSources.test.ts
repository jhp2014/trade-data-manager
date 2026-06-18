import { describe, expect, it } from "vitest";
import type { ReviewCase, ReviewCaseSource } from "@/repositories/ReviewCaseSource";
import type { WorkingSetSource } from "@/repositories/WorkingSetSource";
import {
    FallbackWorkingSetSource,
    ReviewMonthWorkingSetSource,
    ReviewRecentWorkingSetSource,
    SnapshotWorkingSetSource,
    createWorkingSetSource,
    type WorkingSetDeps,
} from "@/repositories/workingSetSources";

const rc = (caseId: string): ReviewCase => ({
    caseId,
    stockCode: "",
    stockName: null,
    tradeDate: "",
    tradeTime: null,
});

function fakeReview(opts: { recent?: ReviewCase[]; month?: ReviewCase[] }): ReviewCaseSource {
    return {
        enrich: async () => [],
        findOrphans: async () => [],
        listRecent: async () => opts.recent ?? [],
        listByMonth: async () => opts.month ?? [],
    };
}

const fixed = (ids: string[]): WorkingSetSource => ({ listCaseIds: async () => ids });

describe("개별 소스", () => {
    it("ReviewRecent 는 listRecent 의 caseId 를 낸다", async () => {
        const src = new ReviewRecentWorkingSetSource(fakeReview({ recent: [rc("a"), rc("b")] }), 500);
        expect(await src.listCaseIds()).toEqual(["a", "b"]);
    });

    it("ReviewMonth 는 listByMonth 의 caseId 를 낸다", async () => {
        const src = new ReviewMonthWorkingSetSource(fakeReview({ month: [rc("m")] }), "2026-06");
        expect(await src.listCaseIds()).toEqual(["m"]);
    });

    it("Snapshot 은 repo.listSnapshotCaseIds 를 낸다", async () => {
        const src = new SnapshotWorkingSetSource({ listSnapshotCaseIds: async () => ["s1", "s2"] });
        expect(await src.listCaseIds()).toEqual(["s1", "s2"]);
    });
});

describe("FallbackWorkingSetSource", () => {
    it("처음으로 비어있지 않은 소스를 쓴다", async () => {
        const src = new FallbackWorkingSetSource([fixed([]), fixed(["x"]), fixed(["y"])]);
        expect(await src.listCaseIds()).toEqual(["x"]);
    });

    it("모두 비면 빈 배열", async () => {
        const src = new FallbackWorkingSetSource([fixed([]), fixed([])]);
        expect(await src.listCaseIds()).toEqual([]);
    });
});

describe("createWorkingSetSource", () => {
    const baseDeps = (over: Partial<WorkingSetDeps>): WorkingSetDeps => ({
        reviewCaseSource: fakeReview({ recent: [rc("recent")] }),
        repo: { listSnapshotCaseIds: async () => ["snap"] },
        sheet: null,
        ...over,
    });

    it("snapshot 모드", async () => {
        const src = createWorkingSetSource({ kind: "snapshot" }, baseDeps({}));
        expect(await src.listCaseIds()).toEqual(["snap"]);
    });

    it("review-recent 모드", async () => {
        const src = createWorkingSetSource({ kind: "review-recent" }, baseDeps({}));
        expect(await src.listCaseIds()).toEqual(["recent"]);
    });

    it("sheet 모드인데 시트가 없으면 최근으로", async () => {
        const src = createWorkingSetSource({ kind: "sheet" }, baseDeps({ sheet: null }));
        expect(await src.listCaseIds()).toEqual(["recent"]);
    });

    it("sheet 모드 — 시트가 비면 최근으로 fallback", async () => {
        const src = createWorkingSetSource(
            { kind: "sheet" },
            baseDeps({
                sheet: { config: { spreadsheetId: "s", tab: "t" }, read: async () => [["stockCode", "tradeDate"]] },
            }),
        );
        expect(await src.listCaseIds()).toEqual(["recent"]);
    });

    it("sheet 모드 — 시트에 값이 있으면 시트 우선", async () => {
        const src = createWorkingSetSource(
            { kind: "sheet" },
            baseDeps({
                sheet: {
                    config: { spreadsheetId: "s", tab: "t" },
                    read: async () => [
                        ["stockCode", "tradeDate", "tradeTime"],
                        ["055550", "2026-06-05", "09:11"],
                    ],
                },
            }),
        );
        expect(await src.listCaseIds()).toEqual(["055550-2026-06-05-0911"]);
    });
});
