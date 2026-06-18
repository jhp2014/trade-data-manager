import type { HypothesisRepository } from "./HypothesisRepository";
import type { ReviewCaseSource } from "./ReviewCaseSource";
import {
    SheetWorkingSetSource,
    type SheetConfig,
    type SheetReader,
} from "./SheetWorkingSetSource";
import type { WorkingSetSource } from "./WorkingSetSource";

/** data-core 최근 N개 review point 를 워킹셋으로. */
export class ReviewRecentWorkingSetSource implements WorkingSetSource {
    constructor(
        private readonly source: ReviewCaseSource,
        private readonly limit: number,
    ) {}
    async listCaseIds(): Promise<string[]> {
        return (await this.source.listRecent(this.limit)).map((c) => c.caseId);
    }
}

/** data-core 특정 월(YYYY-MM)의 review point 를 워킹셋으로. */
export class ReviewMonthWorkingSetSource implements WorkingSetSource {
    constructor(
        private readonly source: ReviewCaseSource,
        private readonly month: string,
    ) {}
    async listCaseIds(): Promise<string[]> {
        return (await this.source.listByMonth(this.month)).map((c) => c.caseId);
    }
}

/** hypothesis 스냅샷에 이미 들어온 case 만 워킹셋으로. */
export class SnapshotWorkingSetSource implements WorkingSetSource {
    constructor(private readonly repo: Pick<HypothesisRepository, "listSnapshotCaseIds">) {}
    async listCaseIds(): Promise<string[]> {
        return this.repo.listSnapshotCaseIds();
    }
}

/** 우선순위대로 시도해 처음으로 비어있지 않은 결과를 쓴다(예: 시트 → 최근). */
export class FallbackWorkingSetSource implements WorkingSetSource {
    constructor(private readonly sources: WorkingSetSource[]) {}
    async listCaseIds(): Promise<string[]> {
        for (const source of this.sources) {
            const ids = await source.listCaseIds();
            if (ids.length > 0) return ids;
        }
        return [];
    }
}

const DEFAULT_RECENT_LIMIT = 500;

/** view 에서 고를 수 있는 워킹셋 모드. */
export type WorkingSetMode =
    | { kind: "sheet" }
    | { kind: "review-recent"; limit?: number }
    | { kind: "review-month"; month: string }
    | { kind: "snapshot" };

export type WorkingSetDeps = {
    reviewCaseSource: ReviewCaseSource;
    repo: Pick<HypothesisRepository, "listSnapshotCaseIds">;
    /** 연결된 시트(없으면 sheet 모드는 자동으로 최근으로 fallback). */
    sheet: { config: SheetConfig; read: SheetReader } | null;
};

/**
 * 모드 → WorkingSetSource. "sheet" 모드는 시트 우선 + 최근 fallback,
 * 시트가 아예 없으면 곧장 최근으로.
 */
export function createWorkingSetSource(
    mode: WorkingSetMode,
    deps: WorkingSetDeps,
): WorkingSetSource {
    switch (mode.kind) {
        case "sheet": {
            const recent = new ReviewRecentWorkingSetSource(
                deps.reviewCaseSource,
                DEFAULT_RECENT_LIMIT,
            );
            if (!deps.sheet) return recent;
            const sheet = new SheetWorkingSetSource(deps.sheet.config, deps.sheet.read);
            return new FallbackWorkingSetSource([sheet, recent]);
        }
        case "review-recent":
            return new ReviewRecentWorkingSetSource(
                deps.reviewCaseSource,
                mode.limit ?? DEFAULT_RECENT_LIMIT,
            );
        case "review-month":
            return new ReviewMonthWorkingSetSource(deps.reviewCaseSource, mode.month);
        case "snapshot":
            return new SnapshotWorkingSetSource(deps.repo);
    }
}
