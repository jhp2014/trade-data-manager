"use client";

import { useEffect, useState } from "react";
import {
    DIRECTION_OPTIONS,
    EDGE_TYPE_OPTIONS,
    LINE_STYLE_OPTIONS,
    RELATION_COLORS,
    RELATION_COLOR_HEX,
    dashArray,
    type RelationArrowHead,
    type RelationColor,
    type RelationDirection,
    type RelationEdgeType,
    type RelationLineStyle,
    type RelationTypeDef,
} from "@/domain/relationType";
import { useRelationTypes } from "@/stores/relationTypes";
import styles from "./RelationTypeEditorModal.module.css";

const LINE_LABEL: Record<RelationLineStyle, string> = {
    solid: "실선",
    dashed: "파선",
    dotted: "점선",
};
const EDGE_LABEL: Record<RelationEdgeType, string> = {
    bezier: "곡선",
    straight: "직선",
    step: "계단",
    smoothstep: "둥근계단",
};
const DIR_LABEL: Record<RelationDirection, string> = {
    none: "무방향",
    forward: "정방향 →",
    backward: "역방향 ←",
};
const HEAD_LABEL: Record<RelationArrowHead, string> = {
    closed: "채움",
    open: "열림",
};

function Segmented<T extends string>({
    options,
    value,
    labels,
    disabled,
    onChange,
}: {
    options: readonly T[];
    value: T;
    labels: Record<T, string>;
    disabled?: boolean;
    onChange: (v: T) => void;
}) {
    return (
        <div className={styles.segmented} data-disabled={disabled ? "1" : undefined}>
            {options.map((o) => (
                <button
                    key={o}
                    type="button"
                    className={`${styles.seg} ${o === value ? styles.segOn : ""}`}
                    disabled={disabled}
                    onClick={() => onChange(o)}
                >
                    {labels[o]}
                </button>
            ))}
        </div>
    );
}

/** edgeType 별 대표 경로(미리보기용). 좌(14,34)→우(186,12). */
function previewPath(edgeType: RelationEdgeType): string {
    const x1 = 14;
    const y1 = 34;
    const x2 = 186;
    const y2 = 12;
    const mx = (x1 + x2) / 2;
    switch (edgeType) {
        case "straight":
            return `M${x1},${y1} L${x2},${y2}`;
        case "step":
            return `M${x1},${y1} H${mx} V${y2} H${x2}`;
        case "smoothstep":
            return `M${x1},${y1} H${mx - 8} Q${mx},${y1} ${mx},${y1 - 8} V${y2 + 8} Q${mx},${y2} ${mx + 8},${y2} H${x2}`;
        default:
            // bezier
            return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    }
}

