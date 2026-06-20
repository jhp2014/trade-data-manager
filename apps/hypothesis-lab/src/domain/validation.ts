import { DEFAULT_RELATION_TYPES, directionalValues } from "./relationType";
import { formatHypothesisCode } from "./hypothesisCode";
import type {
    HypothesisRelation,
    HypothesisSnapshot,
    ValidationWarning,
} from "./types";

/** 관계 종류 정의는 클라(relationTypes 스토어) 소유 — 서버 기본값은 시드의 방향성 집합. */
const DEFAULT_DIRECTIONAL = directionalValues(DEFAULT_RELATION_TYPES);

/**
 * 스냅샷의 relation 그래프를 검사해 경고를 만든다(저장 차단 아님).
 * 순수 함수 — 방향성(순환검사 대상) 종류 집합은 호출측이 정한다(미지정 시 기본 시드).
 * 종류 정의가 클라 소유이므로 클라에서 스토어 집합으로 재계산할 수 있다.
 */
export function computeWarnings(
    snapshot: Pick<HypothesisSnapshot, "hypothesisRelations">,
    directionalTypes: Set<string> = DEFAULT_DIRECTIONAL,
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
    }

    for (const type of directionalTypes) {
        const edges = rels.filter(
            (r) => r.relationType === type && r.fromHypothesisId !== r.toHypothesisId,
        );
        for (const cycle of findCycles(edges)) {
            warnings.push({
                code: "cycle",
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
