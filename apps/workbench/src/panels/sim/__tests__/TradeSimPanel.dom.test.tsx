// 트레이드 시뮬 패널 — 분류·체결률이 노브를 따라 움직이고, 노브 커밋이 pointDef.sim(파서 클램프)을
// 지나는지. 격자는 OutcomePanel.dom.test 와 같은 방식으로 직접 심는다(pointGridsQuery 캐시 덮어쓰기).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { pointGridsQuery } from "../../../api/queries.js";
import { useWorkbench } from "../../../store/workbench.js";
import { TradeSimPanel } from "../TradeSimPanel.js";

const DATE = "2026-07-06";

/** 시그널 1개짜리 격자(OutcomePanel.dom.test 의 gridOf 와 같은 뼈대) — Point 봉 570(종가 101) 뒤 (고,저) 쌍들. */
const gridOf = (pairs: readonly [high: number, low: number][]): PointGrid => ({
    base: 100,
    touch: { min: 560, tv: "1000000000", cum: "1000000000" },
    pivots: pairs.flatMap(([high, low], i) => [
        {
            kind: "high" as const, min: 575 + i * 15, price: high, confirmedMin: 580 + i * 15,
            cum: String((3 + 2 * i) * 1_000_000_000),
            cross: i === 0 ? null : { min: 573 + i * 15, tv: "1000000000", cum: String((2 + 2 * i) * 1_000_000_000) },
        },
        { kind: "low" as const, min: 580 + i * 15, price: low, confirmedMin: 585 + i * 15, cum: String((4 + 2 * i) * 1_000_000_000), cross: null },
    ]),
    newHighs: [{ min: 570, open: 100, high: 101, low: 100, close: 101, tv: "6000000000", cum: "2000000000", maxBefore: 0 }],
    prevBase: 100,
    prevBaseKrx: null,
    sessionHigh: pairs.length > 0
        ? { min: 575 + (pairs.length - 1) * 15, price: pairs[pairs.length - 1]![0] }
        : { min: 570, price: 101 },
});

// 시그널 종가 101, 이후 저점이 전부 104 이상 — 지정가(n≥2)는 원리적으로 전부 미체결(눌림 부족),
// n=0(즉시 체결)이면 전부 익절(고점 110~130 ≥ 익절가 106.05, 트레일 4% 즉발).
const GRIDS = new Map([
    ["005930", gridOf([[110, 104], [120, 110]])],
    ["000660", gridOf([[130, 122]])],
    ["035720", gridOf([[118, 111]])],
]);

const SEED: Seed = { candidateDays: [...GRIDS.keys()].map((stockCode) => ({ stockCode, date: DATE })) };

const renderPanelUnder = (): ReturnType<typeof render> => {
    const client = seededClient(SEED);
    client.setQueryData(pointGridsQuery().queryKey, { version: 1, byDate: new Map([[DATE, GRIDS]]) });
    return render(<TradeSimPanel />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={client}>{children}</Providers>,
    });
};

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [], panelUi: {}, sessionUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); useWorkbench.getState().resetPointDef(); });
afterEach(() => { useWorkbench.setState(RESET); useWorkbench.getState().resetPointDef(); localStorage.clear(); });

const simOf = (): ReturnType<typeof useWorkbench.getState>["pointDef"]["sim"] => useWorkbench.getState().pointDef.sim;

describe("트레이드 시뮬 패널", () => {
    it("기본 노브(타점 −3%) — 눌림이 종가 위라 전부 눌림부족, 체결 0", () => {
        const { container } = renderPanelUnder();
        expect(container.textContent).toContain("모수 3");
        expect(container.textContent).toContain("체결 0");
        expect(container.textContent).toContain("눌림부족 3");
        expect(container.textContent).toContain("익절 0");
    });

    it("타점 n=0(즉시 체결) — 전부 체결·익절, 체결률 100%", () => {
        useWorkbench.getState().setPointDef({ sim: { ...simOf(), entry: { anchor: "close", pct: 0 } } });
        const { container } = renderPanelUnder();
        expect(container.textContent).toContain("체결 3 (100%)");
        expect(container.textContent).toContain("익절 3");
        expect(container.textContent).toContain("눌림부족 0");
    });

    it("노브 커밋은 파서 클램프를 지난다 — 손절 '1' 커밋이 2 로 올라간다", () => {
        const { container } = renderPanelUnder();
        const field = [...container.querySelectorAll("label")].find((l) => l.textContent?.startsWith("손절"))!;
        const input = field.querySelector("input")!;
        fireEvent.change(input, { target: { value: "1" } });
        fireEvent.blur(input);
        expect(simOf().stopPct).toBe(2);
        expect(input.value).toBe("2"); // 초안 잔상 없이 실값 표시
    });

    it("취소↑ 칩 토글 — off(null) ↔ on(기본 5), NumField 도 따라 나타난다", () => {
        const { container } = renderPanelUnder();
        expect(simOf().cancelRisePct).toBeNull();
        const chip = [...container.querySelectorAll("button")].find((b) => b.textContent === "취소↑")!;
        fireEvent.click(chip);
        expect(simOf().cancelRisePct).toBe(5);
        fireEvent.click(chip);
        expect(simOf().cancelRisePct).toBeNull();
    });
});