/** 단일 관계 종류 편집/추가 모달(설정 모달 위에 겹쳐 띄움). */
export function RelationTypeEditorModal({
    target,
    onClose,
}: {
    /** 편집할 정의, 또는 "new" 면 새로 추가. null 이면 닫힘. */
    target: RelationTypeDef | "new" | null;
    onClose: () => void;
}) {
    const addOption = useRelationTypes((s) => s.addOption);
    const updateOption = useRelationTypes((s) => s.updateOption);

    const [label, setLabel] = useState("");
    const [keyValue, setKeyValue] = useState("");
    const [color, setColor] = useState<RelationColor>("blue");
    const [lineStyle, setLineStyle] = useState<RelationLineStyle>("solid");
    const [edgeType, setEdgeType] = useState<RelationEdgeType>("bezier");
    const [direction, setDirection] = useState<RelationDirection>("forward");
    const [arrowHead, setArrowHead] = useState<RelationArrowHead>("closed");

    const isNew = target === "new";

    useEffect(() => {
        if (!target) return;
        if (target === "new") {
            setLabel("");
            setKeyValue("");
            setColor("blue");
            setLineStyle("solid");
            setEdgeType("bezier");
            setDirection("forward");
            setArrowHead("closed");
            return;
        }
        setLabel(target.label);
        setKeyValue(target.value);
        setColor(target.color);
        setLineStyle(target.lineStyle);
        setEdgeType(target.edgeType);
        setDirection(target.direction);
        setArrowHead(target.arrowHead);
    }, [target]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        if (target) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [target, onClose]);

    if (!target) return null;

    const stroke = RELATION_COLOR_HEX[color];
    const dash = dashArray(lineStyle);
    const hasArrow = direction !== "none";

    function save() {
        const trimmed = label.trim();
        if (trimmed === "") return;
        const patch = { label: trimmed, color, lineStyle, edgeType, direction, arrowHead };
        if (isNew) addOption({ ...patch, value: keyValue });
        else updateOption((target as RelationTypeDef).value, patch);
        onClose();
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.head}>
                    <h2>{isNew ? "관계 종류 추가" : "관계 종류 편집"}</h2>
                    <button className={styles.x} onClick={onClose} aria-label="닫기">
                        ×
                    </button>
                </header>

                <div className={styles.preview}>
                    <svg width="200" height="46" viewBox="0 0 200 46">
                        <defs>
                            <marker
                                id="rt-arrow-closed"
                                markerWidth="9"
                                markerHeight="9"
                                refX="7"
                                refY="4"
                                orient="auto"
                                markerUnits="userSpaceOnUse"
                            >
                                <path d="M0,0 L8,4 L0,8 Z" fill={stroke} />
                            </marker>
                            <marker
                                id="rt-arrow-open"
                                markerWidth="11"
                                markerHeight="11"
                                refX="7"
                                refY="4.5"
                                orient="auto"
                                markerUnits="userSpaceOnUse"
                            >
                                <path d="M0,0 L8,4.5 L0,9" fill="none" stroke={stroke} strokeWidth="1.4" />
                            </marker>
                        </defs>
                        <path
                            d={previewPath(edgeType)}
                            fill="none"
                            stroke={stroke}
                            strokeWidth="2"
                            strokeDasharray={dash}
                            strokeLinecap={lineStyle === "dotted" ? "round" : undefined}
                            markerEnd={
                                hasArrow && direction === "forward"
                                    ? `url(#rt-arrow-${arrowHead})`
                                    : undefined
                            }
                            markerStart={
                                hasArrow && direction === "backward"
                                    ? `url(#rt-arrow-${arrowHead})`
                                    : undefined
                            }
                        />
                    </svg>
                </div>

                <div className={styles.body}>
                    <label className={styles.field}>
                        <span>이름</span>
                        <input
                            className={styles.input}
                            value={label}
                            maxLength={16}
                            placeholder="관계 이름(표시용)"
                            onChange={(e) => setLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") save();
                            }}
                            autoFocus
                        />
                    </label>

                    <label className={styles.field}>
                        <span>키(영문, DB 저장)</span>
                        <input
                            className={styles.input}
                            value={keyValue}
                            maxLength={40}
                            placeholder="better_than (비우면 이름에서 자동)"
                            disabled={!isNew}
                            onChange={(e) => setKeyValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") save();
                            }}
                        />
                        <span className={styles.hint}>
                            {isNew
                                ? "DB에 저장되는 식별자. 추가 후에는 변경할 수 없습니다."
                                : "키는 변경할 수 없습니다(이름은 자유롭게 수정 가능)."}
                        </span>
                    </label>

                    <div className={styles.field}>
                        <span>색상</span>
                        <div className={styles.colors}>
                            {RELATION_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    className={`${styles.color} ${c === color ? styles.colorOn : ""}`}
                                    style={{ background: RELATION_COLOR_HEX[c] }}
                                    onClick={() => setColor(c)}
                                    aria-label={`색 ${c}`}
                                />
                            ))}
                        </div>
                    </div>

                    <div className={styles.field}>
                        <span>선 스타일</span>
                        <Segmented
                            options={LINE_STYLE_OPTIONS}
                            value={lineStyle}
                            labels={LINE_LABEL}
                            onChange={setLineStyle}
                        />
                    </div>

                    <div className={styles.field}>
                        <span>선 타입</span>
                        <Segmented
                            options={EDGE_TYPE_OPTIONS}
                            value={edgeType}
                            labels={EDGE_LABEL}
                            onChange={setEdgeType}
                        />
                    </div>

                    <div className={styles.field}>
                        <span>방향</span>
                        <Segmented
                            options={DIRECTION_OPTIONS}
                            value={direction}
                            labels={DIR_LABEL}
                            onChange={setDirection}
                        />
                    </div>

                    <div className={styles.field}>
                        <span>화살촉</span>
                        <Segmented
                            options={["closed", "open"] as const}
                            value={arrowHead}
                            labels={HEAD_LABEL}
                            disabled={!hasArrow}
                            onChange={setArrowHead}
                        />
                    </div>
                </div>

                <footer className={styles.foot}>
                    <button className={styles.cancel} onClick={onClose}>
                        취소
                    </button>
                    <button className={styles.save} onClick={save} disabled={label.trim() === ""}>
                        저장
                    </button>
                </footer>
            </div>
        </div>
    );
}
