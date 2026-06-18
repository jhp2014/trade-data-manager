"use client";

import { Handle, Position } from "reactflow";

export type HypNodeData = {
    code: string;
    text: string;
    status: string;
    tags: { name: string; color: string }[];
    selected: boolean;
    highlight: boolean;
};

/** React Flow 커스텀 노드: 코드·status·텍스트·태그색, 선택/케이스연결 강조. */
export function HypNode({ data }: { data: HypNodeData }) {
    return (
        <div
            className={`gnode${data.selected ? " is-selected" : ""}${data.highlight ? " is-highlight" : ""}`}
        >
            <Handle type="target" position={Position.Top} className="gnode-handle" />
            <div className="gnode-top">
                <code className="hcode">{data.code}</code>
                <span className={`status s-${data.status}`}>{data.status}</span>
            </div>
            <div className="gnode-text" title={data.text}>
                {data.text}
            </div>
            {data.tags.length > 0 && (
                <div className="gnode-tags">
                    {data.tags.map((t, i) => (
                        <span key={i} className="gtag" style={{ background: t.color }} title={t.name} />
                    ))}
                </div>
            )}
            <Handle type="source" position={Position.Bottom} className="gnode-handle" />
        </div>
    );
}
