// 플레인 표시 점 — 실시간=앰버 / 복기=teal. dockview 탭 색(--plane-*)과 같은 토큰이라
// "이 패널이 어느 평면인지"가 탭과 헤더에서 같은 색으로 읽힌다. 뉴스·차트 헤더 공용.
import type { Plane } from "../store/usePlaneBus.js";

export function PlaneDot({ plane }: { plane: Plane }): JSX.Element {
    const key = plane === "live" ? "live" : "eod";
    return (
        <span
            style={{ width: 7, height: 7, borderRadius: 999, background: `var(--plane-${key})`, flexShrink: 0 }}
            title={plane === "live" ? "실시간 플레인" : "복기 플레인"}
        />
    );
}
