import { describe, it, expect } from "vitest";
import { scaleLinear } from "d3-scale";
import { normalizeSkeleton, pointSkeletons, overlayBounds, trimmedBounds, dailyFrame, DAILY_FRAME, pointUnitFrame, POINT_FRAME, splitAtX, polylinePoints, yAtX, decimate, decimateStep, clipToX, pct, minutesOf, lineOpacity, dimOpacity, labelPointOf, clusterLabels, lineVisual, keysInRect, amountRuns, minuteIndexOf, minuteAmountOf, pickAmountLabels, spreadByY, segmentIndexOf, LEVEL_QUIET, LEVEL_MISSING } from "../skeletonOverlay.js";
import type { SkeletonWirePivot } from "@trade-data-manager/wire";

const owner = { stockCode: "005930", date: "2026-08-05", key: "005930|2026-08-05" };

// 저 → 고 → 저: 100 에서 150 까지 5일 오르고 3일에 걸쳐 120 으로 되돌린 골격.
const pivots: SkeletonWirePivot[] = [
    { t: 10, price: 100 },
    { t: 15, price: 150 },
    { t: 18, price: 120 },
];

describe("normalizeSkeleton", () => {
    it("첫 점 기준이면 원점에서 앞으로 퍼진다(t ≥ 0)", () => {
        const n = normalizeSkeleton(pivots, "first", owner)!;
        expect(n.points.map((p) => p.x)).toEqual([0, 5, 8]);
        expect(n.points[0].y).toBe(0);
        expect(n.points[1].y).toBeCloseTo(50);
        expect(n.points[2].y).toBeCloseTo(20);
    });

    it("마지막 점 기준이면 원점에서 뒤로 퍼진다(t ≤ 0)", () => {
        const n = normalizeSkeleton(pivots, "last", owner)!;
        expect(n.points.map((p) => p.x)).toEqual([-8, -3, 0]);
        // 120 이 기준이므로 100 은 아래, 150 은 위.
        expect(n.points[0].y).toBeCloseTo(-16.667, 3);
        expect(n.points[1].y).toBeCloseTo(25);
        expect(n.points[2].y).toBe(0);
    });

    it("식별은 차트키 — 일봉·분봉 골격 둘 다 차트 소유다(chartKey 도 같은 값)", () => {
        const n = normalizeSkeleton(pivots, "last", owner)!;
        expect(n).toMatchObject({ key: owner.key, chartKey: owner.key, stockCode: "005930", date: "2026-08-05" });
    });

    it("앵커 원가격·원 t 를 남긴다 — 선(가격)과 타점 시각(벽시계)을 같은 공간으로 끌어오는 계수", () => {
        const n = normalizeSkeleton(pivots, "last", owner)!;
        expect(n.basePrice).toBe(120);
        expect(n.baseT).toBe(18); // 벽시계 t=20 인 타점 → 정규화 x = 20 - 18 = 2
        // 기준선 90원은 마지막 점(120) 대비 -25%.
        expect(pct(90, n.basePrice)).toBeCloseTo(-25);
    });

    it("피벗이 2개 미만이면 골격이 아니다", () => {
        expect(normalizeSkeleton([{ t: 1, price: 100 }], "first", owner)).toBeNull();
    });

    it("앵커 가격이 0 이하면 정규화할 수 없다 — 0으로 지어내지 않는다", () => {
        expect(normalizeSkeleton([{ t: 1, price: 0 }, { t: 2, price: 10 }], "first", owner)).toBeNull();
    });
});

