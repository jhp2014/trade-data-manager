import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { usePanelUi, usePanelUiNumber, usePanelUiStore, usePanelUiText } from "./panelUi.js";

const st = () => usePanelUiStore.getState();

beforeEach(() => {
    localStorage.clear();
    usePanelUiStore.setState({ ui: {} });
});
afterEach(cleanup);

describe("패널 설정 store", () => {
    it("set 은 그 패널의 그 키만 바꾼다", () => {
        st().set("chart-1", "view", "daily");
        st().set("chart-1", "priceMode", "krx");
        st().set("chart-2", "view", "minute");
        expect(st().ui).toEqual({ "chart-1": { view: "daily", priceMode: "krx" }, "chart-2": { view: "minute" } });
    });
    it("replace 에 설정을 주면 통째로 바꾸고, 원본과 따로 산다", () => {
        st().set("chart-1", "view", "daily");
        st().replace("chart-2", st().ui["chart-1"]);
        st().set("chart-2", "view", "minute");
        expect(st().ui["chart-1"]).toEqual({ view: "daily" });
        expect(st().ui["chart-2"]).toEqual({ view: "minute" });
    });
    it("replace 에 undefined 를 주면 지운다 — 다시 쓰는 id 가 지난 설정을 물려받지 않는다", () => {
        st().set("chart-2", "view", "daily");
        st().replace("chart-2", undefined);
        expect(st().ui["chart-2"]).toBeUndefined();
    });
    it("prune 은 살아 있는 패널의 설정만 남긴다", () => {
        st().set("chart-1", "view", "daily");
        st().set("chart-9", "view", "minute");
        st().prune(["chart-1", "theme-1"]);
        expect(st().ui).toEqual({ "chart-1": { view: "daily" } });
    });
});

describe("usePanelUi", () => {
    const VIEWS = ["both", "daily", "minute"] as const;
    it("저장값이 없거나 허용 목록 밖이면 기본값", () => {
        const { result } = renderHook(() => usePanelUi("chart-1", "view", VIEWS, "both"));
        expect(result.current[0]).toBe("both");
        act(() => st().set("chart-1", "view", "옛날값"));
        expect(result.current[0]).toBe("both");
    });
    it("바꾸면 그 패널에만 남는다", () => {
        const one = renderHook(() => usePanelUi("chart-1", "view", VIEWS, "both"));
        const two = renderHook(() => usePanelUi("chart-2", "view", VIEWS, "both"));
        act(() => one.result.current[1]("daily"));
        expect(one.result.current[0]).toBe("daily");
        expect(two.result.current[0]).toBe("both");
    });
});

describe("usePanelUiNumber", () => {
    const RANGE = { min: 0, max: 2000 };
    const hook = () => renderHook(() => usePanelUiNumber("theme-1", "amountN", RANGE, 80));
    it("저장값이 없거나 숫자가 아니면 기본값", () => {
        const { result } = hook();
        expect(result.current[0]).toBe(80);
        for (const bad of ["120", NaN, Infinity, null]) {
            act(() => st().set("theme-1", "amountN", bad));
            expect(result.current[0]).toBe(80);
        }
    });
    it("범위 밖 저장값(옛 저장물)은 잘라서 읽는다", () => {
        const { result } = hook();
        act(() => st().set("theme-1", "amountN", 5000));
        expect(result.current[0]).toBe(2000);
        act(() => st().set("theme-1", "amountN", -3));
        expect(result.current[0]).toBe(0);
    });
    it("쓸 때도 반올림하고 범위로 자른다", () => {
        const { result } = hook();
        act(() => result.current[1](80.6));
        expect(st().ui["theme-1"]).toEqual({ amountN: 81 });
        act(() => result.current[1](99999));
        expect(st().ui["theme-1"]).toEqual({ amountN: 2000 });
    });
});

describe("usePanelUiText", () => {
    it("글자가 아니면 기본값, 쓰면 그 패널에만", () => {
        const one = renderHook(() => usePanelUiText("hts-1", "keyword"));
        const two = renderHook(() => usePanelUiText("hts-2", "keyword"));
        act(() => st().set("hts-1", "keyword", 3));
        expect(one.result.current[0]).toBe("");
        act(() => one.result.current[1]("수주"));
        expect(one.result.current[0]).toBe("수주");
        expect(two.result.current[0]).toBe("");
    });
});
