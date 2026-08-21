// 시리즈 데이터 푸시의 **수명주기 계약** — "직전에 적용한 것"을 근거로 일을 건너뛰는 두 최적화
// (증분 update·마커 스킵)가 **시리즈가 살아 있는 동안에만** 유효하다는 규칙.
//
// 이 파일이 막는 회귀(2026-08-21 사용자 보고, "첫 종목을 클릭하면 일봉이 하나만 나온다"):
//   StrictMode 는 마운트 직후 모든 effect 를 정리했다 다시 실행하는데 **ref 는 살아남는다**.
//   시리즈는 파괴·재생성됐는데 "직전 적용분"만 살아남아 연장 판정을 통과 → 빈 시리즈에 꼬리 1봉만
//   update → 2년치 일봉이 캔들 하나로 보였다. 개발 서버(StrictMode·Fast Refresh)에서만 나던 버그다.
//
// 그래서 여기서는 **진짜 StrictMode 로 렌더**한다 — 가짜 차트를 하나 세워 훅 두 벌(시리즈 수명주기 +
// 데이터 푸시)을 실제로 태우고, 마지막에 살아 있는 시리즈에 봉이 전부 들어갔는지 본다. 판정 함수
// (extendsPrevBars) 단위 테스트는 candleAmountSeries.test.ts 몫 — 여긴 배선이 관심사다.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode, type RefObject } from "react";
import { render } from "@testing-library/react";
import type { IChartApi } from "lightweight-charts";
import { useDailySeries, useDailySeriesData } from "../dailyChartHooks.js";
import { useMinuteSeries, useMinuteSeriesData } from "../minuteSeries.js";
import type { DailyPoint, MinutePoint } from "../../lib/derive.js";

// 마커 플러그인은 lightweight-charts 의 실제 구현이 시리즈 내부를 만지므로 가짜로 바꾼다.
// (vi.mock 은 호이스팅되므로 기록판은 vi.hoisted 로 만든다.)
const { markerPlugins } = vi.hoisted(() => ({
    markerPlugins: [] as { owner: unknown; calls: number[] }[],
}));

vi.mock("lightweight-charts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("lightweight-charts")>();
    return {
        ...actual,
        createSeriesMarkers: (owner: unknown) => {
            const plugin = { owner, calls: [] as number[], setMarkers: (m: unknown[]) => plugin.calls.push(m.length) };
            markerPlugins.push(plugin);
            return plugin;
        },
    };
});

/** 가짜 시리즈 — "무엇이 들어갔나"만 기록한다(픽셀은 관심사가 아니다). */
class FakeSeries {
    bars = new Map<unknown, { time: unknown }>();
    setDataCount = 0;
    updateCount = 0;
    setData(data: { time: unknown }[]): void {
        this.setDataCount++;
        this.bars = new Map(data.map((b) => [b.time, b]));
    }
    update(bar: { time: unknown }): void {
        this.updateCount++;
        this.bars.set(bar.time, bar);
    }
    attachPrimitive(): void {}
    detachPrimitive(): void {}
    applyOptions(): void {}
    createPriceLine(): object {
        return {};
    }
}

/** addSeries 호출마다 새 가짜 시리즈 — 생성 순서는 캔들, 거래대금(골조가 그 순서로 만든다). */
function fakeChart(): { chartRef: RefObject<IChartApi | null>; series: FakeSeries[] } {
    const series: FakeSeries[] = [];
    const chart = {
        addSeries: () => {
            const s = new FakeSeries();
            series.push(s);
            return s;
        },
        priceScale: () => ({ applyOptions: () => {} }),
        panes: () => [{ setStretchFactor: () => {} }, { setStretchFactor: () => {} }],
        timeScale: () => ({
            subscribeVisibleLogicalRangeChange: () => {},
            unsubscribeVisibleLogicalRangeChange: () => {},
        }),
    };
    return { chartRef: { current: chart as unknown as IChartApi }, series };
}

const candlesOf = (series: FakeSeries[]): FakeSeries[] => series.filter((_, i) => i % 2 === 0); // 짝수 = 캔들

const daily = (date: string, close: number): DailyPoint => ({
    time: date, open: close, high: close + 100, low: close - 100, close, amount: 1e10, prevClose: close - 50,
});
const DAILY = [daily("2026-06-17", 1000), daily("2026-06-18", 1100), daily("2026-06-19", 1200)];

const minute = (time: number, close: number): MinutePoint => ({
    time, date: "2026-06-19", tradeTime: "09:00:00", open: close, high: close + 1, low: close - 1, close,
    amount: 5e9, cumAmount: 5e9, highPrice: 10_000,
});
const MINUTE = [minute(1000, 1), minute(1060, 2), minute(1120, 3)];

