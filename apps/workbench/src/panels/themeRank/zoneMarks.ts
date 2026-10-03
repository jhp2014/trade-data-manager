// 존 표식 기하(순수) — decisions.md 「시장 단면 존의 시각 어휘」(2026-10-03). 렌더(ThemePlaneView)는
// 여기 결과를 그대로 그린다(tooltipBox 선례 — 기하를 빼서 테스트한다).
//
// 어휘: 면 = 빗금(렌더 몫) · 선 = 점선 + **양끝 값 배지**(자유 자 배지의 빨간 쌍둥이, 읽기 전용) ·
// 교차점 곁 「존 — {출처}」 이름표. 배지는 **판 안쪽 가장자리**다 — 여백은 축 어휘(%·억 눈금·자
// 손잡이)가 소유한다(planner 확정): 세로선 = 위 안쪽, 가로선 = 왼 안쪽(자 배지가 아래·오른쪽이라 안 부딪힘).
import type { AxisScale, PlotBox } from "./axisModel.js";
import { LBL_H, LBL_W } from "./useThemePlane.js";

export const ZONE_TAG_H = 16;
/** 이름표 최대 폭(px) — 넘치면 말줄임(전체는 렌더가 <title> 로). */
export const ZONE_TAG_MAX_W = 200;

export interface ZoneMarks {
    /** 세로선(대금 변)의 px — 도메인 밖이면 null(선·배지 접음). */
    vpx: number | null;
    /** 가로선(등락 변)의 py. */
    hpy: number | null;
    /** 빗금 면 — 두 변이 다 설 때만(1위 코너 = 오른쪽-위). */
    rect: { x: number; y: number; w: number; h: number } | null;
    vBadge: { x: number; y: number; text: string } | null;
    hBadge: { x: number; y: number; text: string } | null;
    nameTag: { x: number; y: number; w: number; text: string } | null;
}

/** 글자 폭 추정(10px 폰트) — CJK ≈ 10px, 나머지 ≈ 5.6px. 정밀할 필요 없다(이름표 상자·뒤집기 판정용). */
export const estTextW = (text: string): number => {
    let w = 0;
    for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? 10 : 5.6;
    return Math.ceil(w);
};

/** 이름표 글자 — 빈 출처는 「존」, 길면 최대 폭에서 말줄임. */
export function zoneTagText(from: string): string {
    const base = from.trim() === "" ? "존" : `존 — ${from.trim()}`;
    const budget = ZONE_TAG_MAX_W - 12; // 좌우 패딩
    if (estTextW(base) <= budget) return base;
    let out = "";
    for (const ch of base) {
        if (estTextW(out + ch) > budget - 8) break;
        out += ch;
    }
    return `${out}…`;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

export function zoneMarksOf(
    overlay: { x: number | null; y: number | null; from: string },
    xScale: Pick<AxisScale, "px" | "inDomain" | "fmt">,
    yScale: Pick<AxisScale, "px" | "inDomain" | "fmt">,
    box: PlotBox,
): ZoneMarks {
    const right = box.left + box.width;
    const bottom = box.top + box.height;
    const vpx = overlay.x !== null && xScale.inDomain(overlay.x) ? xScale.px(overlay.x) : null;
    const hpy = overlay.y !== null && yScale.inDomain(overlay.y) ? yScale.px(overlay.y) : null;

    const rect = vpx !== null && hpy !== null
        ? { x: vpx, y: box.top, w: Math.max(0, right - vpx), h: Math.max(0, hpy - box.top) }
        : null;
    const vBadge = vpx !== null && overlay.x !== null
        ? { x: clamp(vpx - LBL_W / 2, box.left, right - LBL_W), y: box.top + 3, text: xScale.fmt(overlay.x) }
        : null;
    const hBadge = hpy !== null && overlay.y !== null
        ? { x: box.left + 3, y: clamp(hpy - LBL_H / 2, box.top, bottom - LBL_H), text: yScale.fmt(overlay.y) }
        : null;

    let nameTag: ZoneMarks["nameTag"] = null;
    if (vpx !== null || hpy !== null) {
        const text = zoneTagText(overlay.from);
        const w = Math.min(estTextW(text) + 12, ZONE_TAG_MAX_W);
        if (vpx !== null && hpy !== null) {
            // 교차점 곁, 존 바깥쪽 아래(면을 안 가린다) — 오른쪽이 모자라면 선 왼쪽으로, 아래가 모자라면 위로.
            const x = vpx + 6 + w <= right ? vpx + 6 : Math.max(box.left, vpx - 6 - w);
            const y = hpy + 4 + ZONE_TAG_H <= bottom ? hpy + 4 : hpy - 4 - ZONE_TAG_H;
            nameTag = { x, y, w, text };
        } else if (vpx !== null && vBadge !== null) {
            // 세로선만 — 그 배지 바로 아래(배지와 같은 왼끝, 오른쪽이 모자라면 당긴다).
            nameTag = { x: clamp(vBadge.x, box.left, right - w), y: vBadge.y + LBL_H + 3, w, text };
        } else if (hBadge !== null) {
            // 가로선만 — 그 배지 오른쪽 곁(모자라면 배지 아래로).
            const beside = hBadge.x + LBL_W + 6;
            nameTag = beside + w <= right
                ? { x: beside, y: clamp(hBadge.y - 1, box.top, bottom - ZONE_TAG_H), w, text }
                : { x: hBadge.x, y: clamp(hBadge.y + LBL_H + 3, box.top, bottom - ZONE_TAG_H), w, text };
        }
    }
    return { vpx, hpy, rect, vBadge, hBadge, nameTag };
}
