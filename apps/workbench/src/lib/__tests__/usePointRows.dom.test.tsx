// usePointRows — 행 원천이 **라벨 좌표 한 벌**인지(2026-09-18 「구조 개편」 B — 라벨=타점 진실).
// 정의(pointDef)는 행을 못 바꾼다는 것까지 여기서 못 박는다(격자 파생은 행 원천 지위를 잃었다).
import { afterEach, describe, expect, it } from "vitest";
import { screen, act } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderPanel.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePointRows } from "../usePointRows.js";

function Probe(): JSX.Element {
    const rows = usePointRows();
    return (
        <div data-testid="rows">
            {rows.points.length}:{rows.points.map((p) => `${p.stockCode}@${p.time}`).join(",") || "-"}
        </div>
    );
}

describe("usePointRows — 라벨 좌표 한 벌", () => {
    // 정의는 전역(영속 슬라이스)이라 되돌린다 — 다음 테스트로 새지 않게.
    afterEach(() => useWorkbench.getState().resetPointDef());

    it("행 = 라벨 좌표 — 날짜 내림차순·같은 날 시각 오름차순(옛 rows 계약 승계)", () => {
        renderWithProviders(<Probe />, {
            points: [
                { stockCode: "A", date: "2026-07-01", time: "10:00:00" },
                { stockCode: "B", date: "2026-07-02", time: "09:20:00" },
                { stockCode: "A", date: "2026-07-01", time: "09:20:00" },
            ],
        });
        expect(screen.getByTestId("rows").textContent).toBe("3:B@09:20:00,A@09:20:00,A@10:00:00");
    });

    it("정의 노브는 행을 못 바꾼다 — 라벨은 pointDef 의 함수가 아니다(게이트를 올려도 행 그대로)", () => {
        renderWithProviders(<Probe />, { points: [{ stockCode: "A", date: "2026-07-01", time: "09:20:00" }] });
        expect(screen.getByTestId("rows").textContent).toBe("1:A@09:20:00");
        act(() => useWorkbench.getState().setPointDef({ baselineGateEok: 100 }));
        expect(screen.getByTestId("rows").textContent).toBe("1:A@09:20:00");
    });
});
