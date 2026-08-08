import { describe, it, expect } from "vitest";
import { scaleLinear } from "d3-scale";
import { normalizeSkeleton, absoluteSkeleton, pointSkeletons, overlayBounds, trimmedBounds, absoluteFrame, ABS_FRAME, dailyFrame, DAILY_FRAME, pointUnitFrame, POINT_FRAME_MARGIN, splitAtX, polylinePoints, pct, minutesOf, lineOpacity, dimOpacity, labelPointOf, clusterLabels, lineVisual, keysInRect } from "../skeletonOverlay.js";
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

describe("absoluteSkeleton — 분봉 절대 배치(전일 종가 대비)", () => {
    it("x 는 벽시계 그대로, y 는 전일 종가 대비 % — 몇 시에 몇 %였나가 남는다", () => {
        const n = absoluteSkeleton([{ t: 555, price: 110 }, { t: 570, price: 121 }], 100, owner)!;
        expect(n.points).toEqual([{ x: 555, y: 10.000000000000009 }, { x: 570, y: 20.999999999999996 }]);
        expect(n.baseT).toBe(0); // 타점 시각(벽시계 분)을 그대로 x 로 쓴다
        expect(n.basePrice).toBe(100); // 선(가격)도 전일 종가 대비 %로 얹힌다
    });

    it("전일 종가가 없으면 null — 분모를 지어내지 않는다", () => {
        expect(absoluteSkeleton([{ t: 555, price: 110 }, { t: 570, price: 121 }], undefined, owner)).toBeNull();
    });
});

