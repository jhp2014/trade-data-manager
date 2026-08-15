// 평면 위의 표식 — 잎(원 + 바깥 라벨)과 컨테이너(가는 실선 영역) 두 얼굴, 노드 타입은 하나다.
//
// 잎은 **원 지름만 수를 나른다.** 이름은 원 밖 고정 폭 칸에 앉아 크기 인코딩을 오염시키지 않는다
// (이름을 안에 넣으면 상자가 "수"와 "이름 길이" 둘에 끌려간다). 지름·라벨 칸 규격은 mapLayout 소유 —
// 레이아웃이 라벨을 모르면 컨테이너가 이름을 자른다.
//
// 컨테이너는 자식들의 바운딩 박스에서 유도된 크기를 style 로 받아 영역으로 그린다. **점선이 아니라
// 실선**인 이유: 점선은 "임시·미확정"으로 읽히는데 포함관계는 확정된 사실이다.
// Handle 은 숨겨 두되 없애지 않는다 — 겹침(징검다리) 엣지가 Handle 에 붙는다. 잎에서는 원 중심에
// 두어 선이 원에서 나가게 한다.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ACTIVE } from "../../styles/palette.js";
import type { Group } from "../../api/groups.js";
import { LABEL_H } from "./mapLayout.js";

export interface GroupNodeData extends Record<string, unknown> {
    group: Group;
    /** 모집단 소속 수(깔때기 "보는 집합" 기준). */
    count: number;
    /** 자식이 있어 영역으로 그려지는가(mapLayout 이 정한다). */
    container: boolean;
    /** 원 지름(잎만) — 수를 나르는 유일한 값. */
    dot: number;
    /** 0~1 크기 비율 — 글자 크기에도 실어 큰 노드가 확실히 커 보이게. */
    scale: number;
    /** 짚은 그룹과 무관해 흐려지는가(겹침 0 = 이리로는 안 퍼진다). */
    dimmed: boolean;
    /** 짚은 그룹인가 — RF selected 와 별개(짚기는 세션 시선). */
    picked: boolean;
}

const hidden = { opacity: 0, pointerEvents: "none" } as const;

export const GroupNode = memo(function GroupNode({ data }: NodeProps & { data: GroupNodeData }) {
    const { group, count, container, dot, scale, dimmed, picked } = data;

    if (container) {
        return (
            <div
                style={{
                    width: "100%", height: "100%", borderRadius: 10,
                    border: `1px solid ${picked ? ACTIVE : "var(--border-default)"}`,
                    background: picked ? "rgba(14,165,233,0.05)" : "transparent",
                    opacity: dimmed ? 0.35 : 1,
                    cursor: "grab",
                }}
                title={`${group.name} · 모집단 ${count} · 하위 그룹 영역(안에 넣으면 하위가 된다)`}
            >
                <Handle type="target" position={Position.Top} style={hidden} />
                <div style={{ display: "flex", gap: 6, padding: "3px 9px", fontSize: 11, color: picked ? ACTIVE : "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</span>
                    <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{count}</span>
                </div>
                <Handle type="source" position={Position.Bottom} style={hidden} />
            </div>
        );
    }

    const font = 12 + Math.round(scale * 4); // 12~16 — 지름과 함께 커진다
    return (
        <div
            style={{ width: "100%", height: "100%", opacity: dimmed ? 0.3 : 1, cursor: "grab" }}
            title={`${group.name} · 모집단 ${count}`}
        >
            {/* 원 — 수를 나르는 자리. Handle 을 중심에 둬 겹침 선이 원에서 나간다. */}
            <div style={{ position: "relative", width: dot, height: dot, margin: "0 auto" }}>
                <Handle type="target" position={Position.Top} style={{ ...hidden, top: "50%" }} />
                <div
                    style={{
                        width: "100%", height: "100%", borderRadius: "50%", boxSizing: "border-box",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1px solid ${picked ? ACTIVE : "var(--border-strong)"}`,
                        background: picked ? "rgba(14,165,233,0.10)" : "var(--bg-primary)",
                        boxShadow: picked ? `0 0 0 1px ${ACTIVE}` : "none",
                        fontSize: font, fontVariantNumeric: "tabular-nums",
                        color: count === 0 ? "var(--text-tertiary)" : picked ? ACTIVE : "var(--text-primary)",
                    }}
                >
                    {count}
                </div>
                <Handle type="source" position={Position.Bottom} style={{ ...hidden, top: "50%" }} />
            </div>
            {/* 라벨 — 원 밖. 칸을 넘으면 말줄임(전체 이름은 툴팁과 작업줄에). */}
            <div
                style={{
                    height: LABEL_H, lineHeight: `${LABEL_H}px`, textAlign: "center", fontSize: 11,
                    color: picked ? ACTIVE : "var(--text-secondary)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
            >
                {group.name}
            </div>
        </div>
    );
});

export const MAP_NODE_TYPES = { group: GroupNode } as const;
