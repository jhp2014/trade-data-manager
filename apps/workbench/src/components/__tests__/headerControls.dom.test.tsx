// 머리글 컨트롤 줄의 **규약**을 기계가 지킨다. 셋 다 주석으로만 두면 다음 컨트롤이 붙을 때 조용히 깨진다.
//
//   · 핀 = 헤더에 올린다. 저장은 **언핀 목록**이라 나중에 생긴 컨트롤이 저절로 숨지 않는다.
//   · 택1은 ≤3 순환, 4부터 팝오버.
//   · 폭 잠금 — 있을 수 있는 모든 모습이 같은 칸에 겹쳐 서 있다(그래야 값이 바뀌어도 칸이 안 변한다).
//     jsdom 엔 레이아웃이 없어 폭 자체는 못 재므로, 그 폭을 만드는 **숨은 사본**이 있는지를 본다.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { HeaderControls, type ControlSpec } from "../HeaderControls.js";

const KEY = "wb.test.headerPins";
afterEach(() => { cleanup(); localStorage.clear(); });

const toggle = (id: string, name: string, on = false, set = (): void => {}): ControlSpec =>
    ({ kind: "toggle", id, name, on, set });

const draw = (controls: ControlSpec[]): HTMLElement =>
    render(<HeaderControls controls={controls} storageKey={KEY} />).container;

/** 헤더 줄에 실제로 서 있는 컨트롤 글자 — 더보기 판(portal, document.body)은 안 센다. */
const headerText = (c: HTMLElement): string => c.textContent ?? "";
const openSheet = (c: HTMLElement): void => {
    fireEvent.click(c.querySelector("button[title^='컨트롤 전부']")!);
};
const sheet = (): HTMLElement => document.body.querySelector<HTMLElement>("[style*='position: fixed']")!;

describe("핀 — 헤더에 올릴 것 고르기", () => {
    it("기본은 전부 핀 — 설정이 없으면 다 헤더에 선다", () => {
        const c = draw([toggle("a", "선"), toggle("b", "라벨")]);
        expect(headerText(c)).toContain("선");
        expect(headerText(c)).toContain("라벨");
    });

    it("언핀 목록에 적힌 것만 접힌다 · ⋯ 옆에 접힌 수가 뜬다", () => {
        localStorage.setItem(KEY, JSON.stringify(["b"]));
        const c = draw([toggle("a", "선"), toggle("b", "라벨")]);
        expect(headerText(c)).toContain("선");
        expect(headerText(c)).not.toContain("라벨");
        expect(headerText(c)).toContain("1");
    });

    it("**새로 생긴 컨트롤은 기본 핀** — 저장이 언핀 목록이라 공짜로 나온다", () => {
        // 옛 설정에는 "c" 라는 이름이 아예 없다(그 시절엔 없던 컨트롤이다).
        localStorage.setItem(KEY, JSON.stringify(["b"]));
        const c = draw([toggle("a", "선"), toggle("b", "라벨"), toggle("c", "새 컨트롤")]);
        expect(headerText(c)).toContain("새 컨트롤");
    });

    it("접어도 더보기 판에서는 그대로 만진다 — 숨기는 것이지 없애는 게 아니다", () => {
        localStorage.setItem(KEY, JSON.stringify(["b"]));
        const set = vi.fn();
        const c = draw([toggle("a", "선"), toggle("b", "라벨", false, set)]);
        openSheet(c);
        fireEvent.click([...sheet().querySelectorAll("button")].find((b) => b.textContent === "라벨")!);
        expect(set).toHaveBeenCalledWith(true);
    });

    it("available:false 는 이 패널에 없는 것 — 판에도 안 나온다", () => {
        const c = draw([toggle("a", "선"), { ...toggle("b", "라벨"), available: false }]);
        openSheet(c);
        expect(sheet().textContent).not.toContain("라벨");
    });
});

describe("택1 — 값 개수가 형태를 정한다", () => {
    const choice = (n: number, set = (): void => {}): ControlSpec => ({
        kind: "choice", id: "pick", name: "고르기",
        values: Array.from({ length: n }, (_, i) => ({ v: `v${i}`, label: `값${i}` })),
        value: "v0", set,
    });

    it("셋 이하는 순환 — 누르면 판이 아니라 다음 값이 온다", () => {
        const set = vi.fn();
        const c = draw([choice(3, set)]);
        fireEvent.click(c.querySelector("button")!);
        expect(set).toHaveBeenCalledWith("v1");
    });

    it("순환은 한 바퀴 돈다 — 마지막에서 처음으로", () => {
        const set = vi.fn();
        render(<HeaderControls storageKey={KEY} controls={[{ ...choice(3, set), value: "v2" } as ControlSpec]} />);
        fireEvent.click(screen.getAllByRole("button")[0]!);
        expect(set).toHaveBeenCalledWith("v0");
    });

    it("다음 값을 툴팁이 말한다 — 순환의 유일한 약점을 글자 없이 받는다", () => {
        const c = draw([choice(3)]);
        expect(c.querySelector("button")!.title).toContain("값1");
    });

    it("넷부터는 팝오버 — 눌러도 값이 안 바뀌고 판이 열린다", () => {
        const set = vi.fn();
        const c = draw([choice(4, set)]);
        fireEvent.click(c.querySelector("button")!);
        expect(set).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("값3");
    });
});

describe("폭 잠금 — 값이 바뀌어도 칸이 안 변한다", () => {
    it("순환 칸에 모든 값의 숨은 사본이 서 있다 — 칸을 제일 긴 것에 맞추는 재료", () => {
        const c = draw([{
            kind: "choice", id: "pick", name: "고르기", value: "v0",
            values: [{ v: "v0", label: "짧게" }, { v: "v1", label: "아주아주 긴 값" }],
            set: () => {},
        }]);
        const hidden = [...c.querySelectorAll<HTMLElement>("[aria-hidden]")].map((e) => e.textContent ?? "");
        expect(hidden.some((t) => t.includes("아주아주 긴 값"))).toBe(true);
    });

    it("on/off 토글도 **굵은 사본**을 깔아 둔다 — 굵어지는 것만으로 글자 폭이 는다", () => {
        const c = draw([toggle("a", "선")]);
        const bold = [...c.querySelectorAll<HTMLElement>("[aria-hidden] b")];
        expect(bold.length).toBe(1);
        expect(bold[0]!.textContent).toBe("선");
    });

    it("숨김은 visibility 다 — display:none 이면 자리를 안 먹어 예약이 무의미해진다", () => {
        const c = draw([toggle("a", "선")]);
        const alt = c.querySelector<HTMLElement>("[aria-hidden]")!;
        expect(alt.style.visibility).toBe("hidden");
        expect(alt.style.display).not.toBe("none");
    });
});