describe("pointSkeletons — 분봉 = 타점 단위 재구성(전일 종가 대비 %p 공간)", () => {
    const chart = { key: "005930|2026-08-05", stockCode: "005930", date: "2026-08-05" };
    // 09:15 손 피벗 100 → 09:30 합성(타점 종가) 120 → 09:45 손 피벗 110. 전일 종가 100.
    const mins: SkeletonWirePivot[] = [
        { t: 555, price: 100 },
        { t: 570, price: 120, synthetic: true },
        { t: 585, price: 110 },
    ];
    const prevClose = 100;
    const pk = "005930|2026-08-05|09:30:00";

    it("선 하나 = 타점 하나 — 자기 시각 피벗이 원점(0,0), y 는 **전일 종가 대비 %p 차이**(절대 배치의 평행이동)", () => {
        const [l] = pointSkeletons(mins, prevClose, [{ pk, time: "09:30:00" }], chart);
        // basePrice = 전일 종가(%p 분모), baseRate = 타점 시각의 절대 등락률(+20%) — 절대값 복원 상수.
        expect(l).toMatchObject({ key: pk, chartKey: chart.key, time: "09:30:00", basePrice: 100, baseT: 570, splitIdx: 1 });
        expect(l.baseRate).toBeCloseTo(20);
        expect(l.points.map((p) => p.x)).toEqual([-15, 0, 15]);
        expect(l.points[0].y).toBeCloseTo(-20); // 절대 0% − 타점 20% = −20%p (자기 가격 대비면 −16.7%였을 값)
        expect(l.points[1].y).toBe(0);
        expect(l.points[2].y).toBeCloseTo(-10);
        // 절대값 복원: y + baseRate = 전일 종가 대비 %.
        expect(l.points[2].y + l.baseRate).toBeCloseTo(pct(110, prevClose));
    });

    it("타점 3개면 선 3개 — 같은 골격이 타점마다 자기 좌표계로 다시 서고, baseRate 는 각자의 절대 등락률", () => {
        const out = pointSkeletons(mins, prevClose, [
            { pk: "a", time: "09:15:00" },
            { pk: "b", time: "09:30:00" },
            { pk: "c", time: "09:45:00" },
        ], chart);
        expect(out.map((l) => l.splitIdx)).toEqual([0, 1, 2]);
        expect(out.map((l) => l.points[l.splitIdx])).toEqual([
            { x: 0, y: 0 }, { x: 0, y: 0, synthetic: true }, { x: 0, y: 0 },
        ]);
        expect(out[0].baseRate).toBe(0);
        expect(out[1].baseRate).toBeCloseTo(20);
        expect(out[2].baseRate).toBeCloseTo(10);
    });

    it("synthetic 표시는 그대로 흐른다 — 속 빈 원 렌더가 이 값을 본다", () => {
        const [l] = pointSkeletons(mins, prevClose, [{ pk, time: "09:30:00" }], chart);
        expect(l.points.map((p) => !!p.synthetic)).toEqual([false, true, false]);
    });

    it("자기 시각의 피벗이 없으면 그 타점은 건너뛴다 — 지어내지 않는다(합성 규칙상 원래 없을 수 없다)", () => {
        expect(pointSkeletons(mins, prevClose, [{ pk: "x", time: "10:00:00" }], chart)).toEqual([]);
    });

    it("피벗 2개 미만이면 골격이 아니다", () => {
        expect(pointSkeletons([{ t: 570, price: 120 }], prevClose, [{ pk, time: "09:30:00" }], chart)).toEqual([]);
    });

    it("전일 종가가 없으면 빈 배열 — %p 분모를 지어내지 않는다(호출측이 결손으로 센다)", () => {
        expect(pointSkeletons(mins, undefined, [{ pk, time: "09:30:00" }], chart)).toEqual([]);
        expect(pointSkeletons(mins, 0, [{ pk, time: "09:30:00" }], chart)).toEqual([]);
    });

    it("minutesOf — 벽시계 분 환산(초는 버린다: 분봉 피벗의 t 해상도가 분이다)", () => {
        expect(minutesOf("09:30:00")).toBe(570);
        expect(minutesOf("15:19:59")).toBe(919);
    });
});

describe("overlayBounds", () => {
    it("y 는 0(기준선)을 항상 포함한다 — 화면 밖이면 되돌림을 읽을 수 없다", () => {
        // 전부 기준 위에 있는 골격 하나 → minY 가 0 으로 내려와야 한다.
        const n = normalizeSkeleton(pivots, "first", owner)!;
        const b = overlayBounds([n])!;
        expect(b.minY).toBe(0);
        expect(b.maxY).toBeCloseTo(50);
        expect(b.minX).toBe(0);
        expect(b.maxX).toBe(8);
    });

    it("빈 목록은 경계가 없다", () => {
        expect(overlayBounds([])).toBeNull();
    });
});

describe("trimmedBounds", () => {
    // 이상치 하나가 나머지를 바닥에 누르는 상황 — 공통 척도의 유일한 실질 문제.
    const many = Array.from({ length: 20 }, (_, i) =>
        normalizeSkeleton([{ t: 0, price: 100 }, { t: 2, price: 110 }], "first", { ...owner, key: `k${i}` })!,
    );
    const outlier = normalizeSkeleton([{ t: 0, price: 100 }, { t: 2, price: 400 }], "first", { ...owner, key: "out" })!;

    it("양끝 분위수를 뺀 범위를 준다 — 이상치가 척도를 지배하지 않게", () => {
        const full = overlayBounds([...many, outlier])!;
        const trimmed = trimmedBounds([...many, outlier], 0.05)!;
        expect(full.maxY).toBeCloseTo(300);
        expect(trimmed.maxY).toBeLessThan(full.maxY);
    });

    it("0(앵커 선)은 언제나 범위 안 — 기준이 화면 밖이면 되돌림을 못 읽는다", () => {
        const b = trimmedBounds(many, 0.4)!;
        expect(b.minY).toBeLessThanOrEqual(0);
        expect(b.maxY).toBeGreaterThanOrEqual(0);
        expect(b.minX).toBeLessThanOrEqual(0);
    });

    it("q 가 0이면 전체 범위 그대로", () => {
        expect(trimmedBounds([...many, outlier], 0)).toEqual(overlayBounds([...many, outlier]));
    });
});

