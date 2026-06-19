"use client";

import { Handle, Position } from "reactflow";
import styles from "./HypNode.module.css";

export type HypNodeData = {
    code: string;
    text: string;
    status: string;
    tags: { name: string; color: string }[];
    selected: boolean;
    highlight: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function statusClass(status: string) {
    if (status === "active") return styles.activeStatus;
    if (status === "draft") return styles.draftStatus;
    return "";
}

/** React Flow 커스텀 노드: 코드·status·텍스트·태그색, 선택/케이스연결 강조. */
export function HypNode({ data }: { data: HypNodeData }) {
    return (
        <div className={cx(styles.node, data.selected && styles.selected, data.highlight && styles.highlight)}>
            <Handle type="target" position={Position.Top} className={styles.handle} />
            <div className={styles.top}>
                <code className={styles.code}>{data.code}</code>
                <span className={cx(styles.status, statusClass(data.status))}>{data.status}</span>
            </div>
            <div className={styles.text} title={data.text}>
                {data.text}
            </div>
            {data.tags.length > 0 && (
                <div className={styles.tags}>
                    {data.tags.map((t, i) => (
                        <span key={i} className={styles.tag} style={{ background: t.color }} title={t.name} />
                    ))}
                </div>
            )}
            <Handle type="source" position={Position.Bottom} className={styles.handle} />
        </div>
    );
}
