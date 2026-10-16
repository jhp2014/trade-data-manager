// 차트 시각 단축키 — 활성 경로의 시각을 분봉 위에서 옮긴다(차트 패널이 없어도 분봉을 받아서).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MarketProvider } from "../market/MarketProvider.js";
import { fakeMarket } from "../market/testing.js";
import type { ChartBundle } from "../market/types.js";
import { usePaths } from "../store/paths.js";
import { useChartSettings } from "../store/chartSettings.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { resolveCommand } from "../keymap/registry.js";
import { useChartTimeCommands } from "./useChartTimeCommands.js";

const bar = { open: "1000", high: "1000", low: "1000", close: "1000", volume: "1" };
// 09:00 ~ 09:59 + 15:00 ~ 15:59 (dense 로 보고 쓴다 — 두 덩이 사이도 한 칸)
const TIMES = [9, 15].flatMap((h) => Array.from({ length: 60 }, (_, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`));

let calls: string[] = [];
/** hold 가 있으면 응답을 붙잡아 둔다 — 기다리는 사이 경로가 바뀌는 경우. */
let hold: Promise<void> | null = null;
function wrapper({ children }: { children: ReactNode }): JSX.Element {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const m = fakeMarket({
        chart: async (code: string, date: string): Promise<ChartBundle> => {
            calls.push(`${code}@${date}`);
            if (hold) await hold;
            return { stockCode: code, daily: [], minutes: TIMES.map((time) => ({ stockCode: code, date, time, krx: null, un: bar })), basePrice: { krx: 1000, un: 1000 } };
        },
    });
    return (
        <QueryClientProvider client={qc}>
            <MarketProvider market={m}>{children}</MarketProvider>
        </QueryClientProvider>
    );
}

const press = (chord: string) => resolveCommand(chord)!.run!(new KeyboardEvent("keydown"));
const time = (id = "A") => usePaths.getState().paths.find((p) => p.id === id)!.s.time;

beforeEach(() => {
    calls = [];
    hold = null;
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    useChartSettings.setState(useChartSettings.getInitialState(), true);
    useKeymapDynamic.setState({ commands: {} });
});
afterEach(cleanup);

describe("useChartTimeCommands", () => {
    it("a/d = 한 칸, shift+a/d = 설정한 칸 수 — 활성 경로만, 분봉은 한 번 받는다", async () => {
        usePaths.getState().write("B", { code: "009150", date: "2026-07-31", time: "09:10" });
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31", time: "09:10" }); // A 활성
        renderHook(() => useChartTimeCommands(), { wrapper });
        press("d");
        await waitFor(() => expect(time()).toBe("09:11"));
        press("shift+a"); // 20칸 — 첫 봉에서 멈춘다
        await waitFor(() => expect(time()).toBe("09:00"));
        useChartSettings.getState().set({ jumpBars: 5 });
        press("shift+d");
        await waitFor(() => expect(time()).toBe("09:05"));
        expect(time("B")).toBe("09:10");
        expect(calls).toEqual(["402340@2026-07-31"]);
    });

    it("시각 미정(= 15:30)에서 출발하고, 연타가 차례로 쌓인다", async () => {
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31" });
        renderHook(() => useChartTimeCommands(), { wrapper });
        press("a");
        await waitFor(() => expect(time()).toBe("15:29"));
        press("d");
        press("d");
        press("d");
        await waitFor(() => expect(time()).toBe("15:32"));
    });

    it("분봉을 기다리는 사이 활성 경로가 바뀌거나 종목이 바뀌면 버린다(활성을 되돌리지 않는다)", async () => {
        usePaths.getState().write("B", { code: "009150", date: "2026-07-31", time: "09:10" });
        usePaths.getState().write("A", { code: "402340", date: "2026-07-31", time: "09:10" });
        let release!: () => void;
        hold = new Promise((r) => (release = r));
        renderHook(() => useChartTimeCommands(), { wrapper });
        press("d");
        usePaths.getState().setActive("B"); // 기다리는 사이 B 로
        release();
        await new Promise((r) => setTimeout(r, 10));
        expect(usePaths.getState().active).toBe("B");
        expect(time()).toBe("09:10");

        hold = new Promise((r) => (release = r));
        usePaths.getState().write("B", { date: "2026-07-30" }); // B 는 아직 안 받은 날짜
        press("d");
        usePaths.getState().write("B", { code: "000660" }); // 기다리는 사이 종목이 바뀜
        release();
        await new Promise((r) => setTimeout(r, 10));
        expect(time("B")).toBe("09:10");
    });

    it("종목·날짜가 없으면 아무 일도 없다 · f 는 줌 토글", async () => {
        usePaths.getState().write("A", { date: "2026-07-31", time: "09:10" });
        renderHook(() => useChartTimeCommands(), { wrapper });
        press("d");
        await new Promise((r) => setTimeout(r, 10));
        expect(time()).toBe("09:10");
        expect(calls).toEqual([]);
        press("f");
        expect(useChartSettings.getState().zoom).toBe(true);
    });
});