describe("dailyFrame — 일봉 정규화 기본 창(상수)", () => {
    it("마지막 점 기준이면 뒤로 60일·앞으로 10일, 세로는 −60~+40%", () => {
        expect(dailyFrame("last")).toEqual({ minX: -DAILY_FRAME.back, maxX: DAILY_FRAME.forward, minY: -60, maxY: 40 });
    });

    it("첫 점 기준이면 x 창이 뒤집힌다 — 시간이 앞으로 퍼지므로 넓은 쪽도 앞", () => {
        expect(dailyFrame("first")).toEqual({ minX: -DAILY_FRAME.forward, maxX: DAILY_FRAME.back, minY: -60, maxY: 40 });
    });
});

describe("pointUnitFrame — 분봉 타점 정규화 기본 창", () => {
    // 타점(원점) 이전 90분 · −30% 까지 내려갔다가 이후 +50% 간 골격.
    const wide = [{
        key: "k", chartKey: "c", stockCode: "005930", date: "2026-08-05", basePrice: 100, baseRate: 0, baseT: 0,
        points: [{ x: -90, y: -30 }, { x: 0, y: 0 }, { x: 120, y: 50 }],
    }];

    it("상수 창 — 타점 이전 60분·이후 10분·±20%. 데이터가 넘쳐도 창은 안 흔들린다(비교 기준)", () => {
        expect(pointUnitFrame(wide, 0)).toEqual({ minX: -POINT_FRAME.back, maxX: POINT_FRAME.forward, minY: -20, maxY: 20 });
    });

    it("미래 포함이면 **양의 쪽만** 데이터까지 — 과거 쪽 창은 그대로", () => {
        const f = pointUnitFrame(wide, 0, true)!;
        expect(f.maxX).toBe(120);
        expect(f.maxY).toBe(50);
        expect(f.minX).toBe(-POINT_FRAME.back);
        expect(f.minY).toBe(POINT_FRAME.minY);
    });

    it("미래 포함이어도 기본 창 아래로는 안 좁아진다 — 데이터가 원점에서 안 벗어난 경우", () => {
        const flat = [{ ...wide[0], points: [{ x: 0, y: 0 }, { x: 2, y: 1 }] }];
        const f = pointUnitFrame(flat, 0, true)!;
        expect(f.maxX).toBe(POINT_FRAME.forward);
        expect(f.maxY).toBe(POINT_FRAME.maxY);
    });

    it("빈 목록은 창이 없다", () => {
        expect(pointUnitFrame([], 0.01)).toBeNull();
    });
});

describe("splitAtX — 타점 이후 구간 가르기", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 12 }, { x: 30, y: 8 }];

    it("경계점은 양쪽에 포함된다 — 실선과 점선이 그 점에서 이어져 보인다", () => {
        const { past, future } = splitAtX(pts, 10);
        expect(past.map((p) => p.x)).toEqual([0, 10]);
        expect(future.map((p) => p.x)).toEqual([10, 20, 30]);
    });

    it("첫 점에서 가르면 과거는 그 한 점뿐(선이 안 되는 건 호출측이 길이로 거른다)", () => {
        const { past, future } = splitAtX(pts, 0);
        expect(past).toHaveLength(1);
        expect(future).toHaveLength(4);
    });
});

describe("decimate / decimateStep — 배율에 맞춘 점 솎기", () => {
    const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ x }));

    it("step 개마다 하나 — **끝점은 언제나 남는다**(잘리면 선이 짧아 보인다)", () => {
        expect(decimate(pts, 3).map((p) => p.x)).toEqual([0, 3, 6, 9]);
        expect(decimate(pts, 4).map((p) => p.x)).toEqual([0, 4, 8, 9]);
    });

    it("step ≤ 1 이거나 점이 2개 이하면 그대로 — 확대하면 저절로 원본으로 돌아온다", () => {
        expect(decimate(pts, 1)).toBe(pts);
        expect(decimate([{ x: 0 }, { x: 1 }], 5)).toHaveLength(2);
    });

    it("간격은 배율이 정한다 — 촘촘할수록 1에 수렴, 축소하면 커지되 상한이 있다", () => {
        expect(decimateStep(2, 1)).toBe(1); // 1분이 2px = 이미 충분히 벌어짐
        expect(decimateStep(0.25, 1)).toBe(4); // 1분이 0.25px → 넷 중 하나
        expect(decimateStep(0.0001, 1)).toBe(60); // 상한
        expect(decimateStep(0, 1)).toBe(1); // 퇴화 스케일 — 솎지 않는다
    });
});

