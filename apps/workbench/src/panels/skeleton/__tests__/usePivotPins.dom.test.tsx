// 피벗 값 붙잡기(핀) — 손짓 두 단계(스치면 미리보기 / 누르면 붙잡기)와 **핀 식별자의 문자열 수술**.
//
// 왜 훅째로 재나: 이 상태는 골격선 층도 읽는다(`shown` 이 점 반지름과 값 라벨을 정한다). 판정이 전부
// 훅 안에 있어서 순수 함수로 꺼낼 게 없다 — 그래서 훅을 그대로 돌린다(그림은 안 그리므로 가볍다).
//
// ⚠ 이 파일이 특히 지키는 것: 핀 id 가 `선키|점인덱스` 인데 **선키 자체가 `|` 를 품는다**.
//   차트 단위 선은 `종목|날짜`(2조각), 타점 단위 선은 `종목|날짜|시각`(3조각)이다. 그래서 되돌릴 때
//   `lastIndexOf("|")` 로 **마지막 것만** 잘라야 한다 — `split("|")[0]` 로 "정리"하면 두 뷰가 조용히 깨진다.
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { normalizeSkeleton, pointSkeletons, type NormalizedSkeleton } from "../skeletonOverlay.js";
import { usePivotPins } from "../usePivotPins.js";

const CODE = "005930";
const DATE = "2026-07-08";
const CHART_KEY = `${CODE}|${DATE}`;
const TIME = "09:30:00";
const POINT_KEY = `${CODE}|${DATE}|${TIME}`;

const pivots = [{ t: 0, price: 10_000 }, { t: 3, price: 12_000 }, { t: 6, price: 11_000 }];

/** 차트 단위 선(일봉) — 키가 2조각. */
const chartLine = normalizeSkeleton(pivots, "first", { key: CHART_KEY, stockCode: CODE, date: DATE })!;

/** 타점 단위 선(분봉) — 키가 3조각. 피벗 t 는 벽시계 분이라 타점 시각(570)에 점이 있어야 한다. */
const minutePivots = [{ t: 565, price: 10_000 }, { t: 570, price: 12_000 }, { t: 575, price: 11_000 }];
const pointLine = pointSkeletons(minutePivots, 9_500, [{ pk: POINT_KEY, time: TIME }], { key: CHART_KEY, stockCode: CODE, date: DATE })[0];

const setup = (target: NormalizedSkeleton = chartLine, anchorKey = "first"): ReturnType<typeof renderHook<ReturnType<typeof usePivotPins>, { anchorKey: string }>> =>
    renderHook(({ anchorKey: a }) => usePivotPins({ target, resetKey: undefined, anchorKey: a }), {
        initialProps: { anchorKey },
    });

describe("픽스처 자신 — 두 키 모양이 실제로 다르다", () => {
    // 이게 같으면 아래 "선키를 되돌린다" 검사가 두 뷰를 구분하지 못한 채 통과한다.
    it("차트 키는 2조각, 타점 키는 3조각", () => {
        expect(CHART_KEY.split("|")).toHaveLength(2);
        expect(POINT_KEY.split("|")).toHaveLength(3);
        expect(pointLine?.key).toBe(POINT_KEY);
    });
});

describe("붙잡기 — 누르면 남고 다시 누르면 뗀다", () => {
    it("처음엔 아무것도 안 붙잡혀 있다", () => {
        const { result } = setup();
        expect(result.current.count).toBe(0);
        expect(result.current.isPinned(CHART_KEY, 1)).toBe(false);
        expect(result.current.shown(CHART_KEY, 1)).toBe(false);
    });

    it("누르면 붙잡히고 다시 누르면 떼어진다", () => {
        const { result } = setup();
        act(() => result.current.toggle(CHART_KEY, 1));
        expect(result.current.isPinned(CHART_KEY, 1)).toBe(true);
        expect(result.current.count).toBe(1);

        act(() => result.current.toggle(CHART_KEY, 1));
        expect(result.current.isPinned(CHART_KEY, 1)).toBe(false);
        expect(result.current.count).toBe(0);
    });

    it("점마다 따로 붙잡힌다 — 여럿을 나란히 놓고 볼 수 있다", () => {
        const { result } = setup();
        act(() => { result.current.toggle(CHART_KEY, 0); result.current.toggle(CHART_KEY, 2); });
        expect(result.current.count).toBe(2);
        expect(result.current.isPinned(CHART_KEY, 1)).toBe(false);
    });

    it("전부 떼기", () => {
        const { result } = setup();
        act(() => { result.current.toggle(CHART_KEY, 0); result.current.toggle(CHART_KEY, 1); });
        act(() => result.current.clear());
        expect(result.current.count).toBe(0);
    });
});

