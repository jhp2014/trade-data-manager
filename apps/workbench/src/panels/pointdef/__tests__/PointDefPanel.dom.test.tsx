// 타점 정의 판의 **배선** — 레일에서 그은 것이 정규화를 지나 정의로 앉나, 지우면 조건 없음으로 돌아오나.
//
// 컷 대수(railModel)·정규화(parsePointDef)·분포(defDistribution)는 각자 덮여 있다. 여기서 재는 건
// 그 사이다: 자격 시각 줄이 **필터 레일 `Rail`** 로 이사하면서 생긴 이음매(구간 여럿·✕ 삭제·teal 색),
// 그리고 정산이 판정과 같은 규칙(빈 목록 = 전부)을 쓰는지.
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, act } from "@testing-library/react";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { RAIL_PAD } from "../../filter/rail/Rail.js";
import { FILTER, POINT_DEF } from "../../../styles/palette.js";
import { PointDefPanel } from "../PointDefPanel.js";

/** 09:20(560분)에 60억 자격 캔들 하나 — usePointRows 테스트와 같은 픽스처 규격. */
const gridAt = (min: number): PointGrid => ({
    base: 10000,
    touch: { min: 550, tv: "0", cum: "0" },
    pivots: [],
    newHighs: [{ min, open: 9950, high: 10050, low: 9900, close: 10050, tv: "6000000000", cum: "6000000000", maxBefore: 0 }],
    prevBase: 9900,
    prevBaseKrx: null,
    sessionHigh: { min, price: 10050 },
});

const WIDTH = 1000; // setup 의 getBoundingClientRect 가 물리는 폭
const SPAN = 1200 - 480; // 자격 시각 도메인(분)
const xAtMin = (min: number): number => RAIL_PAD + ((min - 480) / SPAN) * (WIDTH - 2 * RAIL_PAD);

function render() {
    return renderWithProviders(<PointDefPanel />, {
        pointGrids: { version: 1, byDate: new Map([["2026-07-01", new Map([["A", gridAt(560)], ["B", gridAt(800)]])]]) },
    });
}

/** `#rrggbb` → jsdom 이 되돌려 주는 `rgb(r, g, b)` 표기. */
const rgbOf = (hex: string): string =>
    `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

const timeTrack = (container: HTMLElement): HTMLElement => {
    const rows = [...container.querySelectorAll(".rail-row")];
    const row = rows.find((r) => r.textContent?.includes("자격 시각"));
    return row!.querySelector('[title^="빈 곳을 끌면"]') as HTMLElement;
};

describe("타점 정의 판 — 자격 시각", () => {
    // 정의는 전역(영속 슬라이스)이라 되돌린다 — 안 되돌리면 다음 테스트가 남의 창을 물려받는다.
    afterEach(() => act(() => useWorkbench.getState().resetPointDef()));

    it("빈 트랙을 그으면 그 구간이 정의가 된다 — 정규화(정수 분)를 지나 앉는다", () => {
        const { container } = render();
        const track = timeTrack(container);
        fireEvent.pointerDown(track, { button: 0, clientX: xAtMin(540), pointerId: 1 });
        fireEvent.pointerMove(track, { clientX: xAtMin(660), pointerId: 1 });
        fireEvent.pointerUp(track, { pointerId: 1 });
        const [w] = useWorkbench.getState().pointDef.qualifyWindows;
        expect(w).toBeDefined();
        expect(Number.isInteger(w!.from)).toBe(true);
        expect(w!.from).toBeGreaterThanOrEqual(535);
        expect(w!.to).toBeLessThanOrEqual(665);
    });

    it("구간을 지우면 **조건 없음**으로 돌아온다 — 빈 목록이 이 필드의 정상 상태다", () => {
        const { container } = render();
        act(() => useWorkbench.getState().setPointDef({ qualifyWindows: [{ from: 540, to: 600 }] }));
        const row = [...container.querySelectorAll(".rail-row")].find((r) => r.textContent?.includes("자격 시각"))!;
        fireEvent.click(row.querySelector('[title="이 구간 삭제"]') as HTMLElement);
        expect(useWorkbench.getState().pointDef.qualifyWindows).toEqual([]);
    });

    it("정산은 판정과 같은 규칙이다 — 빈 목록이면 전부 창 안", () => {
        const { container } = render();
        expect(container.textContent).toContain("창 안 2 / 밖 0"); // 시그널 둘(09:20·13:20)
        act(() => useWorkbench.getState().setPointDef({ qualifyWindows: [{ from: 540, to: 600 }] }));
        expect(container.textContent).toContain("창 안 1 / 밖 1"); // 09:20 만 창 안
    });

    it("정의층 레일은 조건(FILTER 빨강)이 아니라 정의 색이다 — 층이 갈렸다는 유일한 표식", () => {
        const { container } = render();
        act(() => useWorkbench.getState().setPointDef({ qualifyWindows: [{ from: 540, to: 600 }] }));
        const row = [...container.querySelectorAll(".rail-row")].find((r) => r.textContent?.includes("자격 시각"))!;
        const label = row.querySelector('[title="끌어서 이 경계 조정"]') as HTMLElement;
        expect(label.style.color).toBe(rgbOf(POINT_DEF)); // jsdom 은 인라인 색을 rgb() 로 정규화한다
        expect(label.style.color).not.toBe(rgbOf(FILTER));
    });

    it("시그널 수는 정의를 따라 움직인다 — 판 머리가 모수를 말한다", () => {
        const { container } = render();
        expect(screen.getByText("2")).toBeDefined(); // 시그널 2
        act(() => useWorkbench.getState().setPointDef({ qualifyWindows: [{ from: 540, to: 600 }] }));
        expect(container.textContent).toContain("시그널");
        expect(useWorkbench.getState().pointDef.qualifyWindows).toHaveLength(1);
    });
});
