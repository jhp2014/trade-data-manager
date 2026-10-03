// 존 표식 기하(순수) — **선·빗금 면의 자리만**. 2026-10-03 저녁 개정: 값 배지는 자유 자 배지와
// 같은 여백 자리(아래·오른쪽)로 이사해 뷰의 vLabel/hLabel 을 같이 쓰고(같은 코드 = 같은 기하),
// 「존 — 출처」 이름표는 폐지됐다(판 위 글씨가 안 읽힌다 — 출처는 헤더 정보 「존: …」가 말한다).
import type { AxisScale, PlotBox } from "./axisModel.js";

export interface ZoneMarks {
    /** 세로선(대금 변)의 px — 도메인 밖이면 null(선·배지 접음). */
    vpx: number | null;
    /** 가로선(등락 변)의 py. */
    hpy: number | null;
    /** 빗금 면 — 두 변이 다 설 때만(1위 코너 = 오른쪽-위). */
    rect: { x: number; y: number; w: number; h: number } | null;
}

export function zoneMarksOf(
    overlay: { x: number | null; y: number | null },
    xScale: Pick<AxisScale, "px" | "inDomain">,
    yScale: Pick<AxisScale, "px" | "inDomain">,
    box: PlotBox,
): ZoneMarks {
    const vpx = overlay.x !== null && xScale.inDomain(overlay.x) ? xScale.px(overlay.x) : null;
    const hpy = overlay.y !== null && yScale.inDomain(overlay.y) ? yScale.px(overlay.y) : null;
    const rect = vpx !== null && hpy !== null
        ? { x: vpx, y: box.top, w: Math.max(0, box.left + box.width - vpx), h: Math.max(0, hpy - box.top) }
        : null;
    return { vpx, hpy, rect };
}
