// 시트 열 구성의 **로컬 설정 넷**(고정·숨김·폭·그룹 컷)과 그 청소 가드.
//
// 넷을 한 훅이 들고 있는 이유는 성격이 아니라 **위험**이 같아서다: 넷 다 키에 축 id 를 담고 있어서
// (`ax:<id>`) 축이 지워지면 유령 키가 남는다. 청소 자체(pruneAxisKeys)는 순수 함수라 이미 덮여 있고,
// 여기서 재는 건 **언제 부르나**다 — 골격 패널에서 반복해 만난 모양 그대로다.
//
// ⚠ 그 가드가 이 파일의 존재 이유다: **로딩 중엔 절대 청소하지 않는다.** 판단 축과 계산 축은 별도
//   요청이라, 판단 축만 도착한 순간에 청소가 돌면 아직 안 온 계산 축 열의 고정·숨김·폭을 유령으로
//   오인해 지운다. 사용자 설정이 조용히 사라지는 종류의 사고고, 되돌릴 방법이 없다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { RankAxis } from "@trade-data-manager/wire";
import { useWorkbench } from "../../../store/workbench.js";
import { useSheetColumns } from "../useSheetColumns.js";

const axis = (id: string, name: string): RankAxis => ({ id, name, slots: [], strongerWhen: "higher", scope: "point" } as unknown as RankAxis);
const LIVE = [axis("a1", "축1"), axis("a2", "축2")];

const FROZEN_KEY = "wb.rankSheetFrozenCols";
const HIDDEN_KEY = "wb.rankSheetHiddenCols";
const WIDTHS_KEY = "wb.rankSheetColWidths";
const CUTS_KEY = "wb.rankSheetCuts";

/** 설정 넷에 **살아 있는 축·죽은 축·축이 아닌 열**을 섞어 심는다. */
const seedSettings = (): void => {
    localStorage.setItem(FROZEN_KEY, JSON.stringify(["date", "ax:a1", "ax:죽은축"]));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(["ax:a2", "ax:죽은축"]));
    localStorage.setItem(WIDTHS_KEY, JSON.stringify({ name: 120, "ax:a1": 80, "ax:죽은축": 90 }));
    localStorage.setItem(CUTS_KEY, JSON.stringify({ "ax:a1": ["s1"], "ax:죽은축": ["s2"] }));
};
const stored = (key: string): unknown => JSON.parse(localStorage.getItem(key) ?? "null");

type Args = Parameters<typeof useSheetColumns>[0];
const BASE: Args = { axes: LIVE, axesLoading: false, containerW: 1200, axisMin: 60 };
const setup = (over: Partial<Args> = {}): ReturnType<typeof renderHook<ReturnType<typeof useSheetColumns>, Args>> =>
    renderHook((a: Args) => useSheetColumns(a), { initialProps: { ...BASE, ...over } });

beforeEach(() => { localStorage.clear(); useWorkbench.setState({ revealAxis: null }); });
afterEach(() => { localStorage.clear(); useWorkbench.setState({ revealAxis: null }); });

