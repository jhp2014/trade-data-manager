// 차트 공용 툴팁 — 다크 박스 스타일 + 커서 추종 플로팅 툴팁 + 등락률 색.
// MinuteChart / DailyChart 가 공유(둘의 near-duplicate 툴팁을 하나로 통합).
import { RISE_COLOR, FALL_COLOR } from "./chartUtils.js";

/** 차트 다크 툴팁 박스 스타일(위치 제외 — 배경/테두리/패딩/그림자). */
export const TOOLTIP_BOX: React.CSSProperties = {
    background: "rgba(20,20,24,0.95)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 6,
    padding: "10px 12px",
    minWidth: 150,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
};

/** 등락률 부호 색 — 양수 상승색 / 음수 하락색 / 0 회색. */
export function rateColor(v: number): string {
    if (v > 0) return RISE_COLOR;
    if (v < 0) return FALL_COLOR;
    return "#a0a0a0";
}

/** 커서 추종 플로팅 툴팁 — 커서 우하단에 두되 가장자리면 뒤집는다(가로/세로). 컨테이너 기준 절대 위치.
 *  표시 여부는 호출측이 제어(`visible && <FloatingTooltip .../>`). */
export function FloatingTooltip({
    x,
    y,
    containerRef,
    children,
}: {
    x: number;
    y: number;
    containerRef: React.RefObject<HTMLDivElement | null>;
    children: React.ReactNode;
}): JSX.Element {
    const cw = containerRef.current?.clientWidth ?? 0;
    const ch = containerRef.current?.clientHeight ?? 0;
    const flipX = x > cw - 180;
    const flipY = y > ch - 130;
    return (
        <div
            style={{
                position: "absolute",
                left: flipX ? undefined : x + 14,
                right: flipX ? cw - x + 14 : undefined,
                top: flipY ? undefined : y + 14,
                bottom: flipY ? ch - y + 14 : undefined,
                pointerEvents: "none",
                zIndex: 10,
                ...TOOLTIP_BOX,
            }}
        >
            {children}
        </div>
    );
}