describe("clipToX — 보이는 구간만(솎기의 나머지 절반)", () => {
    const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ x }));

    it("**양 끝을 한 점씩 더 물고** 자른다 — 경계에서 선이 짧게 끝나 보이지 않게", () => {
        expect(clipToX(pts, 3, 6).map((p) => p.x)).toEqual([2, 3, 4, 5, 6, 7]);
    });

    it("통째로 안에 있으면 원본 그대로(복사 안 함)", () => {
        expect(clipToX(pts, -5, 20)).toBe(pts);
    });

    it("구간이 한쪽으로 치우쳐도 끝을 잃지 않는다", () => {
        expect(clipToX(pts, -5, 2).map((p) => p.x)).toEqual([0, 1, 2, 3]);
        expect(clipToX(pts, 7, 20).map((p) => p.x)).toEqual([6, 7, 8, 9]);
    });

    it("구간 밖이면 가장 가까운 한 점(빈 배열이 아니다 — 선이 통째로 사라지면 안 된다)", () => {
        expect(clipToX(pts, 100, 200).map((p) => p.x)).toEqual([9]);
        expect(clipToX([], 0, 1)).toEqual([]);
    });
});

describe("yAtX — 호버 판독의 구간 선형 보간", () => {
    const pts = [{ x: -10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }];

    it("꼭짓점과 그 사이를 모두 준다", () => {
        expect(yAtX(pts, -10)).toBe(0);
        expect(yAtX(pts, -5)).toBeCloseTo(5);
        expect(yAtX(pts, 0)).toBe(10);
        expect(yAtX(pts, 5)).toBeCloseTo(5);
        expect(yAtX(pts, 10)).toBe(0);
    });

    it("범위 밖은 null — 끝점을 연장해 지어내지 않는다", () => {
        expect(yAtX(pts, -11)).toBeNull();
        expect(yAtX(pts, 11)).toBeNull();
        expect(yAtX([], 0)).toBeNull();
    });
});

describe("minuteAmountOf — 누적의 인접 차분이 곧 그 분의 거래대금", () => {
    const index = minuteIndexOf([540, 541, 542], (v) => v);
    const at = minuteAmountOf(index, [10, 30, 35]);

    it("차분을 낸다(첫 분은 누적 그대로)", () => {
        expect(at(540)).toBe(10);
        expect(at(541)).toBe(20);
        expect(at(542)).toBe(5);
    });

    it("없는 분은 null — 0(거래 없음)과 구분된다", () => {
        expect(at(999)).toBeNull();
    });
});