describe("스치는 미리보기 — 붙잡은 것과 갈린다", () => {
    it("손이 올라간 점은 **보이지만 안 붙잡혔다** — 진하기가 갈리는 근거", () => {
        const { result } = setup();
        act(() => result.current.setHoveredPivot({ key: CHART_KEY, i: 1 }));
        expect(result.current.shown(CHART_KEY, 1)).toBe(true);
        expect(result.current.isPinned(CHART_KEY, 1)).toBe(false);
        expect(result.current.count).toBe(0); // 미리보기는 세지 않는다
    });

    it("손을 치우면 미리보기가 사라진다 — 붙잡은 것은 남는다", () => {
        const { result } = setup();
        act(() => { result.current.toggle(CHART_KEY, 0); result.current.setHoveredPivot({ key: CHART_KEY, i: 1 }); });
        act(() => result.current.setHoveredPivot(null));
        expect(result.current.shown(CHART_KEY, 1)).toBe(false);
        expect(result.current.shown(CHART_KEY, 0)).toBe(true);
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유다.
describe("핀 식별자 — 선키를 되돌릴 때 **마지막 조각만** 자른다", () => {
    it("차트 단위 선키(2조각)를 그대로 되돌린다", () => {
        const { result } = setup();
        act(() => result.current.toggle(CHART_KEY, 1));
        expect([...result.current.linesWithPins]).toEqual([CHART_KEY]);
    });

    it("**타점 단위 선키(3조각)도 그대로 되돌린다** — split('|')[0] 이면 여기서 깨진다", () => {
        const { result } = setup(pointLine);
        act(() => result.current.toggle(POINT_KEY, 1));
        expect([...result.current.linesWithPins]).toEqual([POINT_KEY]);
    });

    it("선이 달라도 핀이 안 섞인다", () => {
        const other = `000660|${DATE}`;
        const { result } = setup();
        act(() => { result.current.toggle(CHART_KEY, 1); result.current.toggle(other, 1); });
        expect(result.current.isPinned(CHART_KEY, 1)).toBe(true);
        expect([...result.current.linesWithPins].sort()).toEqual([other, CHART_KEY].sort());
    });
});

describe("붙잡은 핀의 x — 테마 값을 펼치는 세로선이 서는 자리", () => {
    it("지금 조사 중인 선의 것만, **시각 순**으로", () => {
        const { result } = setup();
        act(() => { result.current.toggle(CHART_KEY, 2); result.current.toggle(CHART_KEY, 0); });
        expect(result.current.pinnedXs).toEqual([0, 6]); // anchor=first 라 x = t
    });

    it("다른 선의 핀은 안 낀다 — 세로선은 조사 중인 선의 좌표계다", () => {
        const { result } = setup();
        act(() => { result.current.toggle(CHART_KEY, 1); result.current.toggle(`000660|${DATE}`, 0); });
        expect(result.current.pinnedXs).toEqual([3]);
    });

    it("범위 밖 인덱스는 조용히 빠진다 — 선이 짧아져도 세로선이 엉뚱한 곳에 안 선다", () => {
        const { result } = setup();
        act(() => { result.current.toggle(CHART_KEY, 99); result.current.toggle(CHART_KEY, 1); });
        expect(result.current.pinnedXs).toEqual([3]);
    });

    it("조사 중인 선이 없으면 비어 있다", () => {
        const { result } = renderHook(() => usePivotPins({ target: null, resetKey: undefined, anchorKey: "first" }));
        act(() => result.current.toggle(CHART_KEY, 1));
        expect(result.current.pinnedXs).toEqual([]);
    });
});

describe("좌표계가 갈리면 붙잡은 값을 버린다", () => {
    // 앵커가 바뀌면 같은 인덱스가 다른 뜻이 된다 — 남겨두면 엉뚱한 자리의 값이 된다.
    it("앵커가 바뀌면 핀이 비워진다", () => {
        const { result, rerender } = setup();
        act(() => result.current.toggle(CHART_KEY, 1));
        expect(result.current.count).toBe(1);

        rerender({ anchorKey: "last" });
        expect(result.current.count).toBe(0);
    });

    it("앵커가 그대로면 안 버린다 — 확대·필터는 같은 그림을 다르게 볼 뿐이다", () => {
        const { result, rerender } = setup();
        act(() => result.current.toggle(CHART_KEY, 1));
        rerender({ anchorKey: "first" });
        expect(result.current.count).toBe(1);
    });
});

describe("값을 펼치는 x — 두 손짓이 같은 자리로 들어온다", () => {
    it("피벗에 손을 올리면 그 x — 붙잡지 않아도 읽힌다", () => {
        const { result } = setup();
        act(() => result.current.setHoveredPivot({ key: CHART_KEY, i: 1 }));
        expect(result.current.openReadingX).toBe(3);
    });

    it("핀 세로선 호버가 **이긴다** — 그쪽이 더 구체적인 지목이다", () => {
        const { result } = setup();
        act(() => { result.current.setHoveredPivot({ key: CHART_KEY, i: 1 }); result.current.setHoveredPinLine(6); });
        expect(result.current.openReadingX).toBe(6);
    });

    it("다른 선의 피벗 호버는 안 펼친다", () => {
        const { result } = setup();
        act(() => result.current.setHoveredPivot({ key: `000660|${DATE}`, i: 1 }));
        expect(result.current.openReadingX).toBeNull();
    });

    it("아무것도 안 짚으면 안 펼친다 — 상시가 아니다", () => {
        expect(setup().result.current.openReadingX).toBeNull();
    });
});

describe("앵커 피벗 시각 — 거래대금 라벨의 세그먼트 경계", () => {
    it("뷰 x 에 원점 시각을 더한 벽시계 분", () => {
        const { result } = setup(pointLine);
        expect(result.current.anchorMinutes).toEqual([565, 570, 575]);
    });

    it("조사 중인 선이 없으면 비어 있다", () => {
        const { result } = renderHook(() => usePivotPins({ target: null, resetKey: undefined, anchorKey: "first" }));
        expect(result.current.anchorMinutes).toEqual([]);
    });
});
