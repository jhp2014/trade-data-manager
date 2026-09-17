// useLabelRows — 라벨 행 원천의 결손 규칙: 봉 사실 미도착 좌표는 **pending**(행은 서되 signals 에서
// 빠진다 — 결과·시뮬 값이 안 선다). 조인·정렬은 usePointRows.dom.test 가 함께 잰다.
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderPanel.js";
import { useLabelRows } from "../PointGridsContext.js";

function Probe(): JSX.Element {
    const v = useLabelRows();
    return (
        <div data-testid="labels">
            rows:{v.rows.length} signals:{v.signals.length} pending:{[...v.pendingKeys].sort().join(",") || "-"}
        </div>
    );
}

describe("useLabelRows — 봉 사실 조인", () => {
    it("사실이 있는 좌표만 signals 에 서고, 없는 좌표는 pending 으로 남는다(행은 산다)", () => {
        renderWithProviders(<Probe />, {
            // seed.points 는 격자 사건 봉과 겹쳐 사실이 자동 유도된다(signals 행).
            points: [{ stockCode: "A", date: "2026-07-01", time: "09:20:00" }],
            // 명시 라벨은 격자에 그 분 사건이 없어 사실이 안 선다 — pending.
            pointMemberships: [{ stockCode: "B", date: "2026-07-01", time: "10:00:00", groupNames: ["눌림"] }],
            groups: [{ name: "눌림", parentName: null }],
        });
        expect(screen.getByTestId("labels").textContent).toBe("rows:2 signals:1 pending:B|2026-07-01|10:00:00");
    });

    it("signals 의 값은 봉 사실(격자 사건 봉과 같은 값)이다", () => {
        function ValueProbe(): JSX.Element {
            const v = useLabelRows();
            const s = v.signals[0];
            return <div data-testid="sig">{s ? `${s.min}:${s.close}:${s.high}` : "-"}</div>;
        }
        renderWithProviders(<ValueProbe />, { points: [{ stockCode: "A", date: "2026-07-01", time: "09:20:00" }] });
        // gridsFromPoints 의 단일 시드: 사건 봉 close=high=101, 09:20 = 560분.
        expect(screen.getByTestId("sig").textContent).toBe("560:101:101");
    });
});
