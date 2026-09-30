// 컨트롤 위젯의 **규약**을 기계가 지킨다(옛 headerControls.dom.test 의 위젯 절 승계).
//   · 택1은 ≤3 순환, 4부터 판 — 순환의 다음 값은 툴팁이 말한다.
//   · 폭 잠금 — 있을 수 있는 모든 모습이 같은 칸에 겹쳐 서 있다(값이 바뀌어도 칸이 안 변한다).
//     jsdom 엔 레이아웃이 없어 폭 자체는 못 재므로, 그 폭을 만드는 **숨은 사본**이 있는지를 본다.
//   · disabled 는 사라지는 대신 흐려진다 — 자리가 안 움직여야 한다.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ControlValue, popoverContentOf } from "../widgets.js";
import type { ChoiceSpec, ControlSpec } from "../spec.js";

afterEach(() => cleanup());

const toggle = (over?: Partial<ControlSpec>): ControlSpec =>
    ({ kind: "toggle", id: "t", name: "선", on: false, set: () => {}, ...over }) as ControlSpec;
const choice = (n: number, set = (): void => {}): ChoiceSpec => ({
    kind: "choice", id: "pick", name: "고르기",
    values: Array.from({ length: n }, (_, i) => ({ v: `v${i}`, label: `값${i}` })),
    value: "v0", set,
});

const draw = (spec: ControlSpec): HTMLElement => render(<ControlValue spec={spec} />).container;

describe("택1 — 값 개수가 형태를 정한다", () => {
    it("셋 이하는 순환 — 누르면 판이 아니라 다음 값이 온다 · 다음 값은 툴팁이 말한다", () => {
        const set = vi.fn();
        const c = draw(choice(3, set));
        const btn = c.querySelector("button")!;
        expect(btn.title).toContain("값1");
        fireEvent.click(btn);
        expect(set).toHaveBeenCalledWith("v1");
    });

    it("순환은 한 바퀴 돈다 — 마지막에서 처음으로", () => {
        const set = vi.fn();
        const c = draw({ ...choice(3, set), value: "v2" });
        fireEvent.click(c.querySelector("button")!);
        expect(set).toHaveBeenCalledWith("v0");
    });

    it("넷부터는 판 — 눌러도 값이 안 바뀌고 판이 열린다", () => {
        const set = vi.fn();
        const c = draw(choice(4, set));
        fireEvent.click(c.querySelector("button")!);
        expect(set).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("값3");
    });
});

describe("판형 내용 공용화 — 단축키가 열어도 입구에서 연 것과 같은 판", () => {
    it("popover 컨트롤은 자기 renderPopover 가 내용이다", () => {
        const close = vi.fn();
        const spec: ControlSpec = { kind: "popover", id: "p", name: "사슬", renderPopover: (c) => <button onClick={c}>닫기</button> };
        const { container } = render(<>{popoverContentOf(spec, close)}</>);
        fireEvent.click(container.querySelector("button")!);
        expect(close).toHaveBeenCalled();
    });

    it("긴 택1은 고르기 메뉴가 내용이다 — 고르면 닫힌다", () => {
        const set = vi.fn();
        const close = vi.fn();
        const { container } = render(<>{popoverContentOf(choice(4, set), close)}</>);
        const item = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("값2"))!;
        fireEvent.click(item);
        expect(set).toHaveBeenCalledWith("v2");
        expect(close).toHaveBeenCalled();
    });
});

describe("액션·disabled — 자리가 안 움직인다", () => {
    it("누르면 실행된다 · disabled 는 사라지는 대신 흐려진다", () => {
        const run = vi.fn();
        const c = draw({ kind: "action", id: "clear", name: "선 지우기", run });
        fireEvent.click(c.querySelector("button")!);
        expect(run).toHaveBeenCalled();

        const run2 = vi.fn();
        const c2 = draw({ kind: "action", id: "clear", name: "선 지우기", run: run2, disabled: true });
        const btn = c2.querySelector("button")!;
        expect(btn.textContent).toBe("선 지우기"); // 여전히 서 있다
        fireEvent.click(btn);
        expect(run2).not.toHaveBeenCalled();
    });
});

describe("폭 잠금 — 값이 바뀌어도 칸이 안 변한다", () => {
    it("순환 칸에 모든 값의 숨은 사본이 서 있다", () => {
        const c = draw({
            kind: "choice", id: "pick", name: "고르기", value: "v0",
            values: [{ v: "v0", label: "짧게" }, { v: "v1", label: "아주아주 긴 값" }],
            set: () => {},
        });
        const hidden = [...c.querySelectorAll<HTMLElement>("[aria-hidden]")].map((e) => e.textContent ?? "");
        expect(hidden.some((t) => t.includes("아주아주 긴 값"))).toBe(true);
    });

    it("on/off 토글도 굵은 사본을 깔아 둔다 — 굵어지는 것만으로 글자 폭이 는다", () => {
        const c = draw(toggle());
        const bold = [...c.querySelectorAll<HTMLElement>("[aria-hidden] b")];
        expect(bold.length).toBe(1);
        expect(bold[0]!.textContent).toBe("선");
    });

    it("판형 컨트롤도 굵은 사본을 깔아 둔다 — 켜짐 칩과 같은 얼굴이다", () => {
        const c = draw({ kind: "popover", id: "p", name: "사슬", renderPopover: () => null });
        expect([...c.querySelectorAll<HTMLElement>("[aria-hidden] b")].length).toBe(1);
    });

    /**
     * ⚠ 겪은 버그(커밋 1fb2aa4): `{...face, font:"inherit"}` 로 쓰면 `font` 단축이 크기·굵기를 되돌려
     * 순환 글자만 14px/400 이 됐고, 숨은 사본(11px)보다 넓어져 폭 잠금까지 무력해졌다.
     */
    it("순환 글자는 켜진 토글과 같은 결 — 11px / 700", () => {
        const c = draw(choice(2));
        const btn = c.querySelector("button")!;
        expect(btn.style.fontSize).toBe("11px");
        expect(btn.style.fontWeight).toBe("700");
    });

    it("숨김은 visibility 다 — display:none 이면 자리를 안 먹어 예약이 무의미해진다", () => {
        const c = draw(toggle());
        const alt = c.querySelector<HTMLElement>("[aria-hidden]")!;
        expect(alt.style.visibility).toBe("hidden");
        expect(alt.style.display).not.toBe("none");
    });
});
