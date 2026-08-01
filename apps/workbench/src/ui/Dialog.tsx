import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "./useDismiss.js";

// 공용 다이얼로그 — 백드롭 클릭/✕ 로 닫힘. 앱 전체 위 fixed 오버레이.
// width/height 를 주면 프레임 고정(내용이 바뀌어도 창이 안 출렁임) — 설정처럼 화면 전환이 잦은 곳에 쓴다.
export function Dialog({
    title,
    onClose,
    children,
    width,
    height,
    maxWidth = 440,
    padding = 14,
}: {
    title: ReactNode;
    onClose: () => void;
    children: ReactNode;
    width?: number;
    height?: number;
    maxWidth?: number;
    padding?: number;
}): JSX.Element {
    return (
        <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    width,
                    height,
                    minWidth: 300,
                    maxWidth: width ? undefined : maxWidth,
                    background: "var(--bg-primary)",
                    borderRadius: 10,
                    border: "1px solid var(--border-default)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                    fontFamily: "var(--font-sans)",
                fontSize: 13,
                    overflow: "hidden",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
                    <button onClick={onClose} title="닫기" style={{ background: "none", color: "var(--text-tertiary)", fontSize: 15, cursor: "pointer", lineHeight: 1 }}>
                        ✕
                    </button>
                </div>
                {/* 고정 높이면 본문이 남는 공간을 채우고 내부에서 스크롤을 관리(overflow:hidden) */}
                <div style={{ flex: 1, minHeight: 0, padding, overflow: height ? "hidden" : "visible" }}>{children}</div>
            </div>
        </div>
    );
}

/**
 * 커서 좌표에 뜨는 팝오버(딤 백드롭 없음) — 우클릭 컨텍스트 메뉴·클릭 목록 공용. 바깥클릭·Esc 로 닫힘.
 * 뷰포트 밖으로 안 나가게 마운트 후 실제 크기를 재어 clamp(내용이 늦게 로드돼 커져도 ResizeObserver 로 재보정).
 *
 * **body 로 portal 하는 게 핵심**: dockview 패널이 transform 을 쓰기 때문에 그 안의 position:fixed 는
 * 패널에 갇힌다. body 로 옮겨야 좌표가 진짜 뷰포트 기준이 된다.
 *
 * placement
 *   · "at"     — 커서 위치에 그대로(넘치면 clamp). 넓은 팝오버(내용 패널)용.
 *   · "beside" — 커서에서 offset 만큼 비껴서. 안 들어가면 커서 반대편으로 뒤집고 그다음 clamp.
 *                커서 아래 요소를 안 가리므로 메뉴에 맞다.
 */
export function AnchoredPopover({
    anchor,
    onClose,
    width,
    minWidth,
    maxWidth,
    padding = 12,
    maxHeight = "70vh",
    placement = "at",
    offset = 12,
    children,
}: {
    anchor: { x: number; y: number };
    onClose: () => void;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
    /** 메뉴처럼 항목이 가장자리까지 차는 내용은 0 (항목이 자기 padding 을 가진다). */
    padding?: number;
    maxHeight?: number | string;
    placement?: "at" | "beside";
    offset?: number;
    children: ReactNode;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.x, top: anchor.y });
    useDismiss(ref, onClose);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const pad = 8;
        const reposition = (): void => {
            const r = el.getBoundingClientRect();
            const off = placement === "beside" ? offset : 0;
            const fit = (start: number, size: number, viewport: number): number => {
                // 기본은 앵커 + offset. 그쪽이 안 들어가면 앵커 반대편으로. 마지막에 화면 안으로 clamp.
                let v = start + off;
                if (v + size > viewport - pad) v = start - off - size;
                return Math.max(pad, Math.min(v, viewport - size - pad));
            };
            setPos({ left: fit(anchor.x, r.width, window.innerWidth), top: fit(anchor.y, r.height, window.innerHeight) });
        };
        reposition();
        const ro = new ResizeObserver(reposition);
        ro.observe(el);
        return () => ro.disconnect();
    }, [anchor.x, anchor.y, placement, offset]);

    const style: CSSProperties = {
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width,
        minWidth,
        maxWidth,
        zIndex: 200,
        maxHeight,
        overflowY: "auto", // border-radius 안쪽으로 클리핑 → padding 0 인 메뉴도 모서리가 안 삐져나온다
        background: "var(--bg-primary)",
        border: "1px solid var(--border-default)",
        borderRadius: 10,
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        padding,
        fontFamily: "var(--font-sans)",
        fontSize: 13,
    };

    return createPortal(
        <div ref={ref} style={style}>
            {children}
        </div>,
        document.body,
    );
}

/** 메뉴 항목 버튼 — 가장자리까지 차는 좌측정렬 행(padding 0 팝오버와 한 쌍). */
export function MenuItem({ onClick, children, style, disabled, title }: { onClick: () => void; children: ReactNode; style?: CSSProperties; disabled?: boolean; title?: string }): JSX.Element {
    return (
        <button
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            title={title}
            style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "7px 12px", ...style, ...(disabled ? { color: "var(--text-tertiary)", opacity: 0.55, cursor: "default" } : {}) }}
        >
            {children}
        </button>
    );
}

/** 메뉴 제목 줄 — 무엇에 대한 메뉴인지(축 이름 등). */
export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", padding: "8px 12px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {children}
        </div>
    );
}
