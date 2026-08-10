// 맵 위의 두 가지 표식 — **낱개 자리(라벨)**와 **뭉친 표식(개수)**.
//
// 노드가 React 컴포넌트라는 게 React Flow 를 고른 주된 이유다: 지금은 이름·날짜지만 이 맵의 종착점은
// **차트 썸네일**이다(유사도 맵인데 형태가 안 보이면 배치할 때마다 기억에 기대게 된다). 그때 여기만 바뀐다.
// 썸네일이 비싼 것도 LOD 가 받아 준다 — 확대했을 때만 그리고, 그때는 개수가 적다.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ACTIVE } from "../../styles/palette.js";
import type { MapBin } from "./mapView.js";
import type { MapPlacement } from "../../api/map.js";

export interface ItemNodeData extends Record<string, unknown> {
    placement: MapPlacement;
    name: string;
}
export interface BinNodeData extends Record<string, unknown> {
    bin: MapBin;
}

/**
 * 낱개 자리. **연결점(Handle)은 숨겨 두되 없애지는 않는다** — 징검다리(한 항목의 여러 자리)를 점선으로
 * 잇는 게 다음 슬라이스인데, 엣지는 Handle 이 있어야 붙는다.
 */
export const ItemNode = memo(function ItemNode({ data, selected }: NodeProps & { data: ItemNodeData }) {
    const { placement, name } = data;
    return (
        <div
            style={{
                padding: "3px 7px",
                borderRadius: 4,
                border: `1px solid ${selected ? ACTIVE : "var(--border-default)"}`,
                background: selected ? "rgba(14,165,233,0.10)" : "var(--bg-primary)",
                fontSize: 11,
                lineHeight: 1.25,
                textAlign: "center",
                whiteSpace: "nowrap",
                cursor: "grab",
                boxShadow: selected ? `0 0 0 1px ${ACTIVE}` : "none",
            }}
            title={`${placement.item.stockCode} · ${placement.item.date}`}
        >
            <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
            <div style={{ color: selected ? ACTIVE : "var(--text-primary)" }}>{name}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{placement.item.date.slice(2)}</div>
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
        </div>
    );
});

/**
 * 뭉친 표식. **줌이 만든 우연이지 형님이 주장한 무리가 아니다** — 그래서 끌 수 없다(노드 정의에서 draggable=false).
 * 우연히 같은 칸에 든 수백 개가 손짓 한 번에 딸려가면 되돌릴 방법이 마땅찮다.
 * 클릭 = 목록, 더블클릭 = 그 칸으로 확대(골격 패널의 "뭉친 라벨 = 개수 뱃지 → 클릭 목록" 문법과 같다).
 */
export const BinNode = memo(function BinNode({ data, selected }: NodeProps & { data: BinNodeData }) {
    const n = data.bin.members.length;
    // 개수를 지름에 싣되 제곱근으로 — 넓이가 개수에 비례해야 눈이 양으로 읽는다.
    const size = Math.min(46, 20 + Math.sqrt(n) * 3.2);
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                border: `1px solid ${selected ? ACTIVE : "var(--border-strong)"}`,
                background: selected ? "rgba(14,165,233,0.16)" : "rgba(148,163,184,0.22)",
                fontSize: 10,
                color: "var(--text-secondary)",
                cursor: "zoom-in",
            }}
            title={`${n}건 — 클릭하면 목록, 더블클릭하면 확대`}
        >
            {n}
        </div>
    );
});

export const MAP_NODE_TYPES = { item: ItemNode, bin: BinNode } as const;
