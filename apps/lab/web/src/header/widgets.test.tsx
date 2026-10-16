// 컨트롤 위젯의 규약 — 줄 위젯·판 위젯의 형태, 폭 잠금, 검색칸의 확정 손짓.
// jsdom 엔 레이아웃이 없어 폭 자체는 못 재므로, 그 폭을 만드는 **숨은 사본**이 있는지를 본다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { BoardControlValue, ControlValue } from "./widgets.js";
import type { ChoiceSpec, ControlSpec, SearchSpec } from "./spec.js";

afterEach(cleanup);

const choice = (n: number, set = (): void => {}): ChoiceSpec => ({
    kind: "choice", id: "pick", name: "고르기",
    values: Array.from({ length: n }, (_, i) => ({ v: `v${i}`, label: `값${i}` })),
    value: "v0", set,
});
const line = (spec: ControlSpec): HTMLElement => render(<ControlValue spec={spec} />).container;
const board = (spec: ControlSpec): HTMLElement => render(<BoardControlValue spec={spec} />).container;

describe("택1 — 자리와 값 개수가 형태를 정한다", () => {
    it("줄: 셋 이하는 순환 — 누르면 다음 값, 다음 값은 툴팁이 말한다 · 마지막에서 처음으로", () => {
        const set = vi.fn();
        const c = line({ ...choice(3, set), value: "v2" });
        const btn = c.querySelector("button")!;
        expect(btn.title).toContain("값0");
        fireEvent.click(btn);
        expect(set).toHaveBeenCalledWith("v0");
    });

    it("줄: 넷부터는 고르기 판 — 눌러도 값이 안 바뀌고 판이 열려 고르면 닫힌다", () => {
        const set = vi.fn();
        const c = line(choice(4, set));
        fireEvent.click(c.querySelector("button")!);
        expect(set).not.toHaveBeenCalled();
        const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes("값3"))!;
        fireEvent.click(item);
        expect(set).toHaveBeenCalledWith("v3");
        expect(document.querySelector('[role="menuitem"]')).toBeNull();
    });

    it("판: 세그먼트 — 값이 다 보이고 고른 것이 눌려 있다", () => {
        const set = vi.fn();
        const c = board(choice(3, set));
        const segs = [...c.querySelectorAll("button")];
        expect(segs.map((b) => b.textContent)).toEqual(["값0", "값1", "값2"]);
        expect(segs[0]!.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(segs[2]!);
        expect(set).toHaveBeenCalledWith("v2");
    });
});

describe("액션 — disabled 는 사라지는 대신 흐려진다", () => {
    it("줄·판 둘 다", () => {
        for (const draw of [line, board]) {
            const run = vi.fn();
            const c = draw({ kind: "action", id: "clear", name: "해제", run, disabled: true });
            const btn = c.querySelector("button")!;
            expect(btn.textContent).toBe("해제");
            fireEvent.click(btn);
            expect(run).not.toHaveBeenCalled();
            cleanup();
        }
    });
});

describe("폭 잠금 — 값이 바뀌어도 칸이 안 변한다", () => {
    it("순환 칸에 모든 값의 숨은 사본이 서 있다(visibility — display:none 이면 자리를 안 먹는다)", () => {
        const c = line({ ...choice(2), values: [{ v: "v0", label: "짧게" }, { v: "v1", label: "아주아주 긴 값" }] });
        const hidden = [...c.querySelectorAll<HTMLElement>("[aria-hidden]")];
        expect(hidden.some((e) => e.textContent?.includes("아주아주 긴 값"))).toBe(true);
        expect(hidden[0]!.style.visibility).toBe("hidden");
    });

    it("on/off 토글은 굵은 사본을 깔아 둔다", () => {
        const c = line({ kind: "toggle", id: "t", name: "선", on: false, set: () => {} });
        expect([...c.querySelectorAll<HTMLElement>("[aria-hidden] b")].map((b) => b.textContent)).toEqual(["선"]);
    });

    it("순환 글자는 켜진 토글과 같은 결 — 11px / 700(font 단축 속성이 섞이면 되돌아간다)", () => {
        const btn = line(choice(2)).querySelector("button")!;
        expect(btn.style.fontSize).toBe("11px");
        expect(btn.style.fontWeight).toBe("700");
    });
});

