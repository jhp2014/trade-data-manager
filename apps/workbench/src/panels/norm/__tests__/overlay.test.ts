import { describe, it, expect } from "vitest";
import { scaleLinear } from "d3-scale";
import { lineBox, boundsOverlap, dailyFrame, DAILY_FRAME, pointFrame, POINT_FRAME, splitAtX, polylinePoints, yAtX, decimate, decimateStep, clipToX, lineOpacity, dimOpacity, labelAnchorAt, lineVisual, minuteIndexOf, minuteAmountOf, pickAmountLabels, segmentIndexOf, type NormLine, type OverlayBounds } from "../overlay.js";

/** 정규화 선 하나(값 공간) — 경계·라벨 검사용 최소 빌더. */
const lineOf = (key: string, pts: [number, number][]): NormLine => ({
    key, chartKey: key, stockCode: "005930", date: "2026-08-05",
    basePrice: 100, baseRate: 0, baseT: 0,
    points: pts.map(([x, y]) => ({ x, y })),
});

describe("lineBox — 선 하나의 경계 상자", () => {
    it("점들의 최소·최대를 그대로 준다(0 을 억지로 안 넣는다 — 이건 척도가 아니라 판정 재료다)", () => {
        const b = lineBox(lineOf("a", [[0, 10], [5, 50], [8, 20]]))!;
        expect(b).toEqual({ minX: 0, maxX: 8, minY: 10, maxY: 50 });
    });

    it("점이 없으면 상자가 없다", () => {
        expect(lineBox(lineOf("a", []))).toBeNull();
    });
});

describe("boundsOverlap — 화면 밖 판정", () => {
    const view = { minX: 0, maxX: 10, minY: 0, maxY: 10 };

    it("겹치면 참", () => {
        expect(boundsOverlap({ minX: 5, maxX: 20, minY: 5, maxY: 20 }, view)).toBe(true);
    });

    it("가로는 걸쳐도 세로가 어긋나면 밖이다 — 두 축을 다 봐야 한다", () => {
        expect(boundsOverlap({ minX: 0, maxX: 10, minY: 40, maxY: 50 }, view)).toBe(false);
    });

    it("맞닿기만 해도 안으로 본다(경계에 걸친 선은 보인다)", () => {
        expect(boundsOverlap({ minX: 10, maxX: 20, minY: 10, maxY: 20 }, view)).toBe(true);
    });
});

describe("dailyFrame — 일봉 정규화 기본 창(상수)", () => {
    it("뒤로 60일·앞으로 10일, 세로는 −60~+40% — D(원점)가 오른쪽(옛 last 앵커 창의 승계)", () => {
        expect(dailyFrame()).toEqual({ minX: -DAILY_FRAME.back, maxX: DAILY_FRAME.forward, minY: -60, maxY: 40 });
    });
});