describe("amountRuns — 골격 선을 분 단위로 잘라 굵기 단계 런으로", () => {
    // 테스트용 단계 판정: 10 이상이면 2단계, 5 이상이면 1단계, 그 아래는 0(구간 아래).
    const levelOf = (won: number): number => (won >= 10 ? 2 : won >= 5 ? 1 : LEVEL_QUIET);
    /** 분 → 거래대금. 543분에만 20 이 터지고 나머지는 1. */
    const at = (m: number): number | null => (m < 540 || m > 546 ? null : m === 543 ? 20 : 1);

    it("피벗 사이 직선을 분마다 자르고 y 는 선형 보간 — 형태는 안 바뀌고 굵기 해상도만 오른다", () => {
        const runs = amountRuns([{ x: 540, y: 0 }, { x: 546, y: 6 }], 0, at, levelOf);
        // 조용한 구간 → 스파이크(543분) → 다시 조용 = 런 3개(같은 단계는 합쳐진다)
        expect(runs.map((r) => r.level)).toEqual([LEVEL_QUIET, 2, LEVEL_QUIET]);
        expect(runs[0].points).toEqual([{ x: 540, y: 0 }, { x: 541, y: 1 }, { x: 542, y: 2 }]); // 기울기 1 그대로
        expect(runs[1].points).toEqual([{ x: 542, y: 2 }, { x: 543, y: 3 }]); // 543분 봉 = 그 조각
        expect(runs[2].points[runs[2].points.length - 1]).toEqual({ x: 546, y: 6 });
    });

    it("**꼭짓점을 안 버린다** — 병합이 끝점만 옮기면 그 사이 꺾임이 사라져 골격이 현으로 뭉개진다", () => {
        // 540→543 상승, 543→546 하락. 전부 조용해서 한 런으로 합쳐지지만 꺾임(543)은 남아야 한다.
        const quiet = (): number => 1;
        const runs = amountRuns([{ x: 540, y: 0 }, { x: 543, y: 9 }, { x: 546, y: 0 }], 0, quiet, levelOf);
        expect(runs).toHaveLength(1);
        expect(runs[0].points).toContainEqual({ x: 543, y: 9 }); // 이게 빠지면 (540,0)→(546,0) 직선이 된다
        expect(runs[0].points[0]).toEqual({ x: 540, y: 0 });
        expect(runs[0].points[runs[0].points.length - 1]).toEqual({ x: 546, y: 0 });
    });

    it("**스파이크가 평균에 안 묻힌다** — 이게 선분 평균을 버린 이유", () => {
        const runs = amountRuns([{ x: 540, y: 0 }, { x: 546, y: 6 }], 0, at, levelOf);
        expect(runs.some((r) => r.level === 2)).toBe(true); // 6분 평균이면 (5×1+20)/6 ≈ 4.2 → 구간 아래가 됐을 값
        const hot = runs.find((r) => r.level === 2)!;
        expect(hot.maxAmount).toBe(20); // 라벨이 쓰는 최대
        expect(hot.maxAt).toEqual({ x: 543, y: 3 }); // 라벨이 붙는 자리 = **터진 그 분**(런 중점이 아니라)
    });

    it("타점 정규화 좌표(x 는 상대분)도 baseT 로 벽시계를 찾고, x 는 상대 그대로 낸다", () => {
        const abs = amountRuns([{ x: 540, y: 0 }, { x: 546, y: 6 }], 0, at, levelOf);
        const rel = amountRuns([{ x: -3, y: 0 }, { x: 3, y: 6 }], 543, at, levelOf);
        expect(rel.map((r) => r.level)).toEqual(abs.map((r) => r.level));
        expect(rel[0].points[0].x).toBe(-3); // 좌표계는 그 선의 것을 유지한다
    });

    it("분봉이 없는 구간은 **재료 없음**으로 — 조용한 것과 구분된다(굵기도 갈린다)", () => {
        const runs = amountRuns([{ x: 600, y: 0 }, { x: 603, y: 3 }], 0, at, levelOf);
        expect(runs.map((r) => r.level)).toEqual([LEVEL_MISSING]);
    });

    it("길이 0·역방향 구간은 건너뛴다(0으로 나누지 않는다)", () => {
        expect(amountRuns([{ x: 540, y: 0 }, { x: 540, y: 5 }], 0, at, levelOf)).toEqual([]);
    });

    it("점이 하나면 선이 아니다", () => {
        expect(amountRuns([{ x: 540, y: 0 }], 0, at, levelOf)).toEqual([]);
    });
});

describe("segmentIndexOf — 앵커 피벗이 나누는 구간", () => {
    const b = [540, 600, 660]; // 두 구간: [540,600] · [600,660]

    it("경계 안의 분은 그 구간에", () => {
        expect(segmentIndexOf(b, 540)).toBe(0);
        expect(segmentIndexOf(b, 599)).toBe(0);
        expect(segmentIndexOf(b, 601)).toBe(1);
    });

    it("경계 자체는 **앞 구간**에 든다 — 두 구간이 한 분을 겹쳐 갖지 않게", () => {
        expect(segmentIndexOf(b, 600)).toBe(0);
    });

    it("마지막 경계는 마지막 구간에 — 끝점이 자기 자리를 잃지 않게", () => {
        expect(segmentIndexOf(b, 660)).toBe(1);
        expect(segmentIndexOf(b, 999)).toBe(1);
    });

    it("첫 경계 앞은 −1(구간 밖)", () => {
        expect(segmentIndexOf(b, 500)).toBe(-1);
    });
});

