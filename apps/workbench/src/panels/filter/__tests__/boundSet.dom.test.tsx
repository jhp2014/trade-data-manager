// 패널 바인딩(단계 ④) — **두 우주를 한 계약으로** 내는 훅의 불변식 셋:
//  ① 같은 (조건, 날짜)를 보는 소비자가 둘이어도 **평가는 한 벌**이다(키가 갈리면 5.7초가 곱해진다).
//  ② 고정(핀)은 전역 선택을 안 따라가고, 재마운트를 건너 살아남는다.
//  ③ 조건이 없으면 **하루 재료를 안 당긴다**(/day-replay 는 한 날 ~15MB — setup 의 네트워크 그물이 증인).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { exprOfStages } from "../expr.js";
import { act, render } from "@testing-library/react";
import type { DayReplay, MinuteDerived } from "@trade-data-manager/wire";
import { kstToUnix } from "@trade-data-manager/market/domain";
import { Providers, seededClient } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { useBoundSet } from "../useBoundSet.js";
import type { FilterStage } from "../stage.js";
import type { SavedSet } from "../../../store/savedSetsSlice.js";

const evalSpy = vi.fn();
vi.mock("@trade-data-manager/market/domain", async (importOriginal) => {
    const mod = await importOriginal<typeof import("@trade-data-manager/market/domain")>();
    return {
        ...mod,
        // 훅이 부르는 것은 **식 엔진**이다(2026-09-19 6단계) — 옛 이름을 물고 있으면 스파이가 0이 되고,
        // "평가는 한 벌" 검사가 조용히 통과한다(아무도 안 부르는 것을 세고 있으므로).
        evaluateCellsExpr: (...args: Parameters<typeof mod.evaluateCellsExpr>) => {
            evalSpy();
            return mod.evaluateCellsExpr(...args);
        },
    };
});

const DATE = "2026-09-16";
const t0 = kstToUnix(DATE, "09:00:00");
const md = (code: string, rate: number[]): MinuteDerived => ({
    code,
    times: rate.map((_, i) => t0 + i * 60),
    rate,
    cumAmount: rate.map(() => 200e8),
    high: rate, low: rate, open: 0, minuteOpen: rate, minuteHigh: rate, minuteLow: rate,
    trailingHighs: { krx: [], un: [] },
    basePrice: { krx: null, un: null },
});
const snapshot: DayReplay = {
    date: DATE,
    stocks: [{ ...md("000100", [1, 6, 6]), name: "유한양행", market: "거래소", marketCap: null, themes: [] }],
};

const wideStage: FilterStage = {
    id: "wide", name: "전부", enabled: true,
    predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 1 } }] }],
};

/** 훅 하나를 그대로 읽는 발판 — 패널을 통째로 그리지 않고 계약만 본다. */
const seen: Record<string, ReturnType<typeof useBoundSet>> = {};
function Probe({ panelId }: { panelId: string }): JSX.Element {
    seen[panelId] = useBoundSet(panelId);
    return <div data-probe={panelId} />;
}

/** 종단 모수 — 리졸버가 실제로 **항목을 내는지** 보려면 유니버스에 하루가 있어야 한다. */
const LONG_SEED = { candidateDays: [{ stockCode: "000100", date: "2026-09-10" }] };

const renderProbes = (ids: string[], withSnapshot = true): ReturnType<typeof render> => {
    const client = seededClient(withSnapshot ? { ...LONG_SEED, daySnapshot: { date: DATE, data: snapshot } } : LONG_SEED);
    return render(
        <Providers client={client}>
            {ids.map((id) => <Probe key={id} panelId={id} />)}
        </Providers>,
    );
};

const savedDaily: SavedSet = {
    id: "fs-day", name: "오늘 후보", expr: exprOfStages([wideStage]),
    universe: "daily",
};

beforeEach(() => {
    localStorage.clear();
    evalSpy.mockClear();
    useWorkbench.setState({
        focus: { ...useWorkbench.getState().focus, date: DATE, code: "", time: null },
        panelUi: {}, savedSets: [], selectedSetRef: null, filterExpr: exprOfStages([wideStage]),
    });
});

describe("useBoundSet — 하루 우주", () => {
    it("소비자가 둘이어도 **평가는 한 벌**이다(모듈 메모 — 키가 갈리면 5.7초가 곱해진다)", () => {
        renderProbes(["a", "b"]);
        expect(seen.a!.view.viewedItems).toHaveLength(3);
        expect(seen.b!.view.viewedItems).toHaveLength(3);
        expect(evalSpy, "같은 (조건, 날짜, opts) 는 한 번만 평가한다").toHaveBeenCalledTimes(1);
    });

    // 우주 파생(9단계) 이후 조건 0개 = 우주 미정 = 종단이라, 하루 경로가 아예 안 선다.
    it("조건이 없으면 재료를 안 당긴다 — 네트워크도 안 친다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([]) });
        renderProbes(["a"], false); // 재료를 안 심었다: 당기면 setup 의 네트워크 그물이 이 테스트를 죽인다
        expect(seen.a!.universe, "조건 0개 = 우주 미정 = 종단").toBe("longitudinal");
        expect(seen.a!.day.on, "하루 경로가 안 선다 — 이게 이 검사의 본론이다").toBe(false);
        expect(evalSpy).not.toHaveBeenCalled();
    });

    it("폐지된 종류를 가리키던 핀(옛 조립)은 **거르는 빈 집합 + 이유**다 — 조용히 연동으로 떨어지면 딴 집합을 그린다", () => {
        useWorkbench.setState({
            savedSets: [savedDaily],
            panelUi: { a: { setPin: { kind: "assembly", id: "as1" } } }, // 저장물에 남은 옛 조립 핀
        });
        renderProbes(["a"]);
        expect(seen.a!.view.viewedItems).toHaveLength(0);
        // 이 둘이 이 검사의 본론이다 — 시트·시뮬은 `isFiltering` 으로 "거르나"를 가른다.
        expect(seen.a!.view.isFiltering, "거르고 있다(빈 집합)").toBe(true);
        expect(seen.a!.view.broken, "이유가 있다").toBe(true);
    });

    it("최종 생존은 작업 깔때기의 조건으로 풀린다 — 연동과 같은 것을 본다", () => {
        useWorkbench.setState({ panelUi: { a: { setPin: { kind: "survivors" } } } });
        renderProbes(["a", "b"]);
        expect(seen.a!.view.viewedItems).toHaveLength(3);
        expect(seen.a!.view.broken).toBe(false);
        expect(evalSpy, "고정과 연동이 같은 조건이면 평가도 한 벌").toHaveBeenCalledTimes(1);
    });
});

