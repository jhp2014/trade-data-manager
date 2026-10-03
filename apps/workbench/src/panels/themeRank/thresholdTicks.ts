// 경계 눈금 레이아웃(순수, 방향 무관) — % 눈금(세로 순위 축)과 억 눈금(가로 **반전** 순위 축)이 한 벌을 쓴다.
//
// 자리 정리는 % 눈금과 같다: 순위가 그 값 내림차순 경쟁 순위(1 + #(v > r))라 `count = #(v ≥ X)` 를
// 세면 `count + 0.5` 가 **정확한** X 경계다(근사 불요). 셈은 순위와 같은 배열을 써야 한다.
//
// 방향은 **가장자리 px 두 개**로 받는다 — loPx = 도메인 lo 쪽(1위 쪽) 가장자리, hiPx = 반대쪽.
// 세로 축은 lo 가 위(작은 px), x 반전축은 lo 가 오른쪽(큰 px)이라, q = s·px 로 부호를 정규화해
// "lo 가장자리 → hi 가장자리"(q 오름차순) 한 방향에서 밀어 앉히기·합침을 돌린다. 민 뒤에 합침을
// 재므로 밀려서 붙은 글자끼리는 하나로 합친다(선은 제자리 — 글자만 비킨다).
import type { AxisScale } from "./axisModel.js";

export interface ThresholdTickLayout {
    /** 뷰 안의 선(경계 = count + 0.5 의 px). */
    lines: { v: number; p: number }[];
    /** 글자 — 가까운 선끼리 합친 묶음(lo 가장자리 → hi 가장자리 순). parts 는 작은 값부터. */
    labels: { p: number; parts: number[] }[];
    /** 도메인 lo 쪽(1위 쪽)으로 벗어난 값 — 오름차순(가장자리 접힘 글자의 재료). */
    beyondLo: number[];
    /** 반대쪽으로 벗어난 값 — 오름차순. */
    beyondHi: number[];
}

/** 선 하나의 셈 — count = 그 값 이상(eps 여유)인 수(결손 제외). */
export function thresholdCounts(values: readonly (number | null)[], thresholds: readonly number[], eps = 0): { v: number; count: number }[] {
    return thresholds.map((v) => {
        let count = 0;
        for (const r of values) if (r !== null && Number.isFinite(r) && r >= v - eps) count++;
        return { v, count };
    });
}

/**
 * 셈 → 화면 배치. count = 0(그 값 이상이 없음)은 선을 안 긋는다 — 1위 위의 선은 뜻이 없다.
 * 뷰 밖 판정은 `inDomain` 이다 — 순위 px 는 maxRank 로 클램프라 px 로 재면 밖의 선이 상자 안에 선다.
 * 가장자리 접힘 글자가 서면 뷰 안 글자는 그로부터 mergePx 안쪽으로 밀어 앉힌다.
 */
export function layoutThresholdTicks(
    counts: readonly { v: number; count: number }[],
    scale: Pick<AxisScale, "px" | "inDomain">,
    domLo: number,
    /** hiAlways: 접힘 글자가 없어도 hi 가장자리 안쪽으로 글자를 민다 — 억 눈금의 y 제목 예약
     *  (접힘이 있을 때만 걸리면 제목과 겹치는 글자가 샌다 — 2026-10-03 리뷰). */
    edge: { loPx: number; hiPx: number; hiAlways?: boolean },
    mergePx: number,
): ThresholdTickLayout {
    const s = edge.loPx <= edge.hiPx ? 1 : -1; // q = s·px — lo 가장자리가 항상 작은 쪽이 되게
    const lines: { v: number; p: number }[] = [];
    const beyondLo: number[] = [];
    const beyondHi: number[] = [];
    for (const { v, count } of counts) {
        if (count <= 0) continue;
        const w = count + 0.5;
        if (scale.inDomain(w)) lines.push({ v, p: scale.px(w) });
        else if (w < domLo) beyondLo.push(v);
        else beyondHi.push(v);
    }
    const lo = beyondLo.length > 0 ? s * edge.loPx + mergePx : -Infinity;
    const hi = beyondHi.length > 0 ? s * edge.hiPx - mergePx : edge.hiAlways === true ? s * edge.hiPx : Infinity;
    // lo 가장자리 → hi 가장자리 순. 같은 자리의 두 값은 큰 값(lo 쪽 뜻)이 먼저 — parts 는 close 가 다시 정렬한다.
    const sorted = lines.map((l) => ({ v: l.v, q: Math.min(hi, Math.max(lo, s * l.p)) })).sort((a, b) => a.q - b.q || b.v - a.v);
    /** 묶음 닫기 — 글자 자리는 선들의 가운데(px 공간), 조각은 작은 값부터(읽는 순서). */
    const close = (g: { qs: number[]; parts: number[] }): { p: number; parts: number[] } => ({
        p: (s * g.qs.reduce((a, b) => a + b, 0)) / g.qs.length,
        parts: [...g.parts].sort((a, b) => a - b),
    });
    const labels: { p: number; parts: number[] }[] = [];
    let cur: { qs: number[]; parts: number[] } | null = null;
    for (const l of sorted) {
        if (cur !== null && l.q - cur.qs[cur.qs.length - 1] < mergePx) {
            cur.qs.push(l.q);
            cur.parts.push(l.v);
            continue;
        }
        if (cur !== null) labels.push(close(cur));
        cur = { qs: [l.q], parts: [l.v] };
    }
    if (cur !== null) labels.push(close(cur));
    return { lines, labels, beyondLo: beyondLo.sort((a, b) => a - b), beyondHi: beyondHi.sort((a, b) => a - b) };
}