describe("pickAmountLabels — 선×세그먼트당 하나 → 선×x 격자(경쟁은 종목 안에서만)", () => {
    const c = (group: string, seg: number, x: number, value: number, mark: string) => ({ group, seg, x, value, mark });

    it("한 선이 한 세그먼트에서 여러 개를 못 낸다 — 급등 구간이 그 선의 라벨을 독차지하던 문제", () => {
        const got = pickAmountLabels([c("A", 0, 0, 10, "a1"), c("A", 0, 500, 99, "a2"), c("A", 0, 1000, 5, "a3")], 52);
        expect(got.map((g) => g.mark)).toEqual(["a2"]);
    });

    it("세그먼트가 다르면 같은 선도 각각 하나씩", () => {
        const got = pickAmountLabels([c("A", 0, 0, 10, "a0"), c("A", 1, 500, 5, "a1")], 52);
        expect(got.map((g) => g.mark).sort()).toEqual(["a0", "a1"]);
    });

    it("**다른 종목끼리는 안 겨룬다** — 7종목이면 한 세그먼트에 7개가 다 남아야 한다(사용자 확정)", () => {
        // 같은 x 칸에 일곱 종목이 몰려도 전부 살아남는다. 탈락시키면 그 종목의 대금이 화면에서 사라진다.
        const seven = ["A", "B", "C", "D", "E", "F", "G"].map((g, i) => c(g, 0, 10 + i, (i + 1) * 10, g));
        expect(pickAmountLabels(seven, 52)).toHaveLength(7);
    });

    it("축소로 세그먼트가 붙으면 **그 선의** 이웃 세그먼트끼리 합쳐진다", () => {
        const near = [c("A", 0, 0, 10, "a0"), c("A", 1, 30, 3, "a1")];
        const far = near.map((n) => ({ ...n, x: n.x * 5 }));
        expect(pickAmountLabels(near, 52).map((g) => g.mark)).toEqual(["a0"]); // 큰 쪽이 대표
        expect(pickAmountLabels(far, 52)).toHaveLength(2); // 확대하면 둘 다
    });

    it("빈 입력은 빈 출력", () => {
        expect(pickAmountLabels([], 52)).toEqual([]);
    });
});

describe("spreadByY — 겹치는 라벨은 탈락이 아니라 이동", () => {
    const p = (x: number, y: number, group: string) => ({ x, y, group });

    it("멀리 떨어져 있으면 제자리 그대로", () => {
        const got = spreadByY([p(0, 0, "a"), p(0, 100, "b")], 52, 12);
        expect(got.map((g) => g.labelY)).toEqual([0, 100]);
    });

    it("붙어 있으면 최소 간격까지 벌린다 — 개수는 안 줄어든다", () => {
        const got = spreadByY([p(0, 50, "a"), p(0, 52, "b"), p(0, 54, "c")], 52, 12);
        expect(got).toHaveLength(3);
        const ys = got.map((g) => g.labelY).sort((m, n) => m - n);
        expect(ys[1] - ys[0]).toBeCloseTo(12);
        expect(ys[2] - ys[1]).toBeCloseTo(12);
    });

    it("무리 전체가 원래 중심에 남는다 — 아래로만 밀리면 원 자리에서 통째로 떨어진다", () => {
        const items = [p(0, 50, "a"), p(0, 52, "b"), p(0, 54, "c")];
        const got = spreadByY(items, 52, 12);
        const mean = (v: number[]): number => v.reduce((s, n) => s + n, 0) / v.length;
        expect(mean(got.map((g) => g.labelY))).toBeCloseTo(mean(items.map((i) => i.y)));
    });

    it("가로로 먼 것끼리는 안 다툰다 — 겹칠 수 없는 것을 벌리면 자리만 낭비한다", () => {
        const got = spreadByY([p(0, 50, "a"), p(500, 50, "b")], 52, 12);
        expect(got.map((g) => g.labelY)).toEqual([50, 50]);
    });

    it("순서를 안 뒤집는다 — 위에 있던 게 아래로 가면 지시선이 엇갈린다", () => {
        const got = spreadByY([p(0, 54, "c"), p(0, 50, "a"), p(0, 52, "b")], 52, 12);
        const byGroup = new Map(got.map((g) => [g.group, g.labelY]));
        expect(byGroup.get("a")!).toBeLessThan(byGroup.get("b")!);
        expect(byGroup.get("b")!).toBeLessThan(byGroup.get("c")!);
    });
});

describe("lineOpacity / dimOpacity", () => {
    it("개수가 늘수록 옅어진다 — 겹친 그림이 밀도 지도가 되도록", () => {
        expect(lineOpacity(10)).toBeGreaterThan(lineOpacity(100));
        expect(lineOpacity(100)).toBeGreaterThan(lineOpacity(1000));
    });

    it("소수여도 과하게 진하지 않고(기본은 흐리게 — 사용자 확정), 바닥 아래로도 안 내려간다", () => {
        expect(lineOpacity(1)).toBeLessThanOrEqual(0.45);
        expect(lineOpacity(100000)).toBeGreaterThanOrEqual(0.06);
    });

    it("흐림은 언제나 기본보다 옅다 — 고정값이면 개수가 많을 때 역전된다", () => {
        for (const n of [5, 50, 500, 5000]) expect(dimOpacity(n)).toBeLessThan(lineOpacity(n));
    });
});

