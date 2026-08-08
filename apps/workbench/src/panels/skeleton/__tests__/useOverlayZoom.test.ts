import { describe, it, expect } from "vitest";
import { AXIS_IDENTITY, DRAG_ZOOM_RATE, applyGesture, panAxis, zoomAxisAt, type AxisTransform } from "../useOverlayZoom.js";

// 축별 확대의 **손짓 규칙**(applyGesture)과 축 변환 산술 — DOM 없이 여기서 굳힌다.
// (0.5 는 이 파일의 클램프 검증용 값 — 실제 기본 하한은 0.05 다. 기본 창 밖을 축소로 볼 수 있어야 한다.)
const EXTENT = [0.5, 60] as const;
const ident = { x: AXIS_IDENTITY, y: AXIS_IDENTITY };
const delta = (over: Partial<{ dk: number; dx: number; dy: number; px: number; py: number }>) =>
    ({ dk: 1, dx: 0, dy: 0, px: 0, py: 0, ...over });
const origin = { x: 0, y: 0 };

/** 화면 px p 가 변환 a 아래에서 가리키는 원좌표(스케일 range 기준) — 고정점 검증용 역산. */
const invert = (a: AxisTransform, p: number): number => (p - a.t) / a.k;

describe("zoomAxisAt — 포인터 고정 확대", () => {
    it("포인터 지점의 원좌표가 확대 전후 같다 — 커서 중심이라는 뜻 그 자체", () => {
        let a = AXIS_IDENTITY;
        const p = 137;
        const before = invert(a, p);
        a = zoomAxisAt(a, 2.5, p, EXTENT);
        expect(invert(a, p)).toBeCloseTo(before);
        a = zoomAxisAt(a, 0.4, p, EXTENT);
        expect(invert(a, p)).toBeCloseTo(before);
    });

    it("배율이 extent 를 못 넘는다 — 상한에 닿으면 그 이상은 무시(이동도 생기지 않는다)", () => {
        const at = zoomAxisAt({ k: 60, t: -100 }, 3, 50, EXTENT);
        expect(at).toEqual({ k: 60, t: -100 });
        const low = zoomAxisAt({ k: 0.5, t: 20 }, 0.1, 50, EXTENT);
        expect(low).toEqual({ k: 0.5, t: 20 });
    });

    it("상한 근처의 부분 확대 — 클램프된 만큼만 적용된다(고정점은 유지)", () => {
        const a: AxisTransform = { k: 30, t: 0 };
        const p = 100;
        const before = invert(a, p);
        const next = zoomAxisAt(a, 4, p, EXTENT); // 120 이 아니라 60 에서 멈춘다
        expect(next.k).toBe(60);
        expect(invert(next, p)).toBeCloseTo(before);
    });
});

describe("panAxis", () => {
    it("배율은 그대로, 이동만 누적된다", () => {
        expect(panAxis({ k: 3, t: 10 }, -25)).toEqual({ k: 3, t: -15 });
    });
});

describe("applyGesture — 영역별 손짓 규칙", () => {
    it("본문 휠(dk≠1)은 **가로만** 확대한다 — 세로는 그대로(사용자 확정: 본문 휠=x만)", () => {
        const r = applyGesture(ident, "body", delta({ dk: 2, px: 80, py: 40 }), origin, EXTENT);
        expect(r.x.k).toBe(2);
        expect(r.y).toEqual(AXIS_IDENTITY);
        expect(invert(r.x, 80)).toBeCloseTo(80); // 커서 x 고정
    });

    it("본문 드래그(dk=1)는 양축 이동", () => {
        const r = applyGesture(ident, "body", delta({ dx: 12, dy: -7 }), origin, EXTENT);
        expect(r.x).toEqual({ k: 1, t: 12 });
        expect(r.y).toEqual({ k: 1, t: -7 });
    });

    it("x 스트립 휠은 가로 확대(커서 중심) — 세로 불변", () => {
        const r = applyGesture(ident, "x", delta({ dk: 1.5, px: 200 }), origin, EXTENT);
        expect(r.x.k).toBe(1.5);
        expect(invert(r.x, 200)).toBeCloseTo(200);
        expect(r.y).toEqual(AXIS_IDENTITY);
    });

    it("x 스트립 드래그는 가로 확대 — 오른쪽(+dx)으로 당기면 확대, 중심은 제스처 **시작점**", () => {
        const start = { x: 150, y: 0 };
        const r = applyGesture(ident, "x", delta({ dx: 100 }), start, EXTENT);
        expect(r.x.k).toBeCloseTo(Math.exp(100 * DRAG_ZOOM_RATE));
        expect(invert(r.x, 150)).toBeCloseTo(150); // 시작점 고정
        const back = applyGesture(ident, "x", delta({ dx: -100 }), start, EXTENT);
        expect(back.x.k).toBeLessThan(1); // 왼쪽으로 당기면 축소
        expect(r.y).toEqual(AXIS_IDENTITY);
    });

    it("y 스트립 휠은 세로 확대 — 가로 불변", () => {
        const r = applyGesture(ident, "y", delta({ dk: 3, py: 90 }), origin, EXTENT);
        expect(r.y.k).toBe(3);
        expect(invert(r.y, 90)).toBeCloseTo(90);
        expect(r.x).toEqual(AXIS_IDENTITY);
    });

    it("y 스트립 드래그는 세로 확대 — 위(−dy)로 당기면 확대(LWC 가격축 손짓)", () => {
        const start = { x: 0, y: 120 };
        const up = applyGesture(ident, "y", delta({ dy: -100 }), start, EXTENT);
        expect(up.y.k).toBeCloseTo(Math.exp(100 * DRAG_ZOOM_RATE));
        expect(invert(up.y, 120)).toBeCloseTo(120);
        const down = applyGesture(ident, "y", delta({ dy: 100 }), start, EXTENT);
        expect(down.y.k).toBeLessThan(1);
        expect(up.x).toEqual(AXIS_IDENTITY);
    });

    it("델타는 누적된다 — 이동 후 확대해도 그 지점이 고정된다(축별 독립 상태)", () => {
        let axes = ident;
        axes = applyGesture(axes, "body", delta({ dx: 30, dy: 10 }), origin, EXTENT);
        const p = 100;
        const before = invert(axes.x, p);
        axes = applyGesture(axes, "body", delta({ dk: 2, px: p }), origin, EXTENT);
        expect(invert(axes.x, p)).toBeCloseTo(before);
        expect(axes.y).toEqual({ k: 1, t: 10 }); // 세로는 이동만 남는다
    });
});
