// 레일 한 줄의 **손짓** — 그어서 조건을 거는 자리.
//
// 대수(어떤 드래그가 구간 리스트를 어떻게 바꾸나)는 railModel 이 지고 이미 덮여 있다. 여기서 재는 건
// 그 앞뒤다: 어느 손짓이 어느 드래그로 접수되나 · **언제 커밋하나** · 미리보기가 커밋과 같은가.
// 옛 레일이 "클릭인가 드래그인가" 판정이 조용히 어긋나도 아무도 몰랐던 게 이 층이 비어 있어서다.
//
// ⚠ 커밋은 **손을 뗄 때 한 번**이다. 드래그 중에 store 를 갱신하면 유니버스×필터 정산이 프레임마다
//   돌아 손이 끌린다 — 느려지는 건 눈에 보이지만 "왜"는 안 보이는 종류라 테스트가 지켜야 한다.
//
// V 를 number 로 두고 toFrac/fromFrac 을 항등으로 준다 — 스냅·척도는 어댑터의 몫이라 여기선 방해다.
// 트랙 폭은 setup 의 getBoundingClientRect 가 1000px 로 물리므로 frac = (clientX − 22) / 956.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { Rail, RAIL_PAD } from "../Rail.js";
import type { RailRange } from "../railModel.js";

const WIDTH = 1000;
/** 프랙션 → 그 자리를 누를 clientX(fracOfX 의 역함수). */
const xAt = (frac: number): number => RAIL_PAD + frac * (WIDTH - 2 * RAIL_PAD);

const range = (from: number, to: number): RailRange<number> => ({ from, to });

function setup(over: Partial<Parameters<typeof Rail<number>>[0]> = {}) {
    const onChange = vi.fn();
    const utils = render(
        <Rail<number>
            label="테스트 축"
            ranges={over.ranges ?? []}
            toFrac={(v) => v}
            fromFrac={(f) => f}
            fmt={(v) => v.toFixed(2)}
            minLabel="약" maxLabel="강"
            onChange={onChange}
            {...over}
        />,
    );
    /** 트랙 — 조작 안내가 붙은 상자(이름 열·라벨과 갈린다). */
    const track = (): HTMLElement => utils.container.querySelector('[title^="빈 곳을 끌면"]') as HTMLElement;
    return { ...utils, onChange, track };
}

