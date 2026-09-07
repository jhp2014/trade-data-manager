// 정의 레일의 **손짓과 정산** — 필터 레일(Rail.dom.test)과 같은 층을 다른 규약으로 잰다.
//
// 여기서 지키는 것 셋: ① 커밋은 손 뗄 때 한 번이고 **취소는 커밋이 아니다**(확정 안 한 값이 정의로
// 들어가면 전 파생이 헛돈다) ② 못 끄는 끝(도메인에 못 박힌 쪽)은 손잡이도 없고 값도 안 움직인다
// ③ 칸보다 좁은 컷도 막대가 물든다(스트립 전체가 제외 색이 되는 사고).
//
// toFrac/fromFrac 은 항등 — 척도·스냅은 호출자(PointDefPanel)의 몫이라 여기선 방해다.
// 트랙 폭은 setup 의 getBoundingClientRect 가 1000px 로 물린다: frac = (clientX − 22) / 956.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { RAIL_PAD } from "../../filter/rail/Rail.js";
import { HIST_BINS } from "../../filter/rail/railHistogram.js";
import { approachInside } from "../../../lib/defDistribution.js";
import { DefRail, type DefRailProps } from "../DefRail.js";

const WIDTH = 1000;
const xAt = (frac: number): number => RAIL_PAD + frac * (WIDTH - 2 * RAIL_PAD);

function setup(over: Partial<DefRailProps> = {}) {
    const onCommit = vi.fn();
    const utils = render(
        <DefRail
            label="테스트"
            unit="자 = 값"
            toFrac={(v) => v}
            fromFrac={(f) => f}
            fmt={(v) => v.toFixed(2)}
            minLabel="약"
            maxLabel="강"
            values={[0.1, 0.2, 0.5, 0.9]}
            mode="lower"
            from={0.2}
            to={1}
            note={(inside, outside) => ({ text: `안 ${inside} / 밖 ${outside}`, title: "t" })}
            onCommit={onCommit}
            {...over}
        />,
    );
    const track = (): HTMLElement => utils.container.querySelector('[title^="빈 곳을 끌면"], [title^="누르거나"]') as HTMLElement;
    const bin = (i: number): HTMLElement => utils.container.querySelector(`[data-bin="${i}"]`) as HTMLElement;
    return { ...utils, onCommit, track, bin };
}

describe("커밋 규약", () => {
    it("드래그 중엔 안 부르고 손 뗄 때 한 번 — 정의는 한 번 바뀔 때마다 전 파생이 돈다", () => {
        const { track, onCommit } = setup();
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.3), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.4), pointerId: 1 });
        expect(onCommit).not.toHaveBeenCalled();
        fireEvent.pointerUp(track(), { pointerId: 1 });
        expect(onCommit).toHaveBeenCalledOnce();
        expect(onCommit.mock.calls[0][0].from).toBeCloseTo(0.4, 2);
    });

    it("취소(pointercancel)는 커밋이 아니다 — 미리보기만 버린다", () => {
        const { track, onCommit } = setup();
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.3), pointerId: 1 });
        fireEvent.pointerMove(track(), { clientX: xAt(0.45), pointerId: 1 });
        fireEvent.pointerCancel(track(), { pointerId: 1 });
        expect(onCommit).not.toHaveBeenCalled();
    });
});

describe("컷 모양", () => {
    it("lower 는 왼쪽 컷만 움직인다 — 오른끝은 도메인이라 손잡이도 없다", () => {
        const { track, onCommit, container } = setup({ mode: "lower", from: 0.2, to: 1 });
        expect(container.querySelectorAll('[title="끌어서 이 경계 조정"]')).toHaveLength(1);
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.6), pointerId: 1 });
        fireEvent.pointerUp(track(), { pointerId: 1 });
        const arg = onCommit.mock.calls[0][0] as { from: number; to: number };
        expect(arg.from).toBeCloseTo(0.6, 2);
        expect(arg.to).toBe(1);
    });

    it("upper 는 오른쪽 컷만 움직인다 — 왼끝 고정", () => {
        const { track, onCommit } = setup({ mode: "upper", from: 0, to: 0.5 });
        fireEvent.pointerDown(track(), { button: 0, clientX: xAt(0.3), pointerId: 1 });
        fireEvent.pointerUp(track(), { pointerId: 1 });
        const arg = onCommit.mock.calls[0][0] as { from: number; to: number };
        expect(arg.from).toBe(0);
        expect(arg.to).toBeCloseTo(0.3, 2);
    });
});

describe("정산과 막대", () => {
    it("정산은 값으로 센다(비닝 오차 없음) — upper 는 열린 끝을 넘겨 셀 수 있다", () => {
        const closed = setup({ mode: "upper", from: 0, to: 0.5, values: [0, 0.2, 0.5, 0.9] });
        expect(closed.container.textContent).toContain("안 3 / 밖 1"); // 기본 = 양 끝 포함
        closed.unmount();
        const open = setup({ mode: "upper", from: 0, to: 0.5, values: [0, 0.2, 0.5, 0.9], insideOf: approachInside }); // 근접 레일이 실제로 무는 규약 그대로
        expect(open.container.textContent).toContain("안 2 / 밖 2"); // 근접 레일의 규약(d < m')
    });

    it("분포는 접을 수 있다 — 접어도 정산(값으로 센 수)은 남는다", () => {
        const { container, bin } = setup({ values: [0.1, 0.5, 0.9] });
        expect(bin(0)).not.toBeNull(); // 기본 = 펼침(이 판의 존재 이유)
        fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "분포")!);
        expect(container.querySelector("[data-bin]")).toBeNull(); // 막대가 사라진다(memo 도 안 돈다)
        expect(container.textContent).toContain("안 "); // 정산 줄은 그대로
    });

    it("칸보다 좁은 컷도 그 칸이 물든다 — 스트립 전체가 제외 색이 되면 '여긴 아무것도 없다'로 읽힌다", () => {
        const narrow = 1 / HIST_BINS / 4; // 칸의 1/4 폭
        const { bin } = setup({ from: 0.5, to: 0.5 + narrow, values: [0.5, 0.505] });
        const alive = bin(Math.floor(0.5 * HIST_BINS));
        expect(alive.getAttribute("title")).not.toContain("컷 밖");
        expect(bin(0).getAttribute("title")).toContain("컷 밖");
    });
});
