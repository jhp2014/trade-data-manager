// 산점 호버 툴팁의 자리 셈(순수) — 고정 (x+10, y−24, 폭 150) 이 패널 경계에서 잘리던 것의 처방.
// 규칙: 폭은 글자에서 추정(고정 150 은 긴 종목명을 자르고 짧은 이름에 빈 상자를 남긴다),
// 자리는 커서 오른쪽 위 우선 — 공간이 없으면 플립(왼쪽/아래), 그래도 남으면 경계 안으로 클램프.
export interface TooltipBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const TOOLTIP_H = 18;
const GAP = 10; // 커서와의 간격
const MARGIN = 2; // 패널 경계 여백

/** 11px 폰트의 근사 폭 — CJK ≈ 11px, 나머지(숫자·라틴·기호) ≈ 6px. 캔버스 measure 없이 충분하다. */
export function tooltipTextWidth(text: string): number {
    let w = 0;
    for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? 11 : 6;
    return w;
}

export function tooltipBoxOf(hover: { x: number; y: number }, text: string, bounds: { w: number; h: number }): TooltipBox {
    const w = tooltipTextWidth(text) + 12; // 좌우 패딩
    const h = TOOLTIP_H;
    let x = hover.x + GAP;
    if (x + w > bounds.w - MARGIN) x = hover.x - GAP - w; // 오른쪽이 모자라면 왼쪽으로 플립
    x = Math.max(MARGIN, Math.min(x, bounds.w - w - MARGIN)); // 그래도 남으면 클램프
    let y = hover.y - GAP - h + 4;
    if (y < MARGIN) y = hover.y + GAP + 2; // 위가 모자라면 아래로 플립
    y = Math.max(MARGIN, Math.min(y, bounds.h - h - MARGIN));
    return { x, y, w, h };
}
