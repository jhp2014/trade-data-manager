import type { DailyTag, Opportunity, TagTree } from "./types";

export interface ValidationError {
    type: "unknown_daily_tag" | "unknown_opinion_tag" | "non_leaf_tag";
    location: string;
    message: string;
}

export interface ValidationInput {
    dailyTree: TagTree;
    opinionTree: TagTree;
    dailyTagList: DailyTag[];
    opportunityList: Opportunity[];
}

/**
 * 멤버십에 쓰인 태그가 트리에 정의되어 있는지,
 * 그리고 모두 leaf 태그인지 검증.
 *
 * 우리는 "leaf만 저장" 원칙이므로 비-leaf 사용은 에러로 본다.
 */
export function validate(input: ValidationInput): ValidationError[] {
    const errors: ValidationError[] = [];
    const { dailyTree, opinionTree, dailyTagList, opportunityList } = input;

    // 일봉 태그 검증
    for (const row of dailyTagList) {
        for (const tag of row.tags) {
            const node = dailyTree.byPath.get(tag);
            const loc = `daily_tags(id=${row.id}, ${row.stockCode}, ${row.tradeDate})`;
            if (!node) {
                errors.push({
                    type: "unknown_daily_tag",
                    location: loc,
                    message: `Unknown daily tag: "${tag}"`,
                });
            } else if (!node.isLeaf) {
                errors.push({
                    type: "non_leaf_tag",
                    location: loc,
                    message: `Tag "${tag}" is not a leaf. Only leaf tags should be stored.`,
                });
            }
        }
    }

    // 의견 태그 검증
    for (const opp of opportunityList) {
        for (const tag of opp.tags) {
            const node = opinionTree.byPath.get(tag);
            const loc = `trading_opportunities(id=${opp.id})`;
            if (!node) {
                errors.push({
                    type: "unknown_opinion_tag",
                    location: loc,
                    message: `Unknown opinion tag: "${tag}"`,
                });
            } else if (!node.isLeaf) {
                errors.push({
                    type: "non_leaf_tag",
                    location: loc,
                    message: `Tag "${tag}" is not a leaf.`,
                });
            }
        }
    }

    return errors;
}

export function formatErrors(errors: ValidationError[]): string {
    if (errors.length === 0) return "";
    const lines = errors.map(
        (e) => `  [${e.type}] ${e.location}\n    ${e.message}`
    );
    return `Validation failed (${errors.length} errors):\n${lines.join("\n")}`;
}
