import { describe, it, expect } from "vitest";
import { IssueEditService } from "../issueEditService.js";
import type { DailyIssue } from "#domain";

function fakeRepo() {
    const added: DailyIssue[][] = [];
    const removed: Array<[string, string, string]> = [];
    return {
        added,
        removed,
        repo: {
            add: async (issues: DailyIssue[]) => {
                added.push(issues);
            },
            remove: async (date: string, stockCode: string, issue: string) => {
                removed.push([date, stockCode, issue]);
            },
            getByDate: async () => [],
        },
    };
}

describe("IssueEditService", () => {
    it("addIssues → repo.add 로 forward", async () => {
        const f = fakeRepo();
        const svc = new IssueEditService({ dailyIssue: f.repo });
        const rows: DailyIssue[] = [{ date: "2026-06-26", stockCode: "005930", issue: "HBM", author: "me" }];
        await svc.addIssues(rows);
        expect(f.added).toEqual([rows]);
    });

    it("removeIssue → repo.remove 로 forward", async () => {
        const f = fakeRepo();
        const svc = new IssueEditService({ dailyIssue: f.repo });
        await svc.removeIssue("2026-06-26", "005930", "HBM");
        expect(f.removed).toEqual([["2026-06-26", "005930", "HBM"]]);
    });
});
