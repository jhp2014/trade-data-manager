// usePointRows — 출처 토글(auto/hand)이 행 원천을 실제로 갈아끼우는지. 제품 기본(auto) 경로의 유일한
// 자동 배선 테스트다(test/setup 은 픽스처 정합상 전 테스트를 hand 로 리셋하므로 여기서 명시로 켠다).
import { describe, expect, it } from "vitest";
import { screen, act } from "@testing-library/react";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { renderWithProviders } from "../../test/renderPanel.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePointRows } from "../usePointRows.js";

const grid: PointGrid = {
    base: 10000,
    touchMin: 550,
    pivots: [],
    newHighs: [{ min: 560, high: 10050, tv: "6000000000", tvMax2: "6000000000", bull: true }],
};

function Probe(): JSX.Element {
    const rows = usePointRows();
    return (
        <div data-testid="rows">
            {rows.source}:{rows.points.length}:{rows.points[0]?.time ?? "-"}
        </div>
    );
}

describe("usePointRows — 출처 토글", () => {
    it("auto = 격자 파생 행(HH:MM:00), hand = 수동 타점 — 같은 화면이 출처만 갈아끼운다", () => {
        // Provider 는 renderWithProviders 의 셸 배선을 그대로 탄다 — 여기서 한 겹 더 감싸면 셸 배선이
        // 빠져도 테스트가 통과해, "파생 한 벌을 셸이 나눠 준다"를 지키는 자리가 정작 그걸 안 밟는다.
        renderWithProviders(
            <Probe />,
            {
                points: [{ stockCode: "B", date: "2026-07-02", time: "10:11:00" }],
                pointGrids: { version: 1, byDate: new Map([["2026-07-01", new Map([["A", grid]])]]) },
            },
        );
        expect(screen.getByTestId("rows").textContent).toBe("hand:1:10:11:00"); // setup 리셋 기본

        act(() => useWorkbench.setState({ pointSource: "auto" }));
        expect(screen.getByTestId("rows").textContent).toBe("auto:1:09:20:00"); // 격자 파생(560분 = 09:20)

        act(() => useWorkbench.setState({ pointSource: "hand" }));
        expect(screen.getByTestId("rows").textContent).toBe("hand:1:10:11:00");
    });
});