describe("pointFrame — 분봉 타점 정규화 기본 창(상수)", () => {
    it("타점 이전 60분·이후 10분·±20%p — **인자가 없다**(창이 항목을 따라 움직이면 비교가 깨진다)", () => {
        expect(pointFrame()).toEqual({ minX: -POINT_FRAME.back, maxX: POINT_FRAME.forward, minY: -20, maxY: 20 });
    });

    it("몇 번을 불러도 같은 창 — 미래 토글이 데이터까지 넓히던 옛 경로는 은퇴했다", () => {
        expect(pointFrame()).toEqual(pointFrame());
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

describe("minuteIndexOf — 스냅샷 하나에 소비자가 넷이라 배열 단위로 캐시한다", () => {
    const toMin = (v: number): number => v;

    it("같은 times 배열 + 같은 변환이면 **같은 맵**을 돌려준다 — 네 소비자가 색인을 나눠 쓴다", () => {
        const times = [540, 541, 542];
        expect(minuteIndexOf(times, toMin)).toBe(minuteIndexOf(times, toMin));
    });

    it("배열이 다르면(내용이 같아도) 새로 만든다 — 키는 값이 아니라 배열 자신이다", () => {
        expect(minuteIndexOf([540], toMin)).not.toBe(minuteIndexOf([540], toMin));
    });

    it("변환 함수가 갈리면 다시 만든다 — 낡은 변환의 색인을 돌려주지 않는다", () => {
        const times = [540, 541];
        const a = minuteIndexOf(times, toMin);
        const b = minuteIndexOf(times, (v) => v + 1);
        expect(b).not.toBe(a);
        expect(b.get(541)).toBe(0);
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

    it("무리 밖은 평소엔 흐림뿐 — 아무도 안 짚었으면 물러남은 안 켜진다", () => {
        const ctx = { selected: sel("a"), hovered: null, group: null };
        expect(lineVisual("z", ctx)).toMatchObject({ role: "base", dim: true, recede: false });
    });

    it("**딴 걸 짚으면 무리 밖도 같이 물러난다**(사용자 지적 — 겹쳤을 때 호버해도 남이 안 죽어서 잘 안 보였다)", () => {
        // 옛 규칙: base 는 dim 만 받고 recede 는 못 받아, 호버 여부와 무관하게 늘 같은 흐림이었다.
        // 이젠 recede 도 base 에 붙는다 — dim(늘 흐림)과 동시에 참일 수 있고, 렌더러가 recede 를
        // 먼저 봐서(우선순위가 계약) 호버 중엔 base 도 평소보다 한 단계 더 죽는다.
        const ctx = { selected: sel("a"), hovered: "a", group: null };
        expect(lineVisual("z", ctx)).toMatchObject({ role: "base", dim: true, recede: true });
    });

    it("빈 그룹은 강조가 아니다 — 목록을 닫은 직후 전부 흐려지는 걸 막는다", () => {
        expect(lineVisual("a", { selected: sel(), hovered: null, group: new Set() }).dim).toBe(false);
    });
});

describe("labelAnchorAt — 거터 칩이 가리키는 점", () => {
    // ── labelAnchorAt — 라벨은 **지금 보이는 창에서 선이 잘리는 자리**(사용자 확정: 줌·팬과 무관하게 손잡이가 남는다).
    const view: OverlayBounds = { minX: -60, maxX: 10, minY: -20, maxY: 20 };
    const path = [{ x: -80, y: -10 }, { x: -40, y: 0 }, { x: 0, y: 8 }];

    it("끝이 창 안이면 끝점 그대로 — 최신 쪽이 손잡이다", () => {
        expect(labelAnchorAt(path, view)).toEqual({ x: 0, y: 8 });
    });

    it("끝이 오른쪽 창 밖이면 오른쪽 가장자리에서 y 를 보간한다 — 잘리는 그 자리", () => {
        const long = [{ x: -20, y: 0 }, { x: 40, y: 30 }];
        const a = labelAnchorAt(long, view)!;
        expect(a.x).toBe(10);
        expect(a.y).toBeCloseTo(15); // (10 − (−20)) / 60 × 30
    });

    it("보간한 y 가 세로 창 밖이면 가장자리로 클램프 — 세로 확대로 잘린 선도 손잡이는 남는다", () => {
        const steep = [{ x: -20, y: 0 }, { x: 40, y: 300 }];
        expect(labelAnchorAt(steep, view)!.y).toBe(20);
        expect(labelAnchorAt([{ x: -5, y: 90 }, { x: 0, y: 100 }], view)!.y).toBe(20);
    });

    it("선이 x 창과 아예 안 겹치면 null — 화면에 없는 선의 라벨을 지어내지 않는다", () => {
        expect(labelAnchorAt([{ x: 20, y: 0 }, { x: 40, y: 5 }], view)).toBeNull();
        expect(labelAnchorAt([{ x: -200, y: 0 }, { x: -100, y: 5 }], view)).toBeNull();
        expect(labelAnchorAt([], view)).toBeNull();
    });
});

describe("d3 스케일과의 조합", () => {
    it("범위가 0폭이어도 가운데로 접힌다(0으로 나누지 않는다)", () => {
        // d3-scale 은 domain 폭이 0이면 range 중앙 상수를 낸다 — 손으로 짜던 가드가 여기 흡수됐다.
        expect(scaleLinear().domain([3, 3]).range([0, 100])(3)).toBe(50);
    });

    it("SVG points 문자열을 만든다", () => {
        const n: NormLine = {
            key: "k", chartKey: "k", stockCode: "005930", date: "2026-08-05",
            basePrice: 100, baseRate: 0, baseT: 0,
            points: [{ x: 0, y: 0 }, { x: 5, y: 50 }, { x: 8, y: 20 }],
        };
        const b = lineBox(n)!;
        const x = scaleLinear().domain([b.minX, b.maxX]).range([0, 80]);
        const y = scaleLinear().domain([b.minY, b.maxY]).range([50, 0]); // y 뒤집기 = range 역순
        expect(polylinePoints(n.points, x, y)).toBe("0.00,50.00 50.00,0.00 80.00,30.00");
    });
});
