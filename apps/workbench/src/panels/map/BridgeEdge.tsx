// 겹침 화살표 전용 엣지 — 선은 RF 기본 베지어, **숫자는 HTML 층**(EdgeLabelRenderer).
//
// 왜 전용 컴포넌트인가: RF 기본 라벨은 SVG 안에 있어 다른 선이 그 위를 지나가면 숫자가 묻힌다.
// HTML 층으로 올리면 선 위에 뜨는 게 보장되고, 자리도 우리가 정한 좌표(edgeLabels.spreadLabelPositions)
// 를 그대로 쓸 수 있다 — 기본 라벨은 경로 중점에 못 박혀 있어 서로 떼어 놓을 방법이 없다.
//
// hover 는 이 컴포넌트가 제 상태로 든다(패널에 올릴 이유가 없다): 남은 겹침을 앞으로 끌어내는 일이라
// 다른 엣지가 알 필요도 없고, 상태를 위로 올리면 hover 마다 패널 전체가 다시 그려진다.
import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

export const BRIDGE_EDGE_TYPE = "bridge";

export interface BridgeEdgeData extends Record<string, unknown> {
    /** 겹침 수. 지나온 길(점선)에는 없다 — 이미 지난 자리라 물을 게 없다. */
    count?: number;
    /** 라벨 자리(평면 좌표) — 겹치지 않게 미리 벌려 둔 값. */
    labelX?: number;
    labelY?: number;
    fontSize?: number;
    curvature?: number;
    dashed?: boolean;
}

export function BridgeEdge({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data,
}: EdgeProps): JSX.Element {
    const d = (data ?? {}) as BridgeEdgeData;
    const [hover, setHover] = useState(false);
    const [path] = getBezierPath({
        sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
        ...(d.curvature !== undefined ? { curvature: d.curvature } : {}),
    });

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    ...(d.dashed ? { strokeDasharray: "5 4" } : {}),
                    ...(hover ? { stroke: "var(--text-primary)", opacity: 1 } : {}),
                }}
            />
            {d.count !== undefined && d.labelX !== undefined && d.labelY !== undefined && (
                <EdgeLabelRenderer>
                    <div
                        onMouseEnter={() => setHover(true)}
                        onMouseLeave={() => setHover(false)}
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${d.labelX}px, ${d.labelY}px)`,
                            // 겹쳐도 짚으면 앞으로 나온다 — 벌려 놓아도 셋 이상이 한 점에 몰리면 남는다.
                            zIndex: hover ? 10 : 1,
                            pointerEvents: "all",
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: "var(--bg-primary)",
                            border: hover ? "1px solid var(--text-primary)" : "1px solid transparent",
                            color: "var(--text-primary)",
                            fontSize: d.fontSize ?? 12,
                            fontVariantNumeric: "tabular-nums",
                            lineHeight: 1.2,
                            cursor: "default",
                        }}
                    >
                        {d.count}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

export const MAP_EDGE_TYPES = { [BRIDGE_EDGE_TYPE]: BridgeEdge } as const;
