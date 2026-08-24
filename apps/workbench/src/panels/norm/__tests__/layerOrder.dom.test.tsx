// 정규화 겹치기의 **그리는 순서**를 못박는다.
//
// 이 패널에서 순서는 미학이 아니라 동작이다 — SVG 는 나중에 그린 게 위라, 순서 하나가 뒤집히면
// 그림이 아니라 **손짓이 죽는다**(골격 시절에 두 번 겪은 부류).
//
// ## 순서가 **두 곳**에 산다
// 그림 세 층은 캔버스 한 장으로 갔다. 그래서 재는 자리도 둘로 갈린다:
//   · 캔버스 **안**의 순서 — 표시목록의 순서(PAINT_ORDER). `drawnNames` 로 읽는다.
//   · 캔버스와 SVG **사이**의 순서 — 문서 순서. 눈금 SVG → 캔버스 → 손짓·값 SVG 로 겹친다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { clusterCharts, clusterPins, CODE, DATE, dailyBundle, dailyPin, minuteBundle, minutePin, seedMode, seedPins, stockNames } from "./overlayFixture.js";
import { PAINT_ORDER } from "../../canvas/drawList.js";
import { drawnNames, drawnOps, kindIn } from "./drawProbe.js";

/** 그림 상자 안(클립 그룹)의 층 표식을 **그린 순서대로**. */
function layersOf(container: HTMLElement): string[] {
    return [...container.querySelectorAll("[data-layer]")].map((el) => el.getAttribute("data-layer")!);
}

/** a 가 b 보다 먼저(= 아래) 그려졌나. */
function drawnBefore(layers: string[], a: string, b: string): boolean {
    const i = layers.indexOf(a);
    const j = layers.indexOf(b);
    expect(i, `층 '${a}' 가 화면에 없다`).toBeGreaterThanOrEqual(0);
    expect(j, `층 '${b}' 가 화면에 없다`).toBeGreaterThanOrEqual(0);
    return i < j;
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe.each([
    ["daily" as const, "일봉"],
    ["minute" as const, "분봉"],
])("정규화 겹치기(%s) — 층 순서", (grain, label) => {
    const renderPanel = (): HTMLElement => {
        seedPins(grain, grain === "daily" ? [dailyPin] : [minutePin]);
        return renderWithProviders(<NormOverlayPanel grain={grain} />, {
            charts: [{ code: CODE, date: DATE, data: grain === "daily" ? dailyBundle : minuteBundle }],
            stockNames,
        }).container;
    };

    it(`${label}: 층이 전부 그려진다 — 조건부로 비어도 자리는 남는다`, () => {
        const layers = layersOf(renderPanel());
        // 자리가 남아야 순서를 잴 수 있다. 내용이 비는 층(테마 히트)도 껍데기 <g> 는 나온다.
        // **거터는 분봉 전용**이라 목록이 grain 으로 갈린다(사용자 확정: 일봉엔 적을 값이 없다).
        expect(layers).toEqual([
            // 거터 지시선이 맨 아래 — 눈금 숫자 칸을 가로지르므로 눈금보다 **먼저** 그린다.
            ...(grain === "minute" ? ["gutter-leaders"] : []),
            "axis-ticks", "axis-origin",
            // 그림 세 층(candles·theme-lines·lines)은 여기 없다 — 캔버스로 갔다.
            "theme-hit",
            "line-hit",
            "amount-labels",
            "levels",
            // 원점 점선 → (거터) → 원점 스택 순으로 맨 위. 스택이 마지막이라 무엇에도 안 가린다.
            "origin-leader",
            ...(grain === "minute" ? ["gutter"] : []),
            "origin-stack",
        ]);
    });

    it(`${label}: 캔버스가 PAINT_ORDER 순서대로 그린다`, () => {
        expect(drawnNames(renderPanel())).toEqual([...PAINT_ORDER]);
    });

    it(`${label}: 캔들이 맨 아래 — 선·라벨이 그 위를 지나야 읽힌다`, () => {
        const drawn = drawnNames(renderPanel());
        expect(drawnBefore(drawn, "candles", "theme-lines")).toBe(true);
        expect(drawnBefore(drawn, "candles", "lines")).toBe(true);
    });

    it(`${label}: 테마 선이 정규화 선보다 아래 — 배경이고 주인공은 내 선이다`, () => {
        const drawn = drawnNames(renderPanel());
        expect(drawnBefore(drawn, "theme-lines", "lines")).toBe(true);
    });

    it(`${label}: 값(거래대금 숫자·기준선)은 그림 위 — 가려지면 못 읽는다`, () => {
        // 그림은 캔버스, 값은 그 위 SVG — 문서 순서가 곧 겹치는 순서다.
        const c = renderPanel();
        const canvas = c.querySelector("canvas")!;
        for (const name of ["amount-labels", "levels"]) {
            const el = c.querySelector(`[data-layer="${name}"]`)!;
            expect(canvas.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING, `${name} 이 캔버스보다 앞에 있다`).toBeTruthy();
        }
    });

    it(`${label}: 눈금은 그림 **아래** — 격자가 선 위에 얹히면 그림이 지저분해진다`, () => {
        const c = renderPanel();
        const canvas = c.querySelector("canvas")!;
        const ticks = c.querySelector('[data-layer="axis-ticks"]')!;
        expect(ticks.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});

describe("정규화 겹치기 — 층이 실제로 재료를 받는다", () => {
    // 순서 검사가 **빈 화면을 상대로 헛돌지 않는지** 지킨다. 층 껍데기 <g> 는 재료가 없어도 나오므로
    // 위 순서 테스트만으로는 "그림이 실제로 그려졌다"가 보장되지 않는다.
    it("항목 하나 = 자동 모드 캔들 — 캔들 층에 몸통(rect)이 실제로 있다", () => {
        seedPins("daily", [dailyPin]);
        const { container } = renderWithProviders(<NormOverlayPanel grain="daily" />, {
            charts: [{ code: CODE, date: DATE, data: dailyBundle }], stockNames,
        });
        expect(kindIn(drawnOps(container, "candles"), "rect").length).toBeGreaterThan(0);
        expect(drawnOps(container, "lines")).toHaveLength(0); // 캔들 모드 — 선 층은 빈 자리만 남는다
    });

    it("선 모드(수동)면 선 층에 폴리라인이 실제로 있다", () => {
        seedPins("daily", clusterPins);
        seedMode("daily", "lines");
        const { container } = renderWithProviders(<NormOverlayPanel grain="daily" />, { charts: clusterCharts, stockNames });
        expect(kindIn(drawnOps(container, "lines"), "polyline").length).toBeGreaterThanOrEqual(3);
    });

    it("항목이 없으면 안내 문구 — 그리고 층 순서 검사가 헛돌지 않게 자리도 없다", () => {
        const { container } = renderWithProviders(<NormOverlayPanel grain="daily" />);
        expect(container.textContent).toContain("겹칠 차트가 없습니다");
        expect(layersOf(container)).toEqual([]);
        expect(drawnOps(container, "lines")).toHaveLength(0);
    });
});
