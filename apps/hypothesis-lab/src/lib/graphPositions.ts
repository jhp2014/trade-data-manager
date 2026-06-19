/**
 * 그래프 노드 위치를 localStorage 에 저장/복원한다(클라이언트 전용).
 * 저장값이 있으면 dagre 기본 배치 대신 사용자가 드래그한 위치를 복원한다.
 */
const KEY = "hypothesis-lab-graph-positions";

export type NodePositions = Record<string, { x: number; y: number }>;

export function loadGraphPositions(): NodePositions {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as NodePositions) : {};
    } catch {
        return {};
    }
}

export function saveGraphPositions(pos: NodePositions): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(pos));
    } catch {
        // 저장 실패(쿼터 등)는 무시 — 위치 영속화는 보조 기능.
    }
}

export function clearGraphPositions(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // 무시.
    }
}
