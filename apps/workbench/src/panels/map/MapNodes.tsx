// 평면 위의 표식 — **그룹 노드** 하나뿐이다(옛 낱개 자리·뭉친 표식은 점이 그룹으로 바뀌며 사라졌다).
//
// 노드가 React 컴포넌트라는 게 React Flow 를 고른 이유 중 하나였다: 지금은 이름·멤버 수지만
// 나중에 그 그룹의 대표 골격을 얹을 자리가 여기다.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ACTIVE } from "../../styles/palette.js";
import type { Group } from "../../api/groups.js";

export interface GroupNodeData extends Record<string, unknown> {
    group: Group;
    count: number;
    /** 중첩 깊이 — 안쪽 그룹일수록 작고 옅게(계층이 크기로 읽히게). */
    depth: number;
    hasChildren: boolean;
}

/**
 * 그룹 노드. **Handle 은 숨겨 두되 없애지 않는다** — 겹침(징검다리)을 잇는 엣지가 Handle 에 붙는다.
 * 크기는 멤버 수의 제곱근에 실린다(넓이가 개수에 비례해야 눈이 양으로 읽는다).
 */
export const GroupNode = memo(function GroupNode({ data, selected }: NodeProps & { data: GroupNodeData }) {
    const { group, count, depth, hasChildren } = data;
    const pad = Math.max(3, 7 - depth);
    const font = Math.max(10, 13 - depth);
    return (
        <div
            style={{
                padding: `${pad}px ${pad + 3}px`,
                borderRadius: 6,
                border: `1px solid ${selected ? ACTIVE : "var(--border-strong)"}`,
                background: selected ? "rgba(14,165,233,0.10)" : "var(--bg-primary)",
                opacity: depth === 0 ? 1 : 0.92,
                fontSize: font,
                lineHeight: 1.25,
                textAlign: "center",
                whiteSpace: "nowrap",
                cursor: "grab",
                boxShadow: selected ? `0 0 0 1px ${ACTIVE}` : "none",
            }}
            title={`${group.name} · 멤버 ${count}${hasChildren ? " · 하위 그룹 있음" : ""}`}
        >
            <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
            <div style={{ color: selected ? ACTIVE : "var(--text-primary)" }}>
                {hasChildren && <span style={{ color: "var(--text-tertiary)", marginRight: 3 }}>▾</span>}
                {group.name}
            </div>
            <div style={{ color: "var(--text-tertiary)", fontSize: Math.max(9, font - 2) }}>{count}</div>
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
        </div>
    );
});

export const MAP_NODE_TYPES = { group: GroupNode } as const;
