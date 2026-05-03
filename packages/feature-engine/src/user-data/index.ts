import type { Database } from "../index";
import { loadUserDataFromDb } from "./loader";
import { validate, formatErrors } from "./validator";
import { UserData } from "./user-data";

export { UserData } from "./user-data";
export type { OpportunityFilter, TagFilter } from "./user-data";
export type {
    Opportunity,
    DailyTag,
    TagNode,
    TagTree,
    TagTreeJson,
    TagScope,
} from "./types";
export {
    makeStockDateKey,
    makeThemeDateKey,
    makeOpportunityKey,
} from "./types";
export {
    matchesPrefix,
    hasAnyPrefix,
    hasExact,
    buildTagTree,
    collectLeafPaths,
} from "./tree-utils";
export type { ValidationError } from "./validator";
export { validate, formatErrors } from "./validator";
export {
    loadUserDataFromDb,
    loadTagTreeFromDb,
    type UserDataSnapshot,
} from "./loader";

/* ===========================================================
 * 통합 진입점
 * =========================================================== */

export interface LoadOptions {
    /** validation 실패 시 throw 할지 (기본 true) */
    strictValidation?: boolean;
}

export async function loadUserData(
    db: Database,
    opts: LoadOptions = {}
): Promise<UserData> {
    const strict = opts.strictValidation ?? true;

    const snapshot = await loadUserDataFromDb(db);

    const errors = validate({
        dailyTree: snapshot.trees.daily,
        opinionTree: snapshot.trees.opinion,
        dailyTagList: snapshot.dailyTagList,
        opportunityList: snapshot.opportunityList,
    });

    if (errors.length > 0) {
        const formatted = formatErrors(errors);
        if (strict) throw new Error(formatted);
        else console.warn(formatted);
    }

    return new UserData(
        snapshot.trees,
        snapshot.dailyTagList,
        snapshot.opportunityList
    );
}
