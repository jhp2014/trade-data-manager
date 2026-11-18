import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TimeLineInfo, barRange } from "./timeLineInfo.js";
import { CHIP_BAND_PX } from "./lineMarks.js";

afterEach(cleanup);

describe("barRange (변동폭)", () => {
    it("고가 − 저가, 부호 없음(음봉이어도)", () => expect(barRange({ high: 3, low: 0.5 })).toBeCloseTo(2.5));
});

describe("TimeLineInfo", () => {
    const v = { time: 0, open: 2, high: 3, low: 0.5, close: 1, amount: 64e8, cumAmount: 1234e8 };
    it("오른쪽 위(칩 띠 아래, 가격 축 왼쪽) 두 줄 — 현재·변동폭 / 대금·누적, 변동폭은 부호 없이 검정", () => {
        const { container } = render(<TimeLineInfo value={v} right={60} />);
        const box = container.querySelector<HTMLElement>("[data-time-line-info]")!;
        expect(box.style.top).toBe(`${CHIP_BAND_PX}px`);
        expect(box.style.right).toBe("60px");
        const [line1, line2] = [...box.children] as HTMLElement[];
        expect(line1.textContent).toBe("현재+1.00%변동폭2.50%");
        expect(line2.textContent).toBe("대금64억누적1,234억");
        const colorOf = (i: number): string => (line1.children[i].lastElementChild as HTMLElement).style.color;
        expect(colorOf(1)).toBe("var(--text-primary)"); // 변동폭은 검정 — 음봉이어도
    });
    it("값이 없으면 칸도 없다", () => {
        const { container } = render(<TimeLineInfo value={null} right={60} />);
        expect(container.querySelector("[data-time-line-info]")).toBeNull();
    });
});
