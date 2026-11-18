import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TimeLineInfo, barSwing } from "./timeLineInfo.js";
import { CHIP_BAND_PX } from "./lineMarks.js";

afterEach(cleanup);

describe("barSwing (H-L)", () => {
    it("양봉이면 + 고가−저가", () => expect(barSwing({ open: 1, high: 3, low: 0.5, close: 2 })).toBeCloseTo(2.5));
    it("음봉이면 − 고가−저가", () => expect(barSwing({ open: 2, high: 3, low: 0.5, close: 1 })).toBeCloseTo(-2.5));
    it("시가 = 종가(보합 봉)는 +", () => expect(barSwing({ open: 1, high: 1.4, low: 0.9, close: 1 })).toBeCloseTo(0.5));
});

describe("TimeLineInfo", () => {
    const v = { time: 0, open: 2, high: 3, low: 0.5, close: 1, amount: 64e8, cumAmount: 1234e8 };
    it("왼쪽 위(칩 띠 아래) 두 줄 — C·H·H-L / 대금·누적, H-L 은 부호별 색", () => {
        const { container } = render(<TimeLineInfo value={v} />);
        const box = container.querySelector<HTMLElement>("[data-time-line-info]")!;
        expect(box.style.top).toBe(`${CHIP_BAND_PX}px`);
        expect(box.style.left).toBe("8px");
        const [line1, line2] = [...box.children] as HTMLElement[];
        expect(line1.textContent).toBe("C+1.00%H+3.00%H-L-2.50%");
        expect(line2.textContent).toBe("대금64억누적1,234억");
        const colorOf = (i: number): string => (line1.children[i].lastElementChild as HTMLElement).style.color;
        expect(colorOf(0)).toBe(colorOf(1)); // C·H 는 + → 같은 색(빨강)
        expect(colorOf(2)).not.toBe(colorOf(0)); // H-L 은 음봉 − → 다른 색(파랑)
    });
    it("값이 없으면 칸도 없다", () => {
        const { container } = render(<TimeLineInfo value={null} />);
        expect(container.querySelector("[data-time-line-info]")).toBeNull();
    });
});
