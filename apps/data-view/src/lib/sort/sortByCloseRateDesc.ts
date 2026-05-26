/**
 * closeRate 내림차순 정렬 헬퍼. closeRate 가 null 인 항목은 항상 맨 끝.
 *
 * carry-forward 후에도 feature 가 채워지지 않은 멤버(그날 첫 거래 전 등)는
 * closeRate 가 null 이므로 자연스럽게 뒤로 밀린다.
 * See: docs/decisions/018-carry-forward-vi-feature.md
 */
export function sortByCloseRateDesc<T extends { closeRate: number | null }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => {
        if (a.closeRate === null && b.closeRate === null) return 0;
        if (a.closeRate === null) return 1;
        if (b.closeRate === null) return -1;
        return b.closeRate - a.closeRate;
    });
}
