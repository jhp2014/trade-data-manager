"use client";

import { Handle, Position } from "reactflow";
import styles from "./HypNode.module.css";

export type HypNodeData = {
    code: string;
    text: string;
    tags: string[];
    linkedCaseCount: number;
    /** 현재 선택된 Case 와 연결됨(체크박스 표시 전용). */
    linkedToCase: boolean;
    selected: boolean;
    highlight: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/** React Flow 커스텀 노드: 코드·연결수·태그·텍스트. 체크박스는 표시 전용(토글은 목록에서). */
export function HypNode({ data }: { data: HypNodeData }) {
    return (
        <div className={cx(styles.node, data.selected && styles.selected, data.highlight && styles.highlight)}>
            <Handle type="target" position={Position.Top} className={styles.handle} />
            <div className={styles.top}>
                <input
                    type="checkbox"
                    className={styles.check}
                    checked={data.linkedToCase}
                    readOnly
                    tabIndex={-1}
                    aria-label="현재 케이스 연결 여부"
                />
                <code className={styles.code}>{data.code}</code>
                {data.linkedCaseCount > 0 && (
                    <span className={styles.count}>연결 {data.linkedCaseCount}</span>
                )}
            </div>
            <div className={styles.text}>{data.text}</div>
            {data.tags.length > 0 && (
                <div className={styles.tags}>
                    {data.tags.map((t, i) => (
                        <span key={i} className={styles.tag}>
                            #{t}
                        </span>
                    ))}
                </div>
            )}
            <Handle type="source" position={Position.Bottom} className={styles.handle} />
        </div>
    );
}
