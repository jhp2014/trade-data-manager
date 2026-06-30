// IssueEditService — 당일 이슈 확정 편집(쓰기). 행 단위 add/remove 를 영속 어댑터로 forward 하는 얇은 use case.
// 로직은 repo 가 가짐(add=멱등 onConflictDoNothing). 여긴 inbound 계약을 outbound 에 잇는 경계.
import type { DailyIssue } from "../../../domain/index.js";
import type { DailyIssueRepository } from "../../port/outbound/index.js";
import type { IssueEditor } from "../../port/inbound/index.js";

export interface IssueEditDeps {
    dailyIssue: DailyIssueRepository;
}

export class IssueEditService implements IssueEditor {
    constructor(private readonly deps: IssueEditDeps) {}

    addIssues(issues: DailyIssue[]): Promise<void> {
        return this.deps.dailyIssue.add(issues);
    }

    removeIssue(date: string, stockCode: string, issue: string): Promise<void> {
        return this.deps.dailyIssue.remove(date, stockCode, issue);
    }
}
