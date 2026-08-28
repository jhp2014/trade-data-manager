// 레일 편집(순수) — 드래그가 구간 리스트를 어떻게 바꾸나. 값·앵커·날짜가 무엇인지는 모른다.
//
// 규칙은 셋뿐이다:
//   · 빈 트랙 드래그 = **새 구간**(누른 자리와 뗀 자리가 양끝)
//   · 경계 라벨 드래그 = **그 경계만** 이동(반대쪽은 그대로)
//   · 끌다 반대편을 지나치면 뒤집힌 채로 두고, 커밋할 때 정렬한다
// 셋 다 포인터 핸들러 안에 있으면 손으로만 검증된다 — 옛 레일이 그래서 "클릭인가 드래그인가"
// 판정이 조용히 어긋나도 아무도 몰랐다.
//
// ⚠ 경계값 타입 V 는 레일마다 다르고(계산 축=타점 앵커 · 판단 축=slotId · 날짜=YYYY-MM-DD),
// **안 건드린 경계는 V 를 그대로 들고 있는다.** 프랙션으로 바꿨다 되돌리면 앵커가 값으로 굳거나
// 반열림이 닫히는 등, 손대지 않은 조건의 뜻이 조용히 변한다. 그래서 이 모듈은 V 를 절대 만들지 않고
// 드래그가 닿은 자리에서만 호출자의 `fromFrac` 을 부른다.
//
// 대소 판정도 값이 아니라 **프랙션**으로 한다 — 화면 위 위치가 곧 사용자가 의도한 순서라서,
// 강한 쪽이 작은 값인 축(strongerWhen: "lower")에서도 규칙이 뒤집히지 않는다.

/** 구간 하나 — 양끝 포함. from/to 의 대소는 보장되지 않는다(드래그 중엔 뒤집힐 수 있다). */
export interface RailRange<V> {
    from: V;
    to: V;
}

/** 지금 무엇을 끌고 있나. `new` 의 anchorFrac = 처음 누른 자리. */
export type RailDrag =
    | { kind: "new"; anchorFrac: number }
    | { kind: "edge"; index: number; edge: "from" | "to" };

export interface DragOptions {
    /**
     * 구간이 하나뿐인 레일(판단 축 밴드) — 새 드래그가 **덧붙이지 않고 갈아탄다**.
     * 저장 모양(RankBand)에 자리가 하나뿐이라, 덧붙이면 화면에만 있고 저장 못 하는 구간이 생긴다.
     */
    single?: boolean;
    /**
     * 상한 컷 레일(테마 존 N/M·존순위) — from 이 **강한 끝(프랙션 0)에 못 박힌** 단일 구간.
     * 빈 트랙 드래그가 anchorFrac 을 무시하고 {0 → at} 으로 갈아탄다(= single 함의): 저장 모양이
     * "값 하나(상한)"라 from 이 움직이는 순간 컷의 뜻("N위 이내")이 깨진다.
     */
    cut?: boolean;
}

/**
 * 드래그 한 프레임의 결과(미리보기이자 커밋 후보). `at` = 지금 포인터의 프랙션(스냅 후).
 * 순수하므로 미리보기와 커밋이 같은 함수를 쓴다 — 둘이 갈라지면 뗀 순간 구간이 살짝 튄다.
 */
export function applyDrag<V>(
    ranges: readonly RailRange<V>[],
    drag: RailDrag,
    at: number,
    fromFrac: (frac: number) => V,
    { single = false, cut = false }: DragOptions = {},
): RailRange<V>[] {
    if (drag.kind === "new") {
        const fresh: RailRange<V> = { from: fromFrac(cut ? 0 : drag.anchorFrac), to: fromFrac(at) };
        return single || cut ? [fresh] : [...ranges, fresh];
    }
    return ranges.map((r, i) => (i === drag.index ? { ...r, [drag.edge]: fromFrac(at) } : r));
}

/** 각 구간을 from ≤ to 로 정렬(뒤집힌 채 커밋되면 판정이 빈 구간을 본다). */
export function orderRanges<V>(ranges: readonly RailRange<V>[], toFrac: (v: V) => number): RailRange<V>[] {
    return ranges.map((r) => (toFrac(r.from) <= toFrac(r.to) ? r : { from: r.to, to: r.from }));
}

/**
 * 사실상 점인 구간 = **클릭**이다(드래그가 아니라). 트랙을 그냥 눌렀을 때 폭 0 짜리 구간이
 * 생기면 "아무것도 통과 못 하는 조건"이 조용히 걸린다.
 */
export const isTapRange = <V,>(r: RailRange<V>, toFrac: (v: V) => number, eps = 0.008): boolean =>
    Math.abs(toFrac(r.from) - toFrac(r.to)) < eps;

export function removeAt<V>(ranges: readonly RailRange<V>[], index: number): RailRange<V>[] {
    return ranges.filter((_, i) => i !== index);
}

/** 트랙 안 포인터 x(px) → 0..1. 좌우 여백(pad)을 뺀 실제 선 길이가 기준. */
export function fracOfX(offsetX: number, width: number, pad: number): number {
    const span = width - 2 * pad;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(1, (offsetX - pad) / span));
}

// 스냅(경계를 실재하는 자리에 세우기)은 레일마다 척도가 달라 어댑터의 `fromFrac` 이 한다:
// 균등 간격이면 반올림(자리 축·거래일), 값 척도면 가장 가까운 타점(계산 축의 nearestPointAt).
