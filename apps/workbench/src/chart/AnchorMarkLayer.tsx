// 차트 위 앵커 표식 **칩 층** — 컨테이너를 덮는 SVG. 드롭선은 여기 없다(primitive 가 그린다).
//
// `pointerEvents:none` 인 상자에 칩만 `all` 이라, 팬·크로스헤어 같은 차트 본연의 손짓을 가리지 않는다.
// 칩 위 **우클릭은 일부러 안 막는다** — 칩은 그 봉을 가리키는 물건이고, 그 봉의 메뉴에 "이 봉의 선 삭제"가
// 있다. 컨테이너가 네이티브 버블로 contextmenu 를 받으므로 그대로 두면 캔들 메뉴가 열린다(의도).
//
// 창 밖 ◀▶ 칩은 **눌러서 그리로 간다** — 차트는 기본 프레이밍이 최근 N봉이라 옛 앵커가 거의 늘 창 밖이고,
// 상시 떠 있는 표식을 읽기만 하게 두면 소음이 된다(정규화는 창이 상수라 이 문제가 없었다).
import { EdgeChip, MarkChip } from "../components/MarkChip.js";
import { MARK_W } from "../lib/anchorMarks.js";
import type { AnchorMarkLayout } from "./anchorMarkOverlay.js";

export function AnchorMarkLayer({ layout, onGoTo }: {
    layout: AnchorMarkLayout;
    /** ◀▶ 칩 클릭 — 그 방향의 첫 표식으로 가로 스크롤. 없으면 칩이 안 눌린다. */
    onGoTo?: (side: "left" | "right") => void;
}): JSX.Element | null {
    const { chips, offLeft, offRight } = layout;
    if (chips.length === 0 && offLeft.length === 0 && offRight.length === 0) return null;
    const edgeY = 2;
    return (
        <svg
            data-layer="chart-anchor-marks"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 5, pointerEvents: "none", overflow: "visible" }}
        >
            {chips.map((c) => (
                <MarkChip key={c.mark.key} x={c.x} y={c.y}
                    short={c.mark.short} solid={c.mark.solid} color={c.color} tip={c.mark.tip} />
            ))}
            {offLeft.length > 0 && (
                <EdgeChip x={2 + MARK_W / 2} y={edgeY} side="left" items={offLeft.map((m) => m.tip)}
                    color="var(--text-tertiary)" onClick={onGoTo ? () => onGoTo("left") : undefined} />
            )}
            {offRight.length > 0 && (
                <EdgeChip x={layout.width - 2 - MARK_W / 2} y={edgeY} side="right" items={offRight.map((m) => m.tip)}
                    color="var(--text-tertiary)" onClick={onGoTo ? () => onGoTo("right") : undefined} />
            )}
        </svg>
    );
}
