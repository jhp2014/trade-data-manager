// 호버 시 **나머지가 확실히 흐려지는지**를 화면에서 못박는다(사용자 지적: "겹쳤을 때 하나에 손을
// 올리면 나머지가 많이 흐려져야 한다 — 잘 안 보여").
//
// 겪은 버그: base 역할(고정만 해 둔, 시선도 호버도 아닌 항목)은 `dim`(뭔가 강조돼 있으면 늘 참) 만
// 봤는데, 그 값은 호버 여부와 무관하게 늘 같은 수라 **호버해도 그림이 하나도 안 바뀌었다** —
// 시선이 하나라도 있으면 dim 은 이미 항상 참이었기 때문이다. lineVisual 이 base 에도 recede
// (지금 이 순간 딴 걸 짚었나)를 주고, 렌더러가 recede 를 dim 보다 먼저 보게 고친 자리다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { clusterCharts, clusterPins, DATE, seedMode, stockNames } from "./overlayFixture.js";
import { drawnLayers } from "./drawProbe.js";
import { useWorkbench } from "../../../store/workbench.js";

/** 캔들 층 각 그룹의 진하기(도형 하나하나가 아니라 그룹 단위 — 캔버스 알파는 그룹에 걸린다). */
const candleOpacities = (c: HTMLElement): number[] =>
    (drawnLayers(c).find((l) => l.name === "candles")?.groups ?? []).map((g) => g.opacity ?? 1);

const renderPanel = (): HTMLElement => {
    seedPins("daily");
    return renderWithProviders(<NormOverlayPanel grain="daily" />, { charts: clusterCharts, stockNames }).container;
};

function seedPins(grain: "daily" | "minute"): void {
    localStorage.setItem(`wb.normPins.${grain}`, JSON.stringify(clusterPins));
}

beforeEach(() => {
    localStorage.clear();
    // 시선(focus) 없음 — 3항목이 전부 role=base 인 순수한 상태에서 recede 만 잰다.
    useWorkbench.setState({ activePoint: null, focus: { date: DATE, code: "", time: null } });
});
afterEach(() => localStorage.clear());

describe("호버 중 나머지 항목의 흐림", () => {
    it("호버 전엔 세 항목의 진하기가 전부 같다 — 아직 아무도 안 짚었다", () => {
        seedMode("daily", "candles"); // 자동 판정과 무관하게 캔들 모드를 못박는다
        const c = renderPanel();
        const distinct = new Set(candleOpacities(c).map((o) => o.toFixed(4)));
        expect(distinct.size).toBe(1);
    });

    it("하나에 손을 올리면 **그 항목만 밝고 나머지는 평소보다 더 흐려진다**", () => {
        seedMode("daily", "candles");
        const c = renderPanel();
        const before = candleOpacities(c);
        const baseline = before[0];

        // 원점 스택 칩 하나에 마우스를 올린다 — 손짓은 이 층의 유일한 손잡이다.
        const chip = [...c.querySelectorAll('[data-layer="origin-stack"] button')]
            .find((b) => !(b.textContent ?? "").startsWith("+"))!;
        fireEvent.mouseOver(chip, { relatedTarget: document.body });

        const after = candleOpacities(c);
        const lit = Math.max(...after);
        const receded = Math.min(...after);

        expect(lit).toBeGreaterThan(baseline); // 짚은 것은 더 밝아진다
        expect(receded).toBeLessThan(baseline); // 나머지는 평소보다 더 흐려진다 — 이게 이번 수정의 본론
        expect(new Set(after.map((o) => o.toFixed(4))).size).toBeGreaterThan(1); // 더는 다 같은 진하기가 아니다
    });

    it("선 모드에서도 같은 계약 — 두 그리기 경로(캔들·선)가 각자 자기 우선순위를 갖고 있었다", () => {
        seedMode("daily", "lines");
        const c = renderPanel();
        const opacityOf = (name: string): number[] =>
            (drawnLayers(c).find((l) => l.name === name)?.groups ?? []).map((g) => g.opacity ?? 1);
        const before = opacityOf("lines");

        const chip = [...c.querySelectorAll('[data-layer="origin-stack"] button')]
            .find((b) => !(b.textContent ?? "").startsWith("+"))!;
        fireEvent.mouseOver(chip, { relatedTarget: document.body });

        const after = opacityOf("lines");
        expect(Math.min(...after)).toBeLessThan(before[0]);
        expect(Math.max(...after)).toBeGreaterThan(before[0]);
    });
});
