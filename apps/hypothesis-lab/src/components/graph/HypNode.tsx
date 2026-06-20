"use client";

import { Handle, Position } from "reactflow";
import styles from "./HypNode.module.css";

export type HypNodeData = {
    code: string;
    text: string;
    tags: string[];
    linkedCaseCount: number;
    /** 현재 선택된 Case 와 연결됨. */
    linkedToCase: boolean;
    /** 토글 가능 여부(케이스가 선택돼 있어야 함). */
    caseSelected: boolean;
    /** 체크박스 토글 → 현재 케이스 연결/해제. */
    onToggleLink?: () => void;
    selected: boolean;
    highlight: boolean;
    /** 현재 불리언 필터 식에 등장하는 가설. */
    inFilter: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

/** React Flow 커스텀 노드: 코드·연결수·태그·텍스트. 체크박스는 표시 전용(토글은 목록에서). */
export function HypNode({ data }: { data: HypNodeData }) {
    return (
        <div
            className={cx(
                styles.node,
                data.inFilter && styles.inFilter,
                data.selected && styles.selected,
                data.highlight && styles.highlight,
            )}
        >
            <Handle type="target" position={Position.Top} className={styles.handle} />
            <div className={styles.top}>
                <input
                    type="checkbox"
                    className={cx(styles.check, "nodrag")}
                    checked={data.linkedToCase}
                    disabled={!data.caseSelected}
                    onChange={() => data.onToggleLink?.()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    title={data.caseSelected ? "현재 케이스에 연결/해제" : "케이스를 먼저 선택"}
                    aria-label="현재 케이스 연결 여부"
                />
                <code className={styles.code}>{data.code}</code>
                {data.linkedCaseCount > 0 && (
                    <span className={styles.count}>Case {data.linkedCaseCount}</span>
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