describe("lineVisual", () => {
    const sel = (...keys: string[]): ReadonlySet<string> => new Set(keys);
    const none = { selected: sel(), hovered: null, group: null };

    it("아무것도 강조 안 됐으면 전부 base — 흐리지 않다", () => {
        expect(lineVisual("a", none)).toEqual({ role: "base", width: 1.25, dim: false, recede: false });
    });

    it("선택과 호버는 **동시에** 산다 — 호버가 선택을 밀어내지 않는다", () => {
        const ctx = { selected: sel("a"), hovered: "b", group: null };
        expect(lineVisual("a", ctx).role).toBe("selected");
        expect(lineVisual("b", ctx).role).toBe("hovered");
        expect(lineVisual("c", ctx).dim).toBe(true);
    });

    it("다중 선택 — 집합의 전원이 selected 역할을 받는다", () => {
        const ctx = { selected: sel("a", "b", "c"), hovered: null, group: null };
        for (const k of ["a", "b", "c"]) expect(lineVisual(k, ctx).role).toBe("selected");
        expect(lineVisual("z", ctx).dim).toBe(true);
    });

    it("선택 안에서 호버된 것은 더 굵다 — 무리 중 하나를 짚는 손짓이 보인다", () => {
        const ctx = { selected: sel("a", "b"), hovered: "a", group: null };
        expect(lineVisual("a", ctx).width).toBeGreaterThan(lineVisual("b", ctx).width);
    });

    it("그룹이 호버보다 위 — 목록 행에 손을 올려도 그 선의 **색이 안 바뀐다**", () => {
        // 색이 바뀌면 정작 색으로 짝을 찾던 그 순간에 목록↔그림 대응이 끊긴다. 대신 굵기로 답한다.
        const ctx = { selected: sel(), hovered: "b", group: new Set(["b", "c"]) };
        expect(lineVisual("b", ctx).role).toBe("group");
        expect(lineVisual("b", ctx).width).toBeGreaterThan(lineVisual("c", ctx).width);
    });

    it("선택은 그룹보다 위 — 붙잡아 둔 것은 무리에 섞이지 않는다", () => {
        const ctx = { selected: sel("a"), hovered: null, group: new Set(["a", "b"]) };
        expect(lineVisual("a", ctx).role).toBe("selected");
        expect(lineVisual("b", ctx).role).toBe("group");
    });

    it("그룹만 켜져도 나머지는 흐려진다", () => {
        const ctx = { selected: sel(), hovered: null, group: new Set(["a"]) };
        expect(lineVisual("z", ctx).dim).toBe(true);
        expect(lineVisual("a", ctx).dim).toBe(false);
    });

    it("무리 안에서 하나를 짚으면 나머지 무리는 물러난다 — 목록 훑기에서 짚은 것만 앞에 선다", () => {
        const ctx = { selected: sel(), hovered: "b", group: new Set(["a", "b", "c"]) };
        expect(lineVisual("b", ctx).recede).toBe(false); // 짚은 것
        expect(lineVisual("a", ctx).recede).toBe(true);
        expect(lineVisual("c", ctx).recede).toBe(true);
        // 물러남은 역할·색을 안 바꾼다 — 목록↔그림을 잇는 끈은 색이다.
        expect(lineVisual("a", ctx).role).toBe("group");
    });

    it("다중 선택에서도 같은 규칙 — 붙잡은 무리 중 짚은 하나만 앞", () => {
        const ctx = { selected: sel("a", "b"), hovered: "a", group: null };
        expect(lineVisual("a", ctx).recede).toBe(false);
        expect(lineVisual("b", ctx).recede).toBe(true);
    });

    it("아무것도 안 짚었으면 무리 전원이 앞 — 그룹을 켜기만 했을 때 다 같이 보인다", () => {
        const ctx = { selected: sel(), hovered: null, group: new Set(["a", "b"]) };
        expect(lineVisual("a", ctx).recede).toBe(false);
        expect(lineVisual("b", ctx).recede).toBe(false);
    });

    it("무리 밖은 물러남이 아니라 흐림이다 — 두 상태를 겹쳐 쓰지 않는다", () => {
        const ctx = { selected: sel("a"), hovered: "a", group: null };
        expect(lineVisual("z", ctx)).toMatchObject({ role: "base", dim: true, recede: false });
    });

    it("빈 그룹은 강조가 아니다 — 목록을 닫은 직후 전부 흐려지는 걸 막는다", () => {
        expect(lineVisual("a", { selected: sel(), hovered: null, group: new Set() }).dim).toBe(false);
    });
});

