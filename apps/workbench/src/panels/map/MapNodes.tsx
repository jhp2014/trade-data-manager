// 평면 위의 표식 — 잎 그룹(카드)과 컨테이너(영역) 두 얼굴, 노드 타입은 하나다.
//
// 컨테이너는 자식들의 바운딩 박스에서 유도된 크기(mapLayout)를 style 로 받아 **영역**으로 그린다.
// "안에 있음 = 하위다"가 시각과 의미에서 늘 같으려면 컨테이너를 손으로 늘리는 손잡이가 없어야 한다.
// Handle 은 숨겨 두되 없애지 않는다 — 겹침(징검다리) 엣지가 Handle 에 붙는다.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ACTIVE } from "../../styles/palette.js";
import type { Group } from "../../api/groups.js";

export interface GroupNodeData extends Record<string, unknown> {
    group: Group;
    /** 모집단 소속 수(깔때기 "보는 집합" 기준). */
    count: number;
    /** 자식이 있어 영역으로 그려지는가(mapLayout 이 정한다). */
    container: boolean;
    /** 짚은 그룹과 무관해 흐려지는가(겹침 0 = 이리로는 안 퍼진다). */
    dimmed: boolean;
    /** 짚은 그룹인가 — RF selected 와 별개(짚기는 세션 시선). */
    picked: boolean;
}

const hiddenHandle = { opacity: 0, pointerEvents: "none" } as const;

export const GroupNode = memo(function GroupNode({ data }: NodeProps & { data: GroupNodeData }) {
    const { group, count, container, dimmed, picked } = data;
    if (container) {
        return (
            <div
                style={{
                    width: "100%", height: "100%", borderRadius: 10,
                    border: `1px solid ${picked ? ACTIVE : "var(--border-strong)"}`,
                    background: picked ? "rgba(14,165,233,0.07)" : "rgba(127,127,127,0.06)",
                    opacity: dimmed ? 0.35 : 1,
                    cursor: "grab",
                }}
                title={`${group.name} · 모집단 ${count} · 하위 그룹 영역(안에 넣으면 하위가 된다)`}
            >
                <Handle type="target" position={Position.Top} style={hiddenHandle} />
                <div style={{ padding: "3px 8px", fontSize: 11, color: picked ? ACTIVE : "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {group.name} <span style={{ color: "var(--text-tertiary)" }}>{count}</span>
                </div>
                <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
            </div>
        );
    }
    return (
        <div
            style={{
                width: "100%", height: "100%", boxSizing: "border-box",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                borderRadius: 7,
                border: `1px solid ${picked ? ACTIVE : "var(--border-strong)"}`,
                background: picked ? "rgba(14,165,233,0.10)" : "var(--bg-primary)",
                opacity: dimmed ? 0.3 : 1,
                fontSize: 12, lineHeight: 1.25, cursor: "grab",
                boxShadow: picked ? `0 0 0 1px ${ACTIVE}` : "none",
            }}
            title={`${group.name} · 모집단 ${count}`}
        >
            <Handle type="target" position={Position.Top} style={hiddenHandle} />
            <div style={{ maxWidth: "100%", padding: "0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: picked ? ACTIVE : "var(--text-primary)" }}>
                {group.name}
            </div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{count}</div>
            <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
        </div>
    );
});

export const MAP_NODE_TYPES = { group: GroupNode } as const;
