// 머리글 컨트롤 줄의 **규약**을 기계가 지킨다. 셋 다 주석으로만 두면 다음 컨트롤이 붙을 때 조용히 깨진다.
//
//   · 핀 = 헤더에 올린다. 저장은 **언핀 목록**이라 나중에 생긴 컨트롤이 저절로 숨지 않는다.
//   · 택1은 ≤3 순환, 4부터 팝오버 — **나열(segmented)만 예외**이고, 그 예외가 값을 다 세운다.
//   · 폭 잠금 — 있을 수 있는 모든 모습이 같은 칸에 겹쳐 서 있다(그래야 값이 바뀌어도 칸이 안 변한다).
//     jsdom 엔 레이아웃이 없어 폭 자체는 못 재므로, 그 폭을 만드는 **숨은 사본**이 있는지를 본다.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { applyOrder, HeaderControls, type ControlSpec } from "../HeaderControls.js";

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

    it("판 바깥을 누르면 닫힌다 — 다른 패널이든 같은 패널의 그림이든", () => {
        const c = draw([toggle("a", "선")]);
        openSheet(c);
        expect(sheet()).toBeTruthy();
        // ⚠ 캡처 단계로 듣는다 — 그래프 위에서는 d3 가 mousedown 을 삼켜 버블링으로는 안 온다.
        fireEvent.mouseDown(document.body);
        expect(document.body.querySelector("[data-header-popover]")).toBeNull();
    });

    it("판 안을 누르면 안 닫힌다 — 읽고 고르는 중이다", () => {
        const c = draw([toggle("a", "선")]);
        openSheet(c);
        fireEvent.mouseDown(sheet());
        expect(document.body.querySelector("[data-header-popover]")).toBeTruthy();
    });

    it("판 안의 택1 판을 눌러도 부모가 안 닫힌다 — 중첩이라 자식은 바깥이 아니다", () => {
        localStorage.setItem(KEY, JSON.stringify(["pick"])); // 접어 두면 판 안에서만 만진다
        const c = draw([toggle("a", "선"), {
            kind: "choice", id: "pick", name: "고르기", value: "v0",
            values: [0, 1, 2, 3].map((i) => ({ v: `v${i}`, label: `값${i}` })), set: () => {},
        }]);
        openSheet(c);
        fireEvent.click([...sheet().querySelectorAll("button")].find((b) => b.textContent?.startsWith("값0"))!);
        const layers = document.body.querySelectorAll("[data-header-popover]");
        expect(layers.length).toBe(2); // 부모 판 + 택1 판
        fireEvent.mouseDown([...layers][1]!);
        expect(document.body.querySelectorAll("[data-header-popover]").length).toBe(2);
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

describe("순서 — 손이 정한 것이 이긴다", () => {
    const ids = (xs: readonly { id: string }[]): string[] => xs.map((x) => x.id);
    const decl = ["a", "b", "c"].map((id) => ({ id }));

    it("저장이 비면 선언 순서 그대로", () => {
        expect(ids(applyOrder(decl, []))).toEqual(["a", "b", "c"]);
    });

    it("저장된 순서를 따른다", () => {
        expect(ids(applyOrder(decl, ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
    });

    it("**새 컨트롤은 선언에서 앞에 있던 이웃 뒤로** — 맨 뒤로 던지지 않는다", () => {
        // 선언은 a,x,b,c 인데 저장은 x 를 모른다(그 시절엔 없던 컨트롤). x 는 a 뒤에 서야 한다.
        const withNew = [{ id: "a" }, { id: "x" }, { id: "b" }, { id: "c" }];
        expect(ids(applyOrder(withNew, ["c", "a", "b"]))).toEqual(["c", "a", "x", "b"]);
    });

    it("선언 맨 앞의 새 컨트롤은 맨 앞에 — 기댈 이웃이 없다", () => {
        const withNew = [{ id: "x" }, { id: "a" }, { id: "b" }, { id: "c" }];
        expect(ids(applyOrder(withNew, ["c", "a", "b"]))).toEqual(["x", "c", "a", "b"]);
    });

    it("새 것이 여럿이면 자기들끼리는 선언 순서를 지킨다", () => {
        const withNew = [{ id: "a" }, { id: "x" }, { id: "y" }, { id: "b" }];
        expect(ids(applyOrder(withNew, ["b", "a"]))).toEqual(["b", "a", "x", "y"]);
    });

    it("저장에만 있고 지금 없는 것은 조용히 빠진다 — grain 으로 갈리는 패널이 있다", () => {
        expect(ids(applyOrder(decl, ["c", "없는것", "a", "b"]))).toEqual(["c", "a", "b"]);
    });

    it("영속 — 저장된 순서대로 헤더에 선다", () => {
        localStorage.setItem(KEY, JSON.stringify({ unpinned: [], order: ["b", "a"] }));
        const c = draw([toggle("a", "선"), toggle("b", "라벨")]);
        expect([...c.querySelectorAll("button")].map((b) => b.textContent).slice(0, 2)).toEqual(["라벨", "선"]);
    });

    it("옛 형식(언핀 배열만)도 읽는다 — 순서 기능 전에 꽂아 둔 핀이 초기화되지 않게", () => {
        localStorage.setItem(KEY, JSON.stringify(["b"]));
        const c = draw([toggle("a", "선"), toggle("b", "라벨")]);
        expect(headerText(c)).toContain("선");
        expect(headerText(c)).not.toContain("라벨");
    });
});

describe("액션 — 누르면 일이 일어난다", () => {
    const action = (run: (at: { clientX: number; clientY: number }) => void, disabled = false): ControlSpec =>
        ({ kind: "action", id: "clear", name: "선 지우기", run, disabled });

    it("누르면 실행된다", () => {
        const run = vi.fn();
        const c = draw([action(run)]);
        fireEvent.click(c.querySelector("button")!);
        expect(run).toHaveBeenCalled();
    });

    it("할 게 없으면 **사라지는 대신 흐려진다** — 자리가 안 움직여야 한다", () => {
        const run = vi.fn();
        const c = draw([action(run, true)]);
        const btn = c.querySelector("button")!;
        expect(btn.textContent).toBe("선 지우기"); // 여전히 서 있다
        fireEvent.click(btn);
        expect(run).not.toHaveBeenCalled();
    });

    it("누른 자리를 넘긴다 — 그 자리에 메뉴를 띄우는 손짓이 있다(+ 축)", () => {
        const run = vi.fn();
        const c = draw([action(run)]);
        fireEvent.click(c.querySelector("button")!, { clientX: 120, clientY: 40 });
        expect(run.mock.calls[0][0]).toMatchObject({ clientX: 120, clientY: 40 });
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

    /**
     * ⚠ 겪은 버그: `{...face, font:"inherit", fontSize:11}` 로 쓰면 스프레드가 fontSize 를 **앞자리**에
     * 앉히고 뒤따르는 `font:inherit` 이 크기·굵기를 되돌려 순환 글자만 14px/400 이 됐다. 그러면
     * 보이는 글자가 숨은 사본(11px)보다 넓어져 **폭 잠금까지 무력해진다** — 증상 둘이 한 원인이었다.
     * 그래서 "글자가 켜진 토글과 같은 결인가"를 못박는다(단축 속성이 다시 섞이면 여기서 걸린다).
     */
    it("순환 글자는 켜진 토글과 같은 결 — 11px / 700", () => {
        const c = draw([{
            kind: "choice", id: "pick", name: "고르기", value: "v0",
            values: [{ v: "v0", label: "가" }, { v: "v1", label: "나" }], set: () => {},
        }]);
        const btn = c.querySelector("button")!;
        // `font` 단축이 뒤에 섞이면 이 둘이 통째로 되돌아간다(그게 그 버그였다) — 그래서 여기가 걸린다.
        expect(btn.style.fontSize).toBe("11px");
        expect(btn.style.fontWeight).toBe("700");
    });

    it("숨김은 visibility 다 — display:none 이면 자리를 안 먹어 예약이 무의미해진다", () => {
        const c = draw([toggle("a", "선")]);
        const alt = c.querySelector<HTMLElement>("[aria-hidden]")!;
        expect(alt.style.visibility).toBe("hidden");
        expect(alt.style.display).not.toBe("none");
    });
});