/** 트랙 위에서 누르고 → 끌고 → 뗀다. */
const dragOn = (el: HTMLElement, from: number, to: number): void => {
    fireEvent.pointerDown(el, { button: 0, clientX: xAt(from), pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: xAt(to), pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
};

describe("빈 트랙을 끌면 새 구간", () => {
    it("누른 자리와 뗀 자리가 양끝이다", () => {
        const { track, onChange } = setup();
        dragOn(track(), 0.2, 0.6);
        expect(onChange).toHaveBeenCalledOnce();
        const [r] = onChange.mock.calls[0][0] as RailRange<number>[];
        expect(r.from).toBeCloseTo(0.2, 2);
        expect(r.to).toBeCloseTo(0.6, 2);
    });

    it("이미 있는 구간에 **덧붙인다** — 여러 구간이 OR 로 선다", () => {
        const { track, onChange } = setup({ ranges: [range(0.1, 0.2)] });
        dragOn(track(), 0.6, 0.9);
        expect(onChange.mock.calls[0][0]).toHaveLength(2);
    });

    it("구간이 하나뿐인 레일(판단 축)은 **갈아탄다** — 저장 자리가 하나다", () => {
        const { track, onChange } = setup({ ranges: [range(0.1, 0.2)], single: true });
        dragOn(track(), 0.6, 0.9);
        expect(onChange.mock.calls[0][0]).toHaveLength(1);
    });

    // 뒤집힌 채로 커밋되면 판정이 빈 구간을 본다 — 아무것도 안 걸리는데 조건은 걸려 있다.
    it("거꾸로 끌어도 정렬해서 커밋한다", () => {
        const { track, onChange } = setup();
        dragOn(track(), 0.8, 0.3);
        const [r] = onChange.mock.calls[0][0] as RailRange<number>[];
        expect(r.from).toBeLessThan(r.to);
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유다.
describe("커밋 시점 — 손을 뗄 때 한 번", () => {
    it("끄는 동안엔 안 부른다 — 프레임마다 정산이 돌면 손이 끌린다", () => {
        const { track, onChange } = setup();
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.4), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.5), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.6), pointerId: 1 });
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.pointerUp(track(), { pointerId: 1 });
        expect(onChange).toHaveBeenCalledOnce();
    });

    it("끄는 동안에도 **화면엔 보인다** — 미리보기가 있어야 어디를 자르는지 안다", () => {
        const { track, container } = setup();
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.6), pointerId: 1 });
        // 경계 라벨(fmt) 두 개가 미리보기로 서 있다.
        expect(container.textContent).toContain("0.20");
        expect(container.textContent).toContain("0.60");
    });

    // 미리보기와 커밋이 다른 함수면 뗀 순간 구간이 살짝 튄다 — railModel.applyDrag 를 둘 다 쓴다.
    it("미리보기에 보이던 값이 그대로 커밋된다", () => {
        const { track, container, onChange } = setup();
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.25), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.75), pointerId: 1 });
        expect(container.textContent).toContain("0.25");
        fireEvent.pointerUp(track(), { pointerId: 1 });
        const [r] = onChange.mock.calls[0][0] as RailRange<number>[];
        expect(r.from.toFixed(2)).toBe("0.25");
        expect(r.to.toFixed(2)).toBe("0.75");
    });

    it("포인터가 취소돼도(창 밖 등) 미리보기가 안 남는다", () => {
        const { track, container } = setup();
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.6), pointerId: 1 });
        fireEvent.pointerCancel(track(), { pointerId: 1 });
        expect(container.textContent).not.toContain("0.60");
    });
});

describe("클릭 오인 방지 — 폭 없는 구간은 조건이 아니다", () => {
    // 폭 0 짜리가 걸리면 "아무것도 통과 못 하는 조건"이 조용히 선다.
    it("그냥 누르고 떼면 아무 일도 없다", () => {
        const { track, onChange } = setup();
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.5), pointerId: 1 });
        fireEvent.pointerUp(track(), { pointerId: 1 });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("아주 조금 흔들려도 클릭이다", () => {
        const { track, onChange } = setup();
        dragOn(track(), 0.5, 0.502);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("문턱을 넘으면 구간이다", () => {
        const { track, onChange } = setup();
        dragOn(track(), 0.5, 0.55);
        expect(onChange).toHaveBeenCalledOnce();
    });

    // 경계 조정은 폭이 0이 돼도 사용자가 **의도한** 이동이라 그대로 커밋한다(탭 판정은 새 구간만).
    it("경계를 끌어 붙인 건 클릭이 아니다 — 의도한 이동이다", () => {
        const { container, onChange } = setup({ ranges: [range(0.2, 0.6)] });
        const edge = [...container.querySelectorAll("span")].find((s) => s.title === "끌어서 이 경계 조정")!;
        fireEvent.pointerDown(edge, { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(container.querySelector('[title^="빈 곳을 끌면"]') as HTMLElement, { clientX: xAt(0.6), pointerId: 1 });
        fireEvent.pointerUp(container.querySelector('[title^="빈 곳을 끌면"]') as HTMLElement, { pointerId: 1 });
        expect(onChange).toHaveBeenCalledOnce();
    });
});

describe("경계 끌기 — 그 경계만 움직인다", () => {
    const edgeLabels = (c: HTMLElement): HTMLElement[] =>
        [...c.querySelectorAll("span")].filter((s) => s.title === "끌어서 이 경계 조정");

    it("경계가 구간마다 둘 선다", () => {
        const { container } = setup({ ranges: [range(0.2, 0.6)] });
        expect(edgeLabels(container)).toHaveLength(2);
    });

    it("왼쪽 경계를 끌면 오른쪽은 그대로", () => {
        const { container, track, onChange } = setup({ ranges: [range(0.2, 0.6)] });
        fireEvent.pointerDown(edgeLabels(container)[0], { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.35), pointerId: 1 });
        fireEvent.pointerUp(track(), { pointerId: 1 });
        const [r] = onChange.mock.calls[0][0] as RailRange<number>[];
        expect(r.from).toBeCloseTo(0.35, 2);
        expect(r.to).toBeCloseTo(0.6, 2);
    });

    it("반대편을 지나쳐도 커밋할 때 정렬된다", () => {
        const { container, track, onChange } = setup({ ranges: [range(0.2, 0.6)] });
        fireEvent.pointerDown(edgeLabels(container)[0], { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.9), pointerId: 1 });
        fireEvent.pointerUp(track(), { pointerId: 1 });
        const [r] = onChange.mock.calls[0][0] as RailRange<number>[];
        expect(r.from).toBeLessThan(r.to);
    });

    // 라벨에도 move/up 을 달면 같은 드래그가 두 번 접수된다 — 포인터는 트랙이 캡처한다.
    it("경계 누르기가 **새 구간으로 접수되지 않는다** — 덧붙지 않는다", () => {
        const { container, track, onChange } = setup({ ranges: [range(0.2, 0.6)] });
        fireEvent.pointerDown(edgeLabels(container)[0], { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.3), pointerId: 1 });
        fireEvent.pointerUp(track(), { pointerId: 1 });
        expect(onChange.mock.calls[0][0]).toHaveLength(1);
    });
});

