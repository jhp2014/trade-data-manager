// 레일 좌표 ↔ 저장 모양(순수) — 두 방향의 번역이 한 곳에 있어야 왕복이 제자리로 돌아온다.
//
// 두 가지가 여기서 갈린다:
//
// **① 방향.** 레일은 언제나 왼쪽 = 약, 오른쪽 = 강이다(레인·시트와 같은 관례). 그런데 저장 모양은
// 수치의 하한/상한이라, 강한 쪽이 작은 값인 축(strongerWhen: "lower")에서는 **왼쪽이 상한**이다.
// 이 뒤집힘을 화면 코드가 들고 있으면 축 하나 추가할 때마다 같은 실수를 다시 한다.
//
// **② 무제한(반열림).** 저장 모양은 한쪽이 없는 구간을 허용하지만(`5% 이상`), 레일은 양끝이 있어야
// 그린다. 그래서 그릴 때는 도메인 끝으로 채우고, **끝에 닿은 채 돌아온 경계는 다시 비운다** —
// "끝까지 끌면 그 방향은 무제한"이라는 한 줄 규칙이다. 값으로 굳혀 두면 나중에 그 밖에 타점이
// 배치됐을 때 조용히 빠지는데, 사용자가 의도한 건 "여기부터 끝까지"였다.
import type { AxisBound, AxisValueRange, RankBand } from "../stage.js";
import type { RailRange } from "./railModel.js";

/** 이 축은 큰 값이 강한가, 작은 값이 강한가 — 레일 방향을 정하는 단 하나의 사실. */
export type Orient = "higher" | "lower";

/** 끝에 닿았다고 볼 여유. 스냅이 실제 자리로 붙으므로 정확히 0/1 이지만, 부동소수 오차만큼은 봐준다. */
const EDGE_EPS = 0.001;
export const atWeakEnd = (frac: number): boolean => frac <= EDGE_EPS;
export const atStrongEnd = (frac: number): boolean => frac >= 1 - EDGE_EPS;

// ── 계산 축(값 구간) ────────────────────────────────────────────────────────

/**
 * 저장 → 레일. `weakEnd`/`strongEnd` 는 도메인 양 끝의 경계값(레일 방향 기준).
 * 빈 구간(양끝 다 없음)은 조건이 아니라 그리지 않는다.
 */
export function toRailRanges(
    ranges: readonly AxisValueRange[],
    weakEnd: AxisBound,
    strongEnd: AxisBound,
    orient: Orient,
): RailRange<AxisBound>[] {
    const out: RailRange<AxisBound>[] = [];
    for (const r of ranges) {
        if (!r.from && !r.to) continue;
        // higher 축은 하한이 왼쪽, lower 축은 상한이 왼쪽.
        const left = orient === "higher" ? r.from : r.to;
        const right = orient === "higher" ? r.to : r.from;
        out.push({ from: left ?? weakEnd, to: right ?? strongEnd });
    }
    return out;
}

/**
 * 레일 → 저장. 레일 구간은 정렬돼 있다고 본다(from = 왼쪽 = 약).
 * 양끝이 다 끝에 닿은 구간은 **조건이 아니므로** 버린다(전부 통과를 조건으로 저장하면 화면에 유령이 남는다).
 */
export function toValueRanges(
    rail: readonly RailRange<AxisBound>[],
    toFrac: (b: AxisBound) => number,
    orient: Orient,
): AxisValueRange[] {
    const out: AxisValueRange[] = [];
    for (const r of rail) {
        const left = atWeakEnd(toFrac(r.from)) ? undefined : r.from;
        const right = atStrongEnd(toFrac(r.to)) ? undefined : r.to;
        if (!left && !right) continue;
        out.push(orient === "higher" ? { from: left, to: right } : { from: right, to: left });
    }
    return out;
}

// ── 판단 축(자리 밴드) ──────────────────────────────────────────────────────
//
// 밴드는 한 쌍뿐이라(RankBand) 레일도 구간 하나(single). 방향 뒤집힘은 없다 —
// lo = 작은 orderKey = 왼쪽이 정의 그대로다.

/** 저장 → 레일. 비어 있는 경계는 양 끝 자리로 채운다. 자리가 없으면 그릴 수 없어 빈 리스트. */
export function toRailBand(band: RankBand, weakSlot: string | undefined, strongSlot: string | undefined): RailRange<string>[] {
    if (!band.lo && !band.hi) return [];
    const from = band.lo ?? weakSlot;
    const to = band.hi ?? strongSlot;
    return from && to ? [{ from, to }] : [];
}

/** 레일 → 저장. 끝 자리에 닿은 경계는 무제한. 조건이 안 남으면 null(= 그 필터를 지운다). */
export function toRankBand(rail: readonly RailRange<string>[], toFrac: (slotId: string) => number): RankBand | null {
    const r = rail[0];
    if (!r) return null;
    const lo = atWeakEnd(toFrac(r.from)) ? undefined : r.from;
    const hi = atStrongEnd(toFrac(r.to)) ? undefined : r.to;
    return lo === undefined && hi === undefined ? null : { lo, hi };
}
