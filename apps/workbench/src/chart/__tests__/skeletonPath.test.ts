import { describe, it, expect } from "vitest";
import { SkeletonPath, type SkeletonPointSpec } from "../skeletonPath.js";

// 캔버스 호출 기록기 — 실제 픽셀 대신 "무엇을 그렸나"를 본다.
// 이 파일이 막는 회귀: 옛 LineSeries 구현은 시각당 점 하나만 받아 ① 점 1개면 아무것도 안 그리고
// ② 같은 캔들의 두 점 중 하나를 뭉갰다(사용자 보고). 둘 다 "찍었는데 화면에 변화가 없다"로 나타난다.
interface Call { op: string; args: number[] }

function mockTarget(): { target: { useBitmapCoordinateSpace(f: (s: never) => void): void }; calls: Call[] } {
    const calls: Call[] = [];
    const ctx = {
        save: () => calls.push({ op: "save", args: [] }),
        restore: () => calls.push({ op: "restore", args: [] }),
        beginPath: () => calls.push({ op: "beginPath", args: [] }),
        moveTo: (x: number, y: number) => calls.push({ op: "moveTo", args: [x, y] }),
        lineTo: (x: number, y: number) => calls.push({ op: "lineTo", args: [x, y] }),
        stroke: () => calls.push({ op: "stroke", args: [] }),
        fill: () => calls.push({ op: "fill", args: [] }),
        arc: (x: number, y: number, r: number) => calls.push({ op: "arc", args: [x, y, r] }),
        fillText: (t: string, x: number, y: number) => calls.push({ op: `text:${t}`, args: [x, y] }),
        measureText: () => ({ width: 6 }),
        setLineDash: () => undefined,
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
        font: "",
        textBaseline: "",
        textAlign: "",
    };
    return {
        calls,
        target: {
            useBitmapCoordinateSpace(f: (s: never) => void): void {
                f({ context: ctx, bitmapSize: { width: 1000, height: 500 }, horizontalPixelRatio: 1, verticalPixelRatio: 1 } as never);
            },
        },
    };
}

/** 날짜→x 는 사전순 인덱스×10, 가격→y 는 (10000-price)/10 로 흉내(값이 클수록 위=작은 y). */
function draw(points: SkeletonPointSpec[]): Call[] {
    const dates = [...new Set(points.map((p) => p.time))].sort();
    const path = new SkeletonPath("#d946ef");
    path.attached({
        chart: { timeScale: () => ({ timeToCoordinate: (t: string) => dates.indexOf(t) * 10 }) } as never,
        series: { priceToCoordinate: (p: number) => (10000 - p) / 10 } as never,
        requestUpdate: () => undefined,
    });
    path.setPoints(points);
    path.updateAllViews();
    const { target, calls } = mockTarget();
    path.paneViews()[0].renderer().draw(target as never);
    return calls;
}

const dots = (calls: Call[]): { x: number; y: number }[] => calls.filter((c) => c.op === "arc").map((c) => ({ x: c.args[0], y: c.args[1] }));
const segs = (calls: Call[]): { x: number; y: number }[] => calls.filter((c) => c.op === "moveTo" || c.op === "lineTo").map((c) => ({ x: c.args[0], y: c.args[1] }));

describe("SkeletonPath — 찍으면 반드시 화면에 나타난다", () => {
    it("점 하나만 찍어도 원이 그려진다 — 선이 없어도 입력됐다는 신호가 있어야 한다", () => {
        const calls = draw([{ time: "2026-06-10", price: 9000 }]);
        expect(dots(calls)).toEqual([{ x: 0, y: 100 }]);
        expect(segs(calls)).toEqual([]); // 이을 상대가 없으니 선분은 없다
        expect(calls.some((c) => c.op === "text:1")).toBe(true); // 순번도 함께
    });

    it("같은 캔들의 두 점(고→종)은 세로 선분으로 그려진다 — 시각으로 뭉개면 사라지던 자리", () => {
        const calls = draw([
            { time: "2026-06-10", price: 9500 }, // 고
            { time: "2026-06-10", price: 9000 }, // 종
        ]);
        const d = dots(calls);
        expect(d).toHaveLength(2); // 둘 다 남는다(옛 구현은 하나로 뭉갰다)
        expect(d[0].x).toBe(d[1].x); // 같은 캔들 = 같은 x
        expect(d[0].y).not.toBe(d[1].y); // 값이 달라 y 가 갈린다 → 수직 선분
        expect(segs(calls)).toEqual([{ x: 0, y: 50 }, { x: 0, y: 100 }]);
    });

    it("윗꼬리 슈팅 3점(시→고→종)이 한 캔들 안에서 전부 보인다", () => {
        const calls = draw([
            { time: "2026-06-10", price: 9000 },
            { time: "2026-06-10", price: 9600 },
            { time: "2026-06-10", price: 9100 },
        ]);
        expect(dots(calls)).toHaveLength(3);
        expect(new Set(dots(calls).map((p) => p.x)).size).toBe(1); // x 는 하나
        expect(new Set(dots(calls).map((p) => p.y)).size).toBe(3); // y 는 셋
    });

    it("여러 캔들은 꺾은선으로 이어지고 점마다 순번이 붙는다", () => {
        const calls = draw([
            { time: "2026-06-10", price: 9000 },
            { time: "2026-06-11", price: 9500 },
            { time: "2026-06-12", price: 9200 },
        ]);
        expect(segs(calls)).toEqual([{ x: 0, y: 100 }, { x: 10, y: 50 }, { x: 20, y: 80 }]);
        for (const n of ["text:1", "text:2", "text:3"]) expect(calls.some((c) => c.op === n)).toBe(true);
    });

    it("빈 골격은 아무것도 그리지 않는다(캔버스 상태도 안 건드린다)", () => {
        expect(draw([])).toEqual([]);
    });

    it("해소 안 되는 점은 건너뛰되 나머지는 그린다", () => {
        const path = new SkeletonPath("#d946ef");
        path.attached({
            chart: { timeScale: () => ({ timeToCoordinate: (t: string) => (t === "2026-06-11" ? null : 0) }) } as never,
            series: { priceToCoordinate: () => 100 } as never,
            requestUpdate: () => undefined,
        });
        path.setPoints([{ time: "2026-06-10", price: 9000 }, { time: "2026-06-11", price: 9500 }]);
        path.updateAllViews();
        const { target, calls } = mockTarget();
        path.paneViews()[0].renderer().draw(target as never);
        expect(dots(calls)).toHaveLength(1);
    });
});
