// 수준선(기준선)의 **스케일** — 번들이 두 자를 같이 싣는다는 사실을 화면이 아는가.
//
// 번들의 `daily` 는 수정주가(전 구간 오늘 스케일), `minutes` 는 원주가(그 날 값)다. 감자·액분이 차트 날짜
// **뒤에** 있었던 종목은 수정주가가 소급 재작성돼 둘이 배율만큼 다른 자에 있다 — 그대로 섞으면 일봉 앵커로
// 그은 기준선이 분봉 뷰에서 엉뚱한 높이에 선다(실측: 액분 5:1 종목에서 축 값이 +409.8% 로 폭주한 그 원인).
// 그래서 분봉 뷰의 수준선은 번들의 rawScale 로 원주가 스케일에 내려놓는다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ChartAnchor } from "@trade-data-manager/wire";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { CODE, DATE, TIME, minuteBundle, seedPins, minutePin, stockNames } from "./overlayFixture.js";
import type { ChartBundle } from "../../../api/chart.js";

/** 액분 5:1 이 그 뒤에 있었던 날 — 수정주가는 원주가의 1/5, 되돌리는 계수(rawScale)는 5. */
const SCALE = 5;
const ANCHOR_DATE = "2026-07-07";
/** 기준선 앵커가 가리키는 일봉 고가 — **수정주가**라 원주가로는 10,000 이다. */
const ANCHOR_HIGH_ADJ = 2_000;

const bar = (v: number) => ({ open: String(v), high: String(v), low: String(v), close: String(v), volume: "1", amount: "1" });

/** 분봉(원주가)은 픽스처 그대로, 일봉만 수정주가 한 줄을 얹은 번들. */
const bundleOf = (rawScale: number | undefined): ChartBundle => ({
    ...minuteBundle,
    daily: [{ stockCode: CODE, date: ANCHOR_DATE, krx: bar(ANCHOR_HIGH_ADJ), un: bar(ANCHOR_HIGH_ADJ) }],
    ...(rawScale === undefined ? {} : { rawScale }),
});

const anchors: ChartAnchor[] = [
    { stockCode: CODE, date: DATE, param: "baseline", anchorDate: ANCHOR_DATE, field: "high", market: "un" },
];

/** 기준선 라벨들 — LevelsLayer 는 "기준 " 접두어로 확정 선을 갈라 적는다. */
function baselineLabels(container: HTMLElement): string[] {
    return [...container.querySelectorAll('[data-layer="levels"] text')]
        .map((el) => el.textContent ?? "")
        .filter((t) => t.startsWith("기준 "));
}

const render = (rawScale: number | undefined): HTMLElement =>
    renderWithProviders(<NormOverlayPanel grain="minute" />, {
        charts: [{ code: CODE, date: DATE, data: bundleOf(rawScale) }],
        anchors,
        stockNames,
        daySnapshot: { date: DATE, data: { date: DATE, stocks: [] } }, // 테마·거래대금은 이 테스트의 관심사가 아니다
    }).container;

beforeEach(() => {
    seedPins("minute", [minutePin]);
    // 수준선은 **짚은 선**에만 붙는다(levelOwners) — 활성 타점이 그 하나가 된다.
    useWorkbench.getState().goToPoint({ code: CODE, date: DATE, time: TIME }, "test");
});

afterEach(() => {
    useWorkbench.setState({ activePoint: null });
    localStorage.clear();
});

describe("정규화 분봉 뷰 — 기준선의 스케일", () => {
    // 타점 시각 원주가 12,000 · 전일 종가 9,500 → 원점(타점)의 전일比 +26.3%.
    // 기준선 원주가 = 2,000 × 5 = 10,000 → 전일比 +5.3% → 원점 대비 −21.1%p.
    it("일봉 앵커(수정주가)를 rawScale 로 원주가 자에 내려놓는다", () => {
        expect(baselineLabels(render(SCALE))).toEqual(["기준 -21.1% (+5.3%)"]);
    });

    it("계수가 없는(옛 서버) 번들은 1 로 — 계수가 없던 시절의 동작 그대로", () => {
        // 되돌리지 않으면 2,000 은 전일 종가의 21% 밖에 안 되는 값이라 선이 화면 한참 아래에 선다.
        expect(baselineLabels(render(undefined))).toEqual(["기준 -105.3% (-78.9%)"]);
    });
});
