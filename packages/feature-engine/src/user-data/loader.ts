import { eq } from "drizzle-orm";
import type { Database } from "../index";
import { tagTrees, dailyTags, tradingOpportunities } from "./schema";
import type {
    DailyTag,
    Opportunity,
    TagScope,
    TagTree,
    TagTreeJson,
} from "./types";
import { buildTagTree } from "./tree-utils";

export interface UserDataSnapshot {
    trees: { daily: TagTree; opinion: TagTree };
    dailyTagList: DailyTag[];
    opportunityList: Opportunity[];
}

/**
 * DB에서 모든 사용자 데이터를 한 번에 로드.
 * - 3개 쿼리를 병렬 실행
 * - 메모리에 적재할 수 있도록 일반 객체로 정규화
 */
export async function loadUserDataFromDb(db: Database): Promise<UserDataSnapshot> {
    const [treeRows, dailyRows, oppRows] = await Promise.all([
        db.select().from(tagTrees),
        db.select().from(dailyTags),
        db.select().from(tradingOpportunities),
    ]);

    const trees = buildTreesByScope(treeRows);

    const dailyTagList: DailyTag[] = dailyRows.map((r) => ({
        id: r.id,
        stockCode: r.stockCode,
        tradeDate: r.tradeDate,
        tags: r.tags ?? [],
        memo: r.memo ?? "",
    }));

    const opportunityList: Opportunity[] = oppRows.map((r) => ({
        id: r.id,
        tradeDate: r.tradeDate,
        tradeTime: r.tradeTime,
        stockCode: r.stockCode,
        themeId: r.themeId,
        tags: r.tags ?? [],
        memo: r.memo ?? "",
    }));

    return { trees, dailyTagList, opportunityList };
}

/* ===========================================================
 * 부분 갱신용 (변경 후 메모리 동기화 시 사용 가능)
 * =========================================================== */

export async function loadTagTreeFromDb(
    db: Database,
    scope: TagScope
): Promise<TagTree> {
    const rows = await db
        .select()
        .from(tagTrees)
        .where(eq(tagTrees.scope, scope));
    const json = (rows[0]?.tree ?? null) as TagTreeJson | null;
    return buildTagTree(json, scope);
}

/* ===========================================================
 * 내부 헬퍼
 * =========================================================== */

function buildTreesByScope(
    rows: Array<{ scope: string; tree: TagTreeJson }>
): { daily: TagTree; opinion: TagTree } {
    const dailyJson =
        rows.find((r) => r.scope === "daily")?.tree ?? null;
    const opinionJson =
        rows.find((r) => r.scope === "opinion")?.tree ?? null;
    return {
        daily: buildTagTree(dailyJson, "daily"),
        opinion: buildTagTree(opinionJson, "opinion"),
    };
}