describe("검색칸 — 줄·판 같은 위젯, 같은 확정", () => {
    const search = (over: Partial<SearchSpec> = {}): SearchSpec => ({ kind: "search", id: "q", name: "검색어", value: "", submit: vi.fn(), placeholder: "찾기", ...over });

    it("Enter 가 확정 · 한글 조합 중의 Enter 는 아니다 · 버튼도 같은 확정", () => {
        for (const draw of [line, board]) {
            const spec = search({ button: "검색" });
            const c = draw(spec);
            const box = c.querySelector("input")!;
            fireEvent.change(box, { target: { value: "알" } });
            fireEvent.keyDown(box, { key: "Enter", isComposing: true });
            expect(spec.submit).not.toHaveBeenCalled();
            fireEvent.keyDown(box, { key: "Enter" });
            fireEvent.click(c.querySelector("button")!);
            expect(spec.submit).toHaveBeenCalledTimes(2);
            expect(spec.submit).toHaveBeenLastCalledWith("알");
            cleanup();
        }
    });

    it("canSubmit=false 면 버튼이 꺼지고 Enter 도 안 먹는다 — 칸은 칠 수 있다", () => {
        const spec = search({ button: "검색", canSubmit: false });
        const c = line(spec);
        const box = c.querySelector("input")!;
        fireEvent.change(box, { target: { value: "x" } });
        expect(box.value).toBe("x");
        fireEvent.keyDown(box, { key: "Enter" });
        expect((c.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
        expect(spec.submit).not.toHaveBeenCalled();
    });

    it("onDraft 가 없으면 Enter 없이 떠나거나 Esc 면 확정값으로 돌아간다", () => {
        const c = line(search({ value: "확정" }));
        const box = c.querySelector("input")!;
        fireEvent.change(box, { target: { value: "다른" } });
        fireEvent.blur(box);
        expect(box.value).toBe("확정");
        fireEvent.change(box, { target: { value: "다른" } });
        fireEvent.keyDown(box, { key: "Escape" });
        expect(box.value).toBe("확정");
    });

    it("onDraft 가 없어도 [검색] 은 친 글자로 확정 — 버튼이 포커스를 안 뺏어 blur 되돌리기가 먼저 오지 않는다", () => {
        const spec = search({ value: "옛값", button: "검색" });
        const c = line(spec);
        const box = c.querySelector("input")!;
        const btn = c.querySelector("button")!;
        fireEvent.change(box, { target: { value: "새값" } });
        expect(fireEvent.mouseDown(btn)).toBe(false); // preventDefault — 브라우저가 칸의 포커스를 버튼으로 옮기지 않는다
        fireEvent.click(btn);
        expect(spec.submit).toHaveBeenCalledWith("새값");
    });

    it("Tab 으로 [검색] 에 옮겨 가도 친 글자가 남는다 — 둘 다 떠나야 되돌린다", () => {
        const spec = search({ value: "옛값", button: "검색" });
        const c = line(spec);
        const box = c.querySelector("input")!;
        const btn = c.querySelector("button")!;
        fireEvent.change(box, { target: { value: "새값" } });
        fireEvent.blur(box, { relatedTarget: btn });
        expect(box.value).toBe("새값");
        fireEvent.click(btn);
        expect(spec.submit).toHaveBeenCalledWith("새값");
        fireEvent.blur(btn, { relatedTarget: document.body });
        expect(box.value).toBe("옛값");
    });

    it("onDraft 가 있으면 친 글자를 바깥에 남기고 되돌리지 않는다", () => {
        const onDraft = vi.fn();
        const c = line(search({ value: "", onDraft }));
        const box = c.querySelector("input")!;
        fireEvent.change(box, { target: { value: "남김" } });
        fireEvent.blur(box);
        expect(onDraft).toHaveBeenCalledWith("남김");
        expect(box.value).toBe("남김");
    });

    it("줄에서는 고정 폭·18px(24px 줄 안), 판에서는 남는 폭을 다 쓴다", () => {
        const l = line(search({ width: 96 })).querySelector("input")!;
        expect(l.style.width).toBe("96px");
        expect(l.style.height).toBe("18px");
        cleanup();
        const b = board(search({ width: 96 })).querySelector("input")!;
        expect(b.style.width).toBe("");
        expect(b.style.flex).toContain("1");
    });
});
