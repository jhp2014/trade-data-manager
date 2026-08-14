// 골격 겹쳐 그리기의 **그리는 순서**를 못박는다.
//
// 이 패널에서 순서는 미학이 아니라 동작이다 — SVG 는 나중에 그린 게 위라, 순서 하나가 뒤집히면
// 그림이 아니라 **손짓이 죽는다**. 실제로 두 번 겪었고 둘 다 주석으로만 남아 있었다:
//   · 핀 세로선의 10px 투명 히트 영역이 피벗 손잡이보다 **뒤에** 오면 그 x 의 점 클릭을 통째로 삼킨다
//     (핀을 찍고 나면 못 떼던 버그).
//   · 캔들이 골격선보다 **위에** 오면 "축약이 원본의 어디를 밟았나"가 안 읽힌다.
//
// 주석은 사람이 지키고 테스트는 기계가 지킨다. 층을 파일로 떼어내는 중이라(캔들·거래대금 완료,
// 테마·핀 예정) 부르는 자리가 옮겨 다니는데, 그때 순서가 조용히 뒤집히는 걸 여기서 잡는다.
//
// 층 표식은 `<g data-layer="...">` 다. 그리기와 무관한 속성이라 이 표식 자체가 화면을 안 바꾼다.
import { describe, it, expect } from "vitest";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { points, skeletonFeed as feed } from "./overlayFixture.js";

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

describe.each([
    ["daily" as const, "일봉"],
    ["minute" as const, "분봉"],
])("골격 겹쳐 그리기(%s) — 층 순서", (grain, label) => {
    const renderPanel = (): HTMLElement =>
        renderWithProviders(<SkeletonOverlayPanel grain={grain} />, { skeletons: feed, points }).container;

    it(`${label}: 층이 전부 그려진다 — 조건부로 비어도 자리는 남는다`, () => {
        const layers = layersOf(renderPanel());
        // 자리가 남아야 순서를 잴 수 있다. 내용이 비는 층(테마·핀)도 껍데기 <g> 는 나온다.
        // 테마가 꺼져 있으면 지시선·거터는 **아예 없다**(켰을 때만 서는 층 — themeLayer 테스트가 본다).
        expect(layers).toEqual([
            "axis-ticks",
            "candles",
            "theme-lines",
            "theme-hit",
            "skeleton-lines",
            "pin-verticals",
            "line-hit",
            "pivot-handles",
            "amount-labels",
            "levels",
        ]);
    });

    it(`${label}: 캔들이 맨 아래 — 골격이 그 위를 지나야 축약이 원본의 어디를 밟았나가 읽힌다`, () => {
        const layers = layersOf(renderPanel());
        expect(drawnBefore(layers, "candles", "theme-lines")).toBe(true);
        expect(drawnBefore(layers, "candles", "skeleton-lines")).toBe(true);
    });

    it(`${label}: 테마 선이 골격선보다 아래 — 배경이고 주인공은 내 골격이다`, () => {
        const layers = layersOf(renderPanel());
        expect(drawnBefore(layers, "theme-lines", "skeleton-lines")).toBe(true);
    });

    // ⚠ 이 두 개가 이 파일의 존재 이유다 — 겪은 버그가 정확히 여기서 났다.
    it(`${label}: 핀 세로선이 피벗 손잡이보다 **먼저** — 뒤에 오면 10px 투명선이 점 클릭을 삼킨다`, () => {
        const layers = layersOf(renderPanel());
        expect(drawnBefore(layers, "pin-verticals", "pivot-handles")).toBe(true);
    });

    it(`${label}: 골격선 히트라인도 피벗 손잡이보다 먼저 — 손잡이가 맨 위여야 핀을 뗄 수 있다`, () => {
        const layers = layersOf(renderPanel());
        expect(drawnBefore(layers, "line-hit", "pivot-handles")).toBe(true);
    });

    it(`${label}: 값(거래대금 숫자·기준선)은 그림 위 — 가려지면 못 읽는다`, () => {
        const layers = layersOf(renderPanel());
        expect(drawnBefore(layers, "skeleton-lines", "amount-labels")).toBe(true);
        expect(drawnBefore(layers, "skeleton-lines", "levels")).toBe(true);
    });
});

describe("골격 겹쳐 그리기 — 층이 실제로 재료를 받는다", () => {
    // 순서 검사가 **빈 화면을 상대로 헛돌지 않는지** 지킨다. 층 껍데기 <g> 는 재료가 없어도 나오므로
    // 위 순서 테스트만으로는 "그림이 실제로 그려졌다"가 보장되지 않는다 — 실제로 분봉 픽스처의 t 통화를
    // 잘못 잡아 화면이 통째로 비었을 때 이 검사가 그걸 잡아냈다.
    it.each([["daily" as const], ["minute" as const]])("%s: 골격선 층에 폴리라인이 실제로 있다", (grain) => {
        const { container } = renderWithProviders(<SkeletonOverlayPanel grain={grain} />, { skeletons: feed, points });
        const lines = container.querySelector('[data-layer="skeleton-lines"]');
        expect(lines?.querySelectorAll("polyline").length ?? 0).toBeGreaterThan(0);
    });

    it("골격이 없으면 안내 문구 — 그리고 층 순서 검사가 헛돌지 않게 자리도 없다", () => {
        const { container } = renderWithProviders(<SkeletonOverlayPanel grain="daily" />);
        expect(container.textContent).toContain("골격이 그려진 차트가 없습니다");
        expect(layersOf(container)).toEqual([]);
    });
});
