// ScrollRow — **넘친 줄에 손이 닿는가**. 스크롤바를 숨긴 채 휠이 없으면 마우스만 쓰는 손에게 넘친 부분은
// 사라진 것과 같다(화면은 멀쩡해 보여 눈으로는 못 잡는다). 그래서 "굴리면 움직이나"로 잰다.
// jsdom 은 레이아웃을 안 해 scrollWidth/clientWidth 가 0 이다 — 넘침을 손으로 심는 것이 유일한 인공물이다.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ScrollRow } from "./ScrollRow.js";

function overflow(el: HTMLElement, scrollWidth = 500, clientWidth = 100): void {
    Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
}

const rowOf = (c: HTMLElement): HTMLElement => c.firstElementChild as HTMLElement;

describe("ScrollRow", () => {
    it("세로 휠이 가로 이동이 된다 — 스크롤바를 숨겼으니 이게 마우스의 유일한 길이다", () => {
        const row = rowOf(render(<ScrollRow><span>a</span></ScrollRow>).container);
        overflow(row);
        row.dispatchEvent(new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true }));
        expect(row.scrollLeft).toBe(60);
    });

    it("안 넘치면 가만히 둔다 — 페이지 세로 스크롤을 빼앗지 않는다", () => {
        const row = rowOf(render(<ScrollRow><span>a</span></ScrollRow>).container);
        overflow(row, 100, 100);
        const e = new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true });
        row.dispatchEvent(e);
        expect(row.scrollLeft).toBe(0);
        expect(e.defaultPrevented).toBe(false);
    });

    it("호출부 style 은 넘침 규약을 못 덮는다 — 덮이면 줄바꿈이 돌아와 본문 높이가 변한다", () => {
        const row = rowOf(render(<ScrollRow style={{ flexWrap: "wrap", overflowX: "hidden" }}><span>a</span></ScrollRow>).container);
        expect(row.style.flexWrap).toBe("nowrap");
        expect(row.style.overflowX).toBe("auto");
        expect(row.className).toBe("no-scrollbar");
    });

    it("data-* 는 줄에 그대로 붙는다", () => {
        const row = rowOf(render(<ScrollRow data-header-line="line"><span>a</span></ScrollRow>).container);
        expect(row.dataset.headerLine).toBe("line");
    });
});
