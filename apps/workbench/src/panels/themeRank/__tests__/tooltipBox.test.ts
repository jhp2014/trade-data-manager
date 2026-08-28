import { describe, it, expect } from "vitest";
import { tooltipBoxOf, tooltipTextWidth, TOOLTIP_H } from "../tooltipBox.js";

const BOUNDS = { w: 600, h: 400 };

describe("tooltipBoxOf — 경계에서 잘리지 않는다", () => {
    it("평소엔 커서 오른쪽 위", () => {
        const b = tooltipBoxOf({ x: 100, y: 100 }, "abc", BOUNDS);
        expect(b.x).toBe(110);
        expect(b.y).toBeLessThan(100);
    });

    it("오른쪽 끝에선 왼쪽으로 플립", () => {
        const b = tooltipBoxOf({ x: 590, y: 100 }, "삼성전자 · 등락 3위 · 대금 7위", BOUNDS);
        expect(b.x + b.w).toBeLessThanOrEqual(BOUNDS.w);
        expect(b.x + b.w).toBeLessThan(590); // 커서 왼쪽에 선다
    });

    it("위쪽 끝에선 아래로 플립", () => {
        const b = tooltipBoxOf({ x: 100, y: 5 }, "abc", BOUNDS);
        expect(b.y).toBeGreaterThan(5);
        expect(b.y + b.h).toBeLessThanOrEqual(BOUNDS.h);
    });

    it("구석(오른쪽 위)에서도 상자 전체가 경계 안", () => {
        const b = tooltipBoxOf({ x: 598, y: 2 }, "아주아주긴종목명입니다 · 등락 600위 · 대금 600위", BOUNDS);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(BOUNDS.w);
        expect(b.y + b.h).toBeLessThanOrEqual(BOUNDS.h);
        expect(b.h).toBe(TOOLTIP_H);
    });

    it("폭은 글자에서 — 한글이 라틴보다 넓다", () => {
        expect(tooltipTextWidth("가나다")).toBeGreaterThan(tooltipTextWidth("abc"));
        const short = tooltipBoxOf({ x: 100, y: 100 }, "ab", BOUNDS);
        const long = tooltipBoxOf({ x: 100, y: 100 }, "아주 긴 종목 이름", BOUNDS);
        expect(long.w).toBeGreaterThan(short.w);
    });
});
