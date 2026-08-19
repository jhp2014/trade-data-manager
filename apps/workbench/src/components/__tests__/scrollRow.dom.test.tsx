// ScrollRow — **넘친 줄에 손이 닿는가**. 이 파일이 있는 이유는 이 규약이 원래 세 조각이었고
// (overflowX + .no-scrollbar + 휠), 앞의 둘만 적은 줄이 네 군데서 태어났기 때문이다. 스크롤바를
// 숨긴 채 휠이 없으면 마우스만 쓰는 손에게는 넘친 부분이 **사라진 것과 같다** — 화면은 멀쩡해 보여서
// 눈으로는 못 잡는 결함이다. 그래서 검사는 "클래스가 붙었나"가 아니라 **"굴리면 움직이나"** 로 한다.
//
// jsdom 은 레이아웃을 안 하므로 scrollWidth/clientWidth 가 둘 다 0 이다(= 안 넘침). 넘침을 손으로
// 심어 줘야 휠 핸들러의 가드를 통과한다 — 그 심기가 이 테스트의 유일한 인공물이다.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ScrollRow } from "../ControlChrome.js";

/** 넘치는 줄로 만든다 — jsdom 이 안 재 주는 두 값을 심는다. */
function overflow(el: HTMLElement, scrollWidth = 500, clientWidth = 100): void {
    Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
}

const rowOf = (c: HTMLElement): HTMLElement => c.firstElementChild as HTMLElement;

describe("ScrollRow — 넘친 줄에 손이 닿는다", () => {
    it("세로 휠이 가로 이동이 된다 — 스크롤바를 숨겼으니 이게 마우스의 유일한 길이다", () => {
        const { container } = render(<ScrollRow><span>a</span></ScrollRow>);
        const row = rowOf(container);
        overflow(row);

        row.dispatchEvent(new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true }));

        expect(row.scrollLeft).toBe(60);
    });

    it("안 넘치면 가만히 둔다 — 페이지 세로 스크롤을 빼앗지 않는다", () => {
        const { container } = render(<ScrollRow><span>a</span></ScrollRow>);
        const row = rowOf(container);
        overflow(row, 100, 100);

        const e = new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true });
        row.dispatchEvent(e);

        expect(row.scrollLeft).toBe(0);
        expect(e.defaultPrevented).toBe(false);
    });

    it("scroll={false} 는 휠도 안 붙는다 — 도달을 포기한 자리에 리스너만 남기지 않는다", () => {
        const { container } = render(<ScrollRow scroll={false}><span>a</span></ScrollRow>);
        const row = rowOf(container);
        overflow(row);

        row.dispatchEvent(new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true }));

        expect(row.scrollLeft).toBe(0);
        expect(row.className).not.toContain("no-scrollbar");
    });

    it("호출부 style 은 넘침 규약을 못 덮는다 — 덮이면 줄바꿈이 돌아와 본문 높이가 변한다", () => {
        const { container } = render(
            // 일부러 어긋난 값을 준다(옛 코드에서 실제로 있던 실수).
            <ScrollRow style={{ flexWrap: "wrap", overflowX: "hidden" }}><span>a</span></ScrollRow>,
        );
        const row = rowOf(container);

        expect(row.style.flexWrap).toBe("nowrap");
        expect(row.style.overflowX).toBe("auto");
    });
});