describe("구간 삭제 — ✕", () => {
    const closers = (c: HTMLElement): HTMLElement[] =>
        [...c.querySelectorAll("button")].filter((b) => b.title === "이 구간 삭제");

    it("누르면 그 구간만 빠진다", () => {
        const { container, onChange } = setup({ ranges: [range(0.1, 0.2), range(0.6, 0.9)] });
        fireEvent.click(closers(container)[0]);
        const next = onChange.mock.calls[0][0] as RailRange<number>[];
        expect(next).toHaveLength(1);
        expect(next[0].from).toBeCloseTo(0.6, 2);
    });

    it("끄는 동안엔 안 보인다 — 손 밑에서 지우는 단추가 나타나면 안 된다", () => {
        const { container, track } = setup({ ranges: [range(0.1, 0.2)] });
        expect(closers(container)).toHaveLength(1);
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.5), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.8), pointerId: 1 });
        expect(closers(container)).toHaveLength(0);
    });
});

describe("안 받는 손짓", () => {
    it("오른쪽 버튼은 무시한다 — 그건 메뉴다", () => {
        const { track, onChange } = setup();
        fireEvent.pointerDown(track(), { button: 2, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.6), pointerId: 1 });
        fireEvent.pointerUp(track(), { pointerId: 1 });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("그릴 수 없는 레일은 트랙 대신 이유를 적는다 — 빈 트랙을 주면 그을 수 있는 줄 안다", () => {
        const { container, queryByTitle } = setup({ disabledNote: "배치된 타점이 없습니다" });
        expect(container.textContent).toContain("배치된 타점이 없습니다");
        expect(queryByTitle(/빈 곳을 끌면/)).toBeNull();
    });
});

describe("읽는 재료 — 모집단을 보면서 자른다", () => {
    // 실제 자리를 안 깔면 "5% 위"가 상위 3건인지 300건인지 모른 채 숫자를 정하게 된다(레일의 존재 이유).
    it("자리 표식(틱)이 깔린다", () => {
        const { container } = setup({ ticks: [0.1, 0.5, 0.9] });
        expect(container.querySelectorAll('span[aria-hidden][style*="width: 1px"]')).toHaveLength(3);
    });

    it("현재 타점 자리가 라벨과 함께 선다", () => {
        const { container } = setup({ marker: { frac: 0.4, label: "지금" } });
        expect(container.textContent).toContain("지금");
    });

    it("도메인 양끝 라벨이 척도를 말한다", () => {
        const { container } = setup();
        expect(container.textContent).toContain("약");
        expect(container.textContent).toContain("강");
    });
});
