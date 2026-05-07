/**
 * 차트 툴팁 공통 유틸리티.
 * 마우스 위치 기준 우하단 배치 + 경계 보정.
 */

/** 툴팁을 마우스 우하단에 배치한다 (경계 초과 시 반대편으로 이동). */
export function positionTooltip(
    tip: HTMLDivElement,
    container: HTMLDivElement,
    x: number,
    y: number,
    margin = 16,
): void {
    const TW = tip.offsetWidth || 220;
    const TH = tip.offsetHeight || 160;
    let left = x + margin;
    let top = y + margin;
    if (left + TW > container.clientWidth) left = x - margin - TW;
    if (left < 0) left = margin;
    if (top + TH > container.clientHeight) top = y - margin - TH;
    if (top < 0) top = margin;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
}

/** 툴팁 엘리먼트의 기본 인라인 스타일 객체 */
export const TOOLTIP_STYLE: React.CSSProperties = {
    position: "absolute",
    display: "none",
    pointerEvents: "none",
    padding: "10px 12px",
    background: "rgba(20,20,24,0.95)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 6,
    color: "#fff",
    zIndex: 10,
    fontFamily: "inherit",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
};
