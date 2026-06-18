import { formatHypothesisCode } from "./hypothesisCode";
import type {
    HypothesisRelation,
    HypothesisSnapshot,
    ValidationWarning,
} from "./types";

/** App 이 의미를 아는 관계 타입. 이 외 값은 unknown_relation_type 경고. */
export const KNOWN_RELATION_TYPES = [
    "better_than",
    "parent_of",
    "similar_to",
    "conflicts_with",
] as const;

/** 순환이 의미상 모순인(=비순환 기대) 방향성 타입. */
const ACYCLIC_TYPES = ["better_than", "parent_of"] as const;

const KNOWN = new Set<string>(KNOWN_RELATION_TYPES);

/**
 * 스냅샷의 relation 그래프를 검사해 경고를 만든다(저장 차단 아님).
 * 순수 함수 — Store.loadSnapshot 이 조립한 데이터에 적용한다.
 */
export function computeWarnings(
    snapshot: Pick<HypothesisSnapshot, "hypothesisRelations">,
): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const rels = snapshot.hypothesisRelations;

    for (const r of rels) {
        if (r.fromHypothesisId === r.toHypothesisId) {
            warnings.push({
                code: "self_relation",
                message: `자기 자신과의 관계: ${codeOf(r.fromHypothesisId)} (${r.relationType})`,
                refs: [r.fromHypothesisId],
            });
        }
        if (!KNOWN.has(r.relationType)) {
            warnings.push({
                code: "unknown_relation_type",
                message: `알 수 없는 relationType: "${r.relationType}"`,
                refs: [r.id],
            });
        }
    }

    for (const type of ACYCLIC_TYPES) {
        const edges = rels.filter(
            (r) => r.relationType === type && r.fromHypothesisId !== r.toHypothesisId,
        );
        for (const cycle of findCycles(edges)) {
            warnings.push({
                code: type === "better_than" ? "cycle_better_than" : "cycle_parent_of",
                message: `${type} 순환: ${cycle.map(codeOf).join(" → ")} → ${codeOf(cycle[0])}`,
                refs: cycle,
            });
        }
    }

    return warnings;
}

function codeOf(hypothesisId: string): string {
    return formatHypothesisCode(hypothesisId);
}

/**
 * 방향 그래프의 순환들을 찾는다(중복 제거). 각 결과는 순환을 이루는 노드 id 배열.
 * 색칠 DFS — GRAY 노드로의 back-edge 가 순환.
 */
function findCycles(edges: Pick<HypothesisRelation, "fromHypothesisId" | "toHypothesisId">[]): string[][] {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
        const list = adj.get(e.fromHypothesisId);
        if (list) list.push(e.toHypothesisId);
        else adj.set(e.fromHypothesisId, [e.toHypothesisId]);
    }

    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    const stack: string[] = [];
    const cycles: string[][] = [];
    const seen = new Set<string>();

    const visit = (u: string): void => {
        color.set(u, GRAY);
        stack.push(u);
        for (const v of adj.get(u) ?? []) {
            const c = color.get(v) ?? WHITE;
            if (c === GRAY) {
                const cycle = stack.slice(stack.indexOf(v));
                const sig = [...cycle].sort().join(",");
                if (!seen.has(sig)) {
                    seen.add(sig);
                    cycles.push(cycle);
                }
            } else if (c === WHITE) {
                visit(v);
            }
        }
        stack.pop();
        color.set(u, BLACK);
    };

    for (const node of adj.keys()) {
        if ((color.get(node) ?? WHITE) === WHITE) visit(node);
    }
    return cycles;
}