describe("useBoundSet — 종단 집합에 고정한 패널", () => {
    it("작업 우주를 하루로 갈아타도 **제 집합을 계속 푼다**(④ 의 목표 시나리오)", () => {
        const savedLong: SavedSet = {
            id: "fs-long", name: "9월 돌파", expr: exprOfStages([]),
            universe: "longitudinal",
        };
        useWorkbench.setState({ filterExpr: exprOfStages([]), savedSets: [savedLong],
            panelUi: { a: { setPin: { kind: "saved", setId: "fs-long" } } },
        });
        renderProbes(["a"]);
        expect(seen.a!.universe).toBe("longitudinal");
        const before = seen.a!.view.viewedItems.length;
        expect(before, "종단 집합은 유니버스에서 항목이 나온다").toBeGreaterThan(0);

        // 작업 깔때기만 하루로 — 고정한 패널은 종단 그대로여야 한다.
        // ⚠ **항목 수를 본다**: 한때 리졸버가 맥락 우주와 대조해 여기서 조용히 빈 집합이 됐는데,
        //   universe·broken 만 보면 그 증상이 안 잡힌다(둘 다 그대로였다 — 리뷰가 잡은 테스트 구멍).
        // 우주는 파생이라 토글이 없다(2026-09-19 9단계) — **하루 전용 조건을 걸어** 작업 우주를 옮긴다.
        act(() => useWorkbench.getState().addFilterStage([{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] }]));
        expect(seen.a!.universe).toBe("longitudinal");
        expect(seen.a!.day.on).toBe(false);
        expect(seen.a!.view.broken).toBe(false);
        expect(seen.a!.view.viewedItems.length, "고정한 집합은 작업 우주와 무관하게 계속 풀린다").toBe(before);
    });
});

describe("useBoundSet — 고정(핀)", () => {
    it("고정하면 전역 선택을 안 따라간다 — 연동 패널만 따라간다", () => {
        // 포인터는 **우주를 못 넘는다**(단계 ② 불변식 ①) — 우주는 파생이라 토글이 없으니
        // 작업 식에 **하루 전용 조건**(wideStage)을 둬서 집합과 우주를 맞춘다.
        useWorkbench.setState({ filterExpr: exprOfStages([wideStage]), savedSets: [savedDaily] });
        renderProbes(["pinned", "linked"]);

        // 포인터가 없을 때 눌러도 **뭔가는 묶인다** — 연동이 실제로 풀리는 대상(최종 생존)이다.
        // (무반응이면 손잡이가 고장 난 것으로 읽힌다 — 리뷰가 잡은 자리.)
        act(() => seen.pinned!.togglePin());
        expect(seen.pinned!.pinned).toEqual({ kind: "survivors" });
        act(() => seen.pinned!.togglePin()); // 해제하고 본론으로

        // 전역 포인터를 저장 집합으로 → 둘 다 따라간다
        act(() => useWorkbench.getState().selectSet({ kind: "saved", setId: "fs-day" }));
        expect(seen.pinned!.label).toBe("오늘 후보");
        expect(seen.linked!.label).toBe("오늘 후보");

        // 하나만 고정 → 전역을 풀어도 그 패널은 제자리
        act(() => seen.pinned!.togglePin());
        expect(seen.pinned!.pinned).toEqual({ kind: "saved", setId: "fs-day" });
        act(() => useWorkbench.getState().selectSet(null));
        expect(seen.pinned!.label, "고정된 패널은 안 따라간다").toBe("오늘 후보");
        expect(seen.linked!.label, "연동 패널은 따라간다").toMatch(/연동/);
    });

    it("핀은 패널 낟알로 영속한다 — 재마운트를 건너 살아남는다", () => {
        useWorkbench.setState({ savedSets: [savedDaily], selectedSetRef: { kind: "saved", setId: "fs-day" } });
        const first = renderProbes(["a"]);
        act(() => seen.a!.togglePin());
        expect(useWorkbench.getState().panelUi.a?.setPin).toEqual({ kind: "saved", setId: "fs-day" });
        first.unmount();

        renderProbes(["a"]);
        expect(seen.a!.pinned).toEqual({ kind: "saved", setId: "fs-day" });
    });

    it("지워진 집합을 가리키는 핀은 **그대로 둔다** — 조용한 연동 폴백 금지", () => {
        useWorkbench.setState({ savedSets: [], panelUi: { a: { setPin: { kind: "saved", setId: "없는것" } } } });
        renderProbes(["a"]);
        expect(seen.a!.pinned).toEqual({ kind: "saved", setId: "없는것" });
        expect(seen.a!.label).toBe("(지워진 집합)");
    });
});