describe("pointSkeletons — 분봉 정규화 = 타점 단위 재구성", () => {
    const chart = { key: "005930|2026-08-05", stockCode: "005930", date: "2026-08-05" };
    // 09:15 손 피벗 100 → 09:30 합성(타점 종가) 120 → 09:45 손 피벗 110.
    const mins: SkeletonWirePivot[] = [
        { t: 555, price: 100 },
        { t: 570, price: 120, synthetic: true },
        { t: 585, price: 110 },
    ];
    const pk = "005930|2026-08-05|09:30:00";

    it("선 하나 = 타점 하나 — 자기 시각 피벗이 원점(0,0), 과거는 왼쪽·미래는 오른쪽(splitIdx 뒤)", () => {
        const [l] = pointSkeletons(mins, [{ pk, time: "09:30:00" }], chart);
        expect(l).toMatchObject({ key: pk, chartKey: chart.key, time: "09:30:00", basePrice: 120, baseT: 570, splitIdx: 1 });
        expect(l.points.map((p) => p.x)).toEqual([-15, 0, 15]);
        expect(l.points[0].y).toBeCloseTo(pct(100, 120));
        expect(l.points[1].y).toBe(0);
        expect(l.points[2].y).toBeCloseTo(pct(110, 120));
    });

    it("타점 3개면 선 3개 — 같은 골격이 타점마다 자기 좌표계로 다시 선다", () => {
        const out = pointSkeletons(mins, [
            { pk: "a", time: "09:15:00" },
            { pk: "b", time: "09:30:00" },
            { pk: "c", time: "09:45:00" },
        ], chart);
        expect(out.map((l) => l.splitIdx)).toEqual([0, 1, 2]);
        expect(out.map((l) => l.points[l.splitIdx])).toEqual([
            { x: 0, y: 0 }, { x: 0, y: 0, synthetic: true }, { x: 0, y: 0 },
        ]);
    });

    it("synthetic 표시는 그대로 흐른다 — 속 빈 원 렌더가 이 값을 본다", () => {
        const [l] = pointSkeletons(mins, [{ pk, time: "09:30:00" }], chart);
        expect(l.points.map((p) => !!p.synthetic)).toEqual([false, true, false]);
    });

    it("자기 시각의 피벗이 없으면 그 타점은 건너뛴다 — 지어내지 않는다(합성 규칙상 원래 없을 수 없다)", () => {
        expect(pointSkeletons(mins, [{ pk: "x", time: "10:00:00" }], chart)).toEqual([]);
    });

    it("피벗 2개 미만이면 골격이 아니다", () => {
        expect(pointSkeletons([{ t: 570, price: 120 }], [{ pk, time: "09:30:00" }], chart)).toEqual([]);
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

describe("absoluteFrame — 절대 뷰 고정 프레임", () => {
    it("x 는 데이터 범위 ±15분, y 는 데이터와 무관하게 −5~+30% — 같은 %가 항상 같은 높이에 선다", () => {
        const a = absoluteSkeleton([{ t: 555, price: 110 }, { t: 600, price: 180 }], 100, owner)!; // +80% 이상치 포함
        const f = absoluteFrame([a])!;
        expect(f).toEqual({ minX: 555 - ABS_FRAME.padMinutes, maxX: 600 + ABS_FRAME.padMinutes, minY: -5, maxY: 30 });
    });

    it("빈 목록은 프레임이 없다", () => {
        expect(absoluteFrame([])).toBeNull();
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
        key: "k", chartKey: "c", stockCode: "005930", date: "2026-08-05", basePrice: 100, baseT: 0,
        points: [{ x: -90, y: -30 }, { x: 0, y: 0 }, { x: 120, y: 50 }],
    }];

    it("양의 쪽은 마진만(+10분·+5%) — 미래·상승은 창 밖으로 나가도 확대로 본다", () => {
        const f = pointUnitFrame(wide, 0)!;
        expect(f.maxX).toBe(POINT_FRAME_MARGIN.x);
        expect(f.maxY).toBe(POINT_FRAME_MARGIN.y);
    });

    it("음의 쪽은 데이터만큼 — 관심사가 타점 이전이라 과거·하락이 화면을 차지한다", () => {
        const f = pointUnitFrame(wide, 0)!;
        expect(f.minX).toBe(-90);
        expect(f.minY).toBe(-30);
    });

    it("미래 포함이면 양의 쪽도 데이터까지 — 타점 뒤로 어디까지 갔나를 한 창에서", () => {
        const f = pointUnitFrame(wide, 0, true)!;
        expect(f.maxX).toBe(120);
        expect(f.maxY).toBe(50);
        expect(f.minX).toBe(-90); // 음의 쪽은 그대로
    });

    it("미래 포함이어도 마진 아래로는 안 좁아진다 — 데이터가 원점에서 안 벗어난 경우", () => {
        const flat = [{ ...wide[0], points: [{ x: 0, y: 0 }, { x: 2, y: 1 }] }];
        const f = pointUnitFrame(flat, 0, true)!;
        expect(f.maxX).toBe(POINT_FRAME_MARGIN.x);
        expect(f.maxY).toBe(POINT_FRAME_MARGIN.y);
    });

    it("데이터가 원점 근처뿐이어도 최소 마진은 남는다 — 창이 0폭으로 접히지 않게", () => {
        const flat = [{ ...wide[0], points: [{ x: -1, y: -0.5 }, { x: 0, y: 0 }] }];
        const f = pointUnitFrame(flat, 0)!;
        expect(f.minX).toBe(-POINT_FRAME_MARGIN.x);
        expect(f.minY).toBe(-POINT_FRAME_MARGIN.y);
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
        expect(lineVisual("a", none)).toEqual({ role: "base", width: 1.25, dim: false });
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

    it("빈 그룹은 강조가 아니다 — 목록을 닫은 직후 전부 흐려지는 걸 막는다", () => {
        expect(lineVisual("a", { selected: sel(), hovered: null, group: new Set() }).dim).toBe(false);
    });
});

describe("keysInRect — Ctrl+드래그 사각 선택(라벨 지점 기준)", () => {
    // 화면 좌표 항등 스케일로 판정만 본다.
    const id = (v: number): number => v;
    const shape = (key: string, pts: [number, number][]) =>
        ({ key, chartKey: key, stockCode: "005930", date: "2026-07-02", basePrice: 100, baseT: 0, points: pts.map(([x, y]) => ({ x, y })) });

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
