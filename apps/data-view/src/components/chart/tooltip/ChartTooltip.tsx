"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import { positionTooltip } from "../shell/tooltipUtils";
import styles from "./ChartTooltip.module.css";

interface Props {
    visible: boolean;
    x: number;
    y: number;
    containerRef: RefObject<HTMLDivElement | null>;
    leftOffset?: number;
    minWidth?: number;
    maxWidth?: number;
    children: React.ReactNode;
}

function TooltipInner({ x, y, containerRef, leftOffset = 0, minWidth, maxWidth, children }: Omit<Props, "visible">) {
    const tipRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const tip = tipRef.current;
        const container = containerRef.current;
        if (!tip || !container) return;
        positionTooltip(tip, container, x + leftOffset, y);
    }, [x, y, leftOffset, containerRef]);

    return (
        <div ref={tipRef} className={styles.tooltip} style={{ minWidth, maxWidth }}>
            {children}
        </div>
    );
}

export function ChartTooltip(props: Props) {
    if (!props.visible) return null;
    const container = props.containerRef.current;
    if (!container) return null;

    return createPortal(
        <TooltipInner {...props} />,
        container,
    );
}
