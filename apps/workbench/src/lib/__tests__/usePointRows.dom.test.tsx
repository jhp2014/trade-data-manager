// usePointRows — 행 원천이 격자 파생 하나인지(2026-09-01 손 타점·출처 토글 폐지). 정의(pointDef)를
// 돌리면 그 자리에서 행이 바뀌는 것까지 여기서 못 박는다.
import { afterEach, describe, expect, it } from "vitest";
import { screen, act } from "@testing-library/react";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { renderWithProviders } from "../../test/renderPanel.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePointRows } from "../usePointRows.js";

const grid: PointGrid = {
    base: 10000,
    touch: { min: 550, tv: "0", cum: "0" },
    pivots: [],
    newHighs: [{ min: 560, open: 9950, high: 10050, low: 9900, close: 10050, tv: "6000000000", cum: "6000000000" }],
    prevBase: 9900,
    prevBaseKrx: null,
};

function Probe(): JSX.Element {
    const rows = usePointRows();
    return (
        <div data-testid="rows">
            {rows.points.length}:{rows.points[0]?.time ?? "-"}
        </div>
    );
}

describe("usePointRows — 격자 파생 한 벌", () => {
    // 정의는 전역(영속 슬라이스)이라 되돌린다 — 안 되돌리면 다음 테스트가 게이트 100 을 물려받고,
    // 그 증상이 "행 0" 이라 원인이 안 보인다.
    afterEach(() => useWorkbench.getState().resetPointDef());

    it("행 = 자동 Point(HH:MM:00) — 정의 노브를 올리면 그 자리에서 사라진다", () => {
        // Provider 는 renderWithProviders 의 셸 배선을 그대로 탄다 — 여기서 한 겹 더 감싸면 셸 배선이
        // 빠져도 테스트가 통과해, "파생 한 벌을 셸이 나눠 준다"를 지키는 자리가 정작 그걸 안 밟는다.
        renderWithProviders(
            <Probe />,
            { pointGrids: { version: 1, byDate: new Map([["2026-07-01", new Map([["A", grid]])]]) } },
        );
        expect(screen.getByTestId("rows").textContent).toBe("1:09:20:00"); // 격자 파생(560분 = 09:20)

        // 게이트를 캔들 대금(60억) 위로 올리면 그 캔들은 자격을 잃는다 → 행 0.
        act(() => useWorkbench.getState().setPointDef({ baselineGateEok: 100 }));
        expect(screen.getByTestId("rows").textContent).toBe("0:-");
    });
});
