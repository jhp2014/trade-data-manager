// 자리 계산 규약 — jsdom 은 레이아웃이 없어 화면 테스트로는 뒤집기를 잴 수 없다. 계산을 순수 함수로 떼어 여기서 잰다.
import { describe, expect, it } from "vitest";
import { EDGE, decide, position, type PlaceOpts, type Rect } from "./place.js";

const VP = { width: 1000, height: 800 };
const below: PlaceOpts = { side: "below", align: "start", gap: 6 };
const btn = (left: number, top: number): Rect => ({ left, top, right: left + 60, bottom: top + 20 });

describe("세로 — 처음 한 번 고른다", () => {
    it("아래에 들어가면 아래", () => {
        const p = decide(btn(100, 100), { width: 200, height: 300 }, VP, below);
        expect(p.v).toBe("below");
        expect(position(btn(100, 100), { width: 200, height: 300 }, VP, below, p)).toMatchObject({ top: 126 });
    });

    it("아래가 모자라고 위에 들어가면 위 — 아랫변을 앵커에 붙여 위로 자란다", () => {
        const a = btn(100, 700);
        const p = decide(a, { width: 200, height: 300 }, VP, below);
        expect(p.v).toBe("above");
        const pos = position(a, { width: 200, height: 300 }, VP, below, p);
        expect(pos.bottomLine).toBe(694);
        expect(pos.maxHeight).toBe(694 - EDGE);
    });

    it("둘 다 모자라면 넓은 쪽 + 남는 높이만큼 maxHeight — 트리거를 덮지 않는다", () => {
        const a = btn(100, 300); // 위 286, 아래 466
        const p = decide(a, { width: 200, height: 700 }, VP, below);
        expect(p.v).toBe("below");
        expect(position(a, { width: 200, height: 700 }, VP, below, p).maxHeight).toBe(VP.height - EDGE - 326);
    });

    it("선호가 위(작업표시줄)면 위부터 본다", () => {
        expect(decide(btn(100, 400), { width: 200, height: 100 }, VP, { ...below, side: "above" }).v).toBe("above");
    });
});

describe("결정은 고정 — 판이 자라도 안 뒤집힌다", () => {
    it("아래로 연 판이 공간보다 커져도 아래 그대로, maxHeight 로 흡수", () => {
        const a = btn(100, 500);
        const p = decide(a, { width: 200, height: 100 }, VP, below);
        const grown = position(a, { width: 200, height: 900 }, VP, below, p);
        expect(grown.top).toBe(526);
        expect(grown.maxHeight).toBe(VP.height - EDGE - 526);
    });
});

describe("가로", () => {
    it("start 가 오른쪽으로 넘치면 end(오른끝을 앵커 오른끝에)", () => {
        const a = btn(900, 100);
        const p = decide(a, { width: 300, height: 100 }, VP, below);
        expect(p.h).toBe("end");
        expect(position(a, { width: 300, height: 100 }, VP, below, p).left).toBe(960 - 300);
    });

    it("어느 쪽도 안 되면 화면 안으로 clamp", () => {
        const a = btn(500, 100);
        const p = decide(a, { width: 700, height: 100 }, VP, below);
        const pos = position(a, { width: 700, height: 100 }, VP, below, p);
        expect(pos.left).toBeGreaterThanOrEqual(EDGE);
        expect(pos.left + 700).toBeLessThanOrEqual(VP.width - EDGE);
    });
});