describe("픽스처 자신 — 죽은 키가 실제로 심겼나", () => {
    // 안 심겼으면 아래 "안 지운다" 검사가 통째로 헛돈다.
    it("설정 넷에 죽은 축 키가 들어 있다", () => {
        seedSettings();
        expect(stored(FROZEN_KEY)).toContain("ax:죽은축");
        expect(Object.keys(stored(WIDTHS_KEY) as object)).toContain("ax:죽은축");
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유다.
describe("청소 가드 — 사전이 오기 전엔 아무것도 안 지운다", () => {
    it("**로딩 중이면 안 지운다** — 아직 안 온 축의 설정을 유령으로 오인한다", () => {
        seedSettings();
        setup({ axesLoading: true });
        expect(stored(FROZEN_KEY)).toContain("ax:죽은축");
        expect(stored(HIDDEN_KEY)).toContain("ax:죽은축");
        expect(Object.keys(stored(WIDTHS_KEY) as object)).toContain("ax:죽은축");
        expect(Object.keys(stored(CUTS_KEY) as object)).toContain("ax:죽은축");
    });

    it("**축 목록이 비어도 안 지운다** — 빈 목록은 '축이 없다'가 아니라 '아직 모른다'일 수 있다", () => {
        seedSettings();
        setup({ axes: [], axesLoading: false });
        expect(stored(FROZEN_KEY)).toContain("ax:죽은축");
        expect(Object.keys(stored(CUTS_KEY) as object)).toContain("ax:죽은축");
    });

    it("로딩이 끝나면 그때 지운다 — 넷 모두에서", () => {
        seedSettings();
        const { rerender } = setup({ axesLoading: true });
        rerender({ ...BASE, axesLoading: false });

        expect(stored(FROZEN_KEY)).toEqual(["date", "ax:a1"]);
        expect(stored(HIDDEN_KEY)).toEqual(["ax:a2"]);
        expect(stored(WIDTHS_KEY)).toEqual({ name: 120, "ax:a1": 80 });
        expect(stored(CUTS_KEY)).toEqual({ "ax:a1": ["s1"] });
    });

    it("축이 아닌 열은 청소가 안 건드린다 — 종목·날짜·시각·결과는 축과 무관하다", () => {
        seedSettings();
        setup();
        expect(stored(FROZEN_KEY)).toContain("date");
        expect(stored(WIDTHS_KEY)).toMatchObject({ name: 120 });
    });
});

describe("열 구성 — 고정·숨김", () => {
    it("종목은 언제나 선다", () => {
        expect(setup().result.current.displayCols.some((c) => c.key === "name")).toBe(true);
    });

    it("숨기면 사라지고 다시 누르면 돌아온다", () => {
        const { result } = setup();
        act(() => result.current.toggleHidden("ax:a1"));
        expect(result.current.displayCols.some((c) => c.key === "axis" && c.axisId === "a1")).toBe(false);
        act(() => result.current.toggleHidden("ax:a1"));
        expect(result.current.displayCols.some((c) => c.key === "axis" && c.axisId === "a1")).toBe(true);
    });

    it("전부 꺼내기", () => {
        const { result } = setup();
        act(() => { result.current.toggleHidden("ax:a1"); result.current.toggleHidden("ax:a2"); });
        act(() => result.current.showAllHidden());
        expect(result.current.hiddenCols).toEqual([]);
    });

    it("고정 토글이 집합에 반영된다", () => {
        const { result } = setup();
        act(() => result.current.toggleFrozen("ax:a1"));
        expect(result.current.frozenSet.has("ax:a1")).toBe(true);
        act(() => result.current.toggleFrozen("ax:a1"));
        expect(result.current.frozenSet.has("ax:a1")).toBe(false);
    });

    it("손으로 조절한 폭이 있어야 '원위치' 손잡이가 뜬다", () => {
        const { result } = setup();
        expect(result.current.hasManualWidths).toBe(false);
        act(() => result.current.setWidth("ax:a1", 200));
        expect(result.current.hasManualWidths).toBe(true);
        act(() => result.current.resetWidths());
        expect(result.current.hasManualWidths).toBe(false);
    });
});

describe("그룹 컷 — 빈 조건을 키로 남기지 않는다", () => {
    it("누르면 생기고 다시 누르면 **키째 사라진다**", () => {
        const { result } = setup();
        act(() => result.current.toggleCut("a1", "s1"));
        expect(result.current.cuts).toEqual({ "ax:a1": ["s1"] });

        act(() => result.current.toggleCut("a1", "s1"));
        // 빈 배열로 남기면 "없는 조건"이 키로 남아 청소 규칙이 헷갈린다.
        expect(result.current.cuts).toEqual({});
        expect(Object.keys(result.current.cuts)).not.toContain("ax:a1");
    });

    it("여럿을 담고 하나만 뺄 수 있다", () => {
        const { result } = setup();
        act(() => { result.current.toggleCut("a1", "s1"); result.current.toggleCut("a1", "s2"); });
        act(() => result.current.toggleCut("a1", "s1"));
        expect(result.current.cuts).toEqual({ "ax:a1": ["s2"] });
    });

    it("축 하나의 컷만 비운다 — 다른 축은 그대로", () => {
        const { result } = setup();
        act(() => { result.current.toggleCut("a1", "s1"); result.current.toggleCut("a2", "s9"); });
        act(() => result.current.clearCuts("a1"));
        expect(result.current.cuts).toEqual({ "ax:a2": ["s9"] });
    });
});

describe("축 보여줘 — 숨긴 열이면 먼저 꺼낸다", () => {
    // 안 꺼내면 눌러도 아무 일이 없다(스크롤할 대상이 DOM 에 없다).
    it("숨겨 둔 축을 요청하면 숨김이 풀리고 강조가 켜진다", () => {
        const { result } = setup();
        act(() => result.current.toggleHidden("ax:a2"));
        expect(result.current.hiddenCols).toContain("ax:a2");

        act(() => { useWorkbench.setState({ revealAxis: { axisId: "a2", at: Date.now() } }); });
        expect(result.current.hiddenCols).not.toContain("ax:a2");
        expect(result.current.flashCol).toBe("ax:a2");
    });

    it("요청이 없으면 강조도 없다", () => {
        expect(setup().result.current.flashCol).toBeNull();
    });
});
