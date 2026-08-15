// 평면 위의 표식 — 잎(네모 + 안쪽 텍스트)과 컨테이너(가는 실선 영역) 두 얼굴, 노드 타입은 하나다.
//
// ⚠ 타입 이름이 `"group"` 이면 안 된다. React Flow 에 **같은 이름의 내장 타입**이 있어 그 스타일
// (`.react-flow__node-group` — 테두리·배경·padding 10px·width 150px)이 우리 노드에 그대로 얹힌다.
// 실제로 상자 바깥에 정체불명의 테두리가 하나 더 그려졌었다. CSS 로 덮지 말고 이름을 안 겹치게 둔다.
//
// **크기는 수를 나르지 않는다.** 잎은 높이 고정·폭은 이름 길이(mapLayout.leafSize)이고, 겹침 수는
// 선 위 **숫자 크기**가 맡는다 — 두께와 숫자는 같은 값을 두 번 말하는 것이었고, 정확한 값은 숫자가
// 이미 준다. 그래서 선은 전부 같은 굵기, 화살촉도 작고 균일하다.
//
// Handle 은 **네 변에 하나씩**(source·target 한 쌍씩). 어느 변을 쓸지는 두 노드의 상대 위치가 정하고
// (mapLayout.sidesBetween), 실제로 쓰이는 변에만 점이 보인다 — 네 변에 늘 찍으면 그룹 열 개에 점이
// 마흔 개라 배경이 시끄러워진다.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Group } from "../../api/groups.js";
import type { Side } from "./mapLayout.js";

/** 노드 타입 키 — RF 내장(`group`·`default`·`input`·`output`)과 겹치지 않아야 한다(위 주석). */
export const GROUP_NODE_TYPE = "tdmGroup";

export interface GroupNodeData extends Record<string, unknown> {
    group: Group;
    /** 모집단 소속 수(깔때기 "보는 집합" 기준). */
    count: number;
    /** 자식이 있어 영역으로 그려지는가(mapLayout 이 정한다). */
    container: boolean;
    /** 지금 선이 붙는 변들 — 여기에만 점이 보인다. */
    anchors: readonly Side[];
    /** 짚은 그룹과 무관해 흐려지는가(겹침 0 = 이리로는 안 퍼진다 · 모집단 0). */
    dimmed: boolean;
    /** 짚은 그룹인가 — RF selected 와 별개(짚기는 세션 시선). */
    picked: boolean;
}

const SIDES: { side: Side; pos: Position }[] = [
    { side: "t", pos: Position.Top },
    { side: "r", pos: Position.Right },
    { side: "b", pos: Position.Bottom },
    { side: "l", pos: Position.Left },
];

/**
 * 네 변의 핸들 — 변마다 source·target 한 쌍이 **같은 자리에** 겹쳐 있다(어느 쪽으로 쓰일지는 그때 정해진다).
 * 점은 **target 핸들만** 그린다: 둘 다 그리면 같은 자리에 똑같은 원이 두 겹으로 쌓인다.
 * 안 쓰이는 변은 투명 — 네 변에 늘 점을 찍으면 그룹 열 개에 점이 마흔 개라 배경이 시끄러워진다.
 */
function SideHandles({ anchors, strong }: { anchors: readonly Side[]; strong: boolean }): JSX.Element {
    return (
        <>
            {SIDES.map(({ side, pos }) => {
                const dot = anchors.includes(side)
                    ? { width: 7, height: 7, borderRadius: "50%", border: "none", background: strong ? "var(--text-primary)" : "var(--text-tertiary)", pointerEvents: "none" as const }
                    : INVISIBLE;
                return (
                    <span key={side}>
                        <Handle id={`${side}-t`} type="target" position={pos} style={dot} />
                        <Handle id={`${side}-s`} type="source" position={pos} style={INVISIBLE} />
                    </span>
                );
            })}
        </>
    );
}

const INVISIBLE = { opacity: 0, pointerEvents: "none" as const };

export const GroupNode = memo(function GroupNode({ data }: NodeProps & { data: GroupNodeData }) {
    const { group, count, container, anchors, dimmed, picked } = data;

    if (container) {
        return (
            <div
                style={{
                    width: "100%", height: "100%", borderRadius: 10, boxSizing: "border-box",
                    border: picked ? "2px solid var(--text-primary)" : "1px solid var(--border-default)",
                    opacity: dimmed ? 0.35 : 1,
                    cursor: "grab",
                }}
                title={`${group.name} · 모집단 ${count} · 하위 그룹 영역(안에 넣으면 하위가 된다)`}
            >
                <SideHandles anchors={anchors} strong={picked} />
                <div style={{ display: "flex", gap: 6, padding: "3px 9px", fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</span>
                    <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{count}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                width: "100%", height: "100%", boxSizing: "border-box", borderRadius: 7,
                display: "flex", alignItems: "center", gap: 8, padding: "0 10px",
                border: picked ? "2px solid var(--text-primary)" : "1px solid var(--border-strong)",
                background: "var(--bg-primary)",
                opacity: dimmed ? 0.3 : 1,
                fontSize: 12, cursor: "grab",
            }}
            title={`${group.name} · 모집단 ${count}`}
        >
            <SideHandles anchors={anchors} strong={picked} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                {group.name}
            </span>
            <span style={{ flexShrink: 0, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
        </div>
    );
});

export const MAP_NODE_TYPES = { [GROUP_NODE_TYPE]: GroupNode } as const;
