// lab 저장 선 훅 — 쓰기 응답은 그 쓰기의 차트 캐시로(기다리는 사이 경로가 바뀌어도 새 차트를 덮지 않는다), 쓰는 중엔 current=false.
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MarketProvider } from "./MarketProvider.js";
import { fakeMarket } from "./testing.js";
import { useChartLines } from "./queries.js";
import type { LabChartLine } from "./types.js";

const line = (chartDate: string): LabChartLine => ({ chartDate, anchorDate: "2026-06-26", anchorTime: null, field: "H", market: "un" });

describe("useChartLines", () => {
    it("쓰는 사이 경로가 바뀌어도 응답은 쓴 차트의 캐시에만", async () => {
        let release!: () => void;
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const m = fakeMarket({
            chartLines: async () => [],
            saveChartLine: async (_code: string, l: LabChartLine) => {
                await new Promise<void>((r) => (release = r));
                return [l];
            },
        });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={qc}>
                <MarketProvider market={m}>{children}</MarketProvider>
            </QueryClientProvider>
        );
        const { result, rerender } = renderHook(({ date }) => useChartLines("000660", date), { wrapper, initialProps: { date: "2026-07-28" } });
        await waitFor(() => expect(result.current.current).toBe(true));
        act(() => result.current.save(line("2026-07-28")));
        await waitFor(() => expect(result.current.current).toBe(false)); // 쓰는 중
        rerender({ date: "2026-07-30" }); // 응답 전에 경로가 바뀐다
        await waitFor(() => expect(qc.getQueryData(["chart-lines", "000660", "2026-07-30"])).toEqual([]));
        act(() => release());
        await waitFor(() => expect(qc.getQueryData(["chart-lines", "000660", "2026-07-28"])).toEqual([line("2026-07-28")]));
        expect(qc.getQueryData(["chart-lines", "000660", "2026-07-30"])).toEqual([]);
    });
});
