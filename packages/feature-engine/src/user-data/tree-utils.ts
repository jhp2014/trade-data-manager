import type { TagNode, TagScope, TagTree, TagTreeJson } from "./types";

/**
 * JSONB 트리(객체)를 메모리 친화적인 TagTree로 변환.
 *
 * - byPath: path → TagNode 빠른 조회
 * - allPaths: validator 등에서 빠른 멤버십 검사용
 */
export function buildTagTree(json: TagTreeJson | null, scope: TagScope): TagTree {
    if (json == null) {
        return { scope, roots: [], byPath: new Map(), allPaths: new Set() };
    }

    const roots = parseNodes(json, "", 0);

    const byPath = new Map<string, TagNode>();
    const allPaths = new Set<string>();
    visitAll(roots, (node) => {
        if (byPath.has(node.path)) {
            throw new Error(
                `[buildTagTree] Duplicate tag path "${node.path}" in scope "${scope}"`
            );
        }
        byPath.set(node.path, node);
        allPaths.add(node.path);
    });

    return { scope, roots, byPath, allPaths };
}

/**
 * 트리에서 leaf path만 모은 Set 반환 (validator에 자주 쓰임)
 */
export function collectLeafPaths(tree: TagTree): Set<string> {
    const result = new Set<string>();
    for (const path of tree.allPaths) {
        const node = tree.byPath.get(path)!;
        if (node.isLeaf) result.add(path);
    }
    return result;
}

/* ===========================================================
 * 태그 path 매칭 헬퍼
 * =========================================================== */

/**
 * tagPath가 prefix와 매칭되는지 검사 ('/' 경계 인식).
 *   matchesPrefix("돌파/강한 돌파/거래대금 동반", "돌파")          → true
 *   matchesPrefix("돌파/강한 돌파/거래대금 동반", "돌파/강한 돌파")  → true
 *   matchesPrefix("돌파/강한 돌파", "돌파/강한")                    → false
 */
export function matchesPrefix(tagPath: string, prefix: string): boolean {
    if (tagPath === prefix) return true;
    return tagPath.startsWith(prefix + "/");
}

export function hasAnyPrefix(tags: readonly string[], prefix: string): boolean {
    return tags.some((t) => matchesPrefix(t, prefix));
}

export function hasExact(tags: readonly string[], path: string): boolean {
    return tags.includes(path);
}

/* ===========================================================
 * 내부 파서
 * =========================================================== */

function parseNodes(raw: unknown, parentPath: string, depth: number): TagNode[] {
    if (raw == null) return [];

    // 배열: ["leaf1", "leaf2"] → 모두 leaf
    if (Array.isArray(raw)) {
        return raw.map((item) => {
            if (typeof item !== "string") {
                throw new Error(
                    `[buildTagTree] Array entries must be strings, got: ${JSON.stringify(item)}`
                );
            }
            const path = parentPath ? `${parentPath}/${item}` : item;
            return { name: item, path, depth, children: [], isLeaf: true };
        });
    }

    // 객체: { "강한 돌파": {...}, "약한 돌파": null }
    if (typeof raw === "object") {
        return Object.entries(raw as Record<string, unknown>).map(
            ([name, value]) => {
                const path = parentPath ? `${parentPath}/${name}` : name;
                const children = parseNodes(value, path, depth + 1);
                return {
                    name,
                    path,
                    depth,
                    children,
                    isLeaf: children.length === 0,
                };
            }
        );
    }

    throw new Error(
        `[buildTagTree] Unexpected node type: ${typeof raw} (${JSON.stringify(raw)})`
    );
}

function visitAll(nodes: TagNode[], fn: (node: TagNode) => void): void {
    for (const n of nodes) {
        fn(n);
        if (n.children.length > 0) visitAll(n.children, fn);
    }
}