function DailyHarness({ chartRef, points }: { chartRef: RefObject<IChartApi | null>; points: DailyPoint[] }): null {
    const series = useDailySeries(chartRef);
    useDailySeriesData(series, points);
    return null;
}

function MinuteHarness({ chartRef, points }: { chartRef: RefObject<IChartApi | null>; points: MinutePoint[] }): null {
    const series = useMinuteSeries(chartRef);
    useMinuteSeriesData(series, points, true);
    return null;
}

beforeEach(() => {
    markerPlugins.length = 0;
});

describe("일봉 데이터 푸시", () => {
    it("StrictMode 이중 effect(시리즈 재생성) 뒤에도 살아 있는 시리즈에 봉이 전부 있다", () => {
        const { chartRef, series } = fakeChart();
        render(
            <StrictMode>
                <DailyHarness chartRef={chartRef} points={DAILY} />
            </StrictMode>,
        );
        const candles = candlesOf(series);
        expect(candles.length).toBeGreaterThan(1); // 시리즈가 실제로 다시 만들어졌다(전제 확인)
        const live = candles[candles.length - 1];
        expect(live.bars.size).toBe(DAILY.length); // ← 고치기 전엔 1(꼬리만 update)
        expect(live.setDataCount).toBeGreaterThan(0); // 새 시리즈는 전체 setData 로 채운다
    });

    it("시리즈가 재생성되면 마커도 새 플러그인에 다시 그린다", () => {
        const { chartRef } = fakeChart();
        render(
            <StrictMode>
                <DailyHarness chartRef={chartRef} points={DAILY} />
            </StrictMode>,
        );
        expect(markerPlugins.length).toBeGreaterThan(1);
        expect(markerPlugins[markerPlugins.length - 1].calls.length).toBeGreaterThan(0); // 스킵되면 0
    });

    it("같은 시리즈가 이어지면 증분 — 꼬리만 update, 전체 setData 는 없다", () => {
        const { chartRef, series } = fakeChart();
        const { rerender } = render(<DailyHarness chartRef={chartRef} points={DAILY} />);
        const candle = candlesOf(series)[0];
        const setDataBefore = candle.setDataCount;
        const extended = [...DAILY.slice(0, 2), daily("2026-06-19", 1250), daily("2026-06-22", 1300)];
        rerender(<DailyHarness chartRef={chartRef} points={extended} />);
        expect(candle.setDataCount).toBe(setDataBefore); // 증분이 살아 있다(최적화 회귀 방지)
        expect(candle.updateCount).toBeGreaterThan(0);
        expect(candle.bars.size).toBe(4);
    });

    it("데이터셋이 갈리면(다른 종목) 전체 setData", () => {
        const { chartRef, series } = fakeChart();
        const { rerender } = render(<DailyHarness chartRef={chartRef} points={DAILY} />);
        const candle = candlesOf(series)[0];
        const setDataBefore = candle.setDataCount;
        rerender(<DailyHarness chartRef={chartRef} points={[daily("2025-01-02", 500), daily("2025-01-03", 510)]} />);
        expect(candle.setDataCount).toBe(setDataBefore + 1);
        expect(candle.bars.size).toBe(2);
    });
});

describe("분봉 데이터 푸시", () => {
    it("StrictMode 이중 effect(시리즈 재생성) 뒤에도 살아 있는 시리즈에 봉이 전부 있다", () => {
        const { chartRef, series } = fakeChart();
        render(
            <StrictMode>
                <MinuteHarness chartRef={chartRef} points={MINUTE} />
            </StrictMode>,
        );
        const candles = candlesOf(series);
        expect(candles.length).toBeGreaterThan(1);
        const live = candles[candles.length - 1];
        expect(live.bars.size).toBe(MINUTE.length); // ← 고치기 전엔 1
    });

    it("같은 시리즈가 이어지면 증분 — 꼬리만 update", () => {
        const { chartRef, series } = fakeChart();
        const { rerender } = render(<MinuteHarness chartRef={chartRef} points={MINUTE} />);
        const candle = candlesOf(series)[0];
        const setDataBefore = candle.setDataCount;
        rerender(<MinuteHarness chartRef={chartRef} points={[...MINUTE.slice(0, 2), minute(1120, 4), minute(1180, 5)]} />);
        expect(candle.setDataCount).toBe(setDataBefore);
        expect(candle.bars.size).toBe(4);
    });
});