describe("keysInRect — Ctrl+드래그 사각 선택(라벨 지점 기준)", () => {
    // 화면 좌표 항등 스케일로 판정만 본다.
    const id = (v: number): number => v;
    const shape = (key: string, pts: [number, number][]) =>
        ({ key, chartKey: key, stockCode: "005930", date: "2026-07-02", basePrice: 100, baseRate: 0, baseT: 0, points: pts.map(([x, y]) => ({ x, y })) });

    it("**라벨 지점**(앵커 반대 끝)이 든 것만 잡힌다 — 선이 지나가는 것으론 안 잡힌다(정밀 선택)", () => {
        // 기준 last → 라벨은 첫 점. a 라벨(10,10)은 사각 안, b 는 선이 사각을 지나가도 라벨(200,200)이 밖.
        const a = shape("a", [[10, 10], [300, 300]]);
        const b = shape("b", [[200, 200], [30, 30]]);
        expect(keysInRect([a, b], "last", id, id, { x0: 0, y0: 0, x1: 60, y1: 60 })).toEqual(["a"]);
        // 기준 first → 라벨이 마지막 점으로 바뀐다: 이제 b(30,30)가 잡히고 a(300,300)는 밖.
        expect(keysInRect([a, b], "first", id, id, { x0: 0, y0: 0, x1: 60, y1: 60 })).toEqual(["b"]);
    });

    it("뒤집힌 드래그(오른쪽→왼쪽)도 같은 사각이다", () => {
        const a = shape("a", [[10, 10], [50, 40]]);
        expect(keysInRect([a], "last", id, id, { x0: 60, y0: 60, x1: 0, y1: 0 })).toEqual(["a"]);
    });
});

describe("labelPointOf / clusterLabels", () => {
    it("라벨은 앵커 반대쪽 끝에 붙는다 — 앵커 쪽은 전부 한 점에 모인다", () => {
        expect(labelPointOf(normalizeSkeleton(pivots, "last", owner)!, "last").x).toBe(-8); // 왼쪽 끝
        expect(labelPointOf(normalizeSkeleton(pivots, "first", owner)!, "first").x).toBe(8); // 오른쪽 끝
    });

    it("같은 칸에 든 것들이 하나로 묶인다", () => {
        const c = clusterLabels([
            { key: "a", x: 10, y: 10 },
            { key: "b", x: 20, y: 12 },
            { key: "c", x: 400, y: 200 },
        ], 92, 18);
        expect(c).toHaveLength(2);
        expect(c[0].members).toEqual(["a", "b"]);
        expect(c[1].members).toEqual(["c"]);
    });

    it("대표 위치는 첫 멤버 자리 — 중심이면 멤버가 드나들 때마다 라벨이 흔들린다", () => {
        expect(clusterLabels([{ key: "a", x: 10, y: 10 }, { key: "b", x: 20, y: 12 }], 92, 18)[0]).toMatchObject({ x: 10, y: 10 });
    });

    it("좌표가 벌어지면(확대) 칸이 쪼개진다 — 숨김이 아니라 압축이라는 성질", () => {
        const near = [{ key: "a", x: 10, y: 10 }, { key: "b", x: 30, y: 10 }];
        const far = near.map((a) => ({ ...a, x: a.x * 8 }));
        expect(clusterLabels(near, 92, 18)).toHaveLength(1);
        expect(clusterLabels(far, 92, 18)).toHaveLength(2);
    });
});

describe("d3 스케일과의 조합", () => {
    it("범위가 0폭이어도 가운데로 접힌다(0으로 나누지 않는다)", () => {
        // d3-scale 은 domain 폭이 0이면 range 중앙 상수를 낸다 — 손으로 짜던 가드가 여기 흡수됐다.
        expect(scaleLinear().domain([3, 3]).range([0, 100])(3)).toBe(50);
    });

    it("SVG points 문자열을 만든다", () => {
        const n = normalizeSkeleton(pivots, "first", owner)!;
        const b = overlayBounds([n])!;
        const x = scaleLinear().domain([b.minX, b.maxX]).range([0, 80]);
        const y = scaleLinear().domain([b.minY, b.maxY]).range([50, 0]); // y 뒤집기 = range 역순
        expect(polylinePoints(n, x, y)).toBe("0.00,50.00 50.00,0.00 80.00,30.00");
    });
});
