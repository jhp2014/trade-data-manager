// 패널 바인딩(단계 ④) — **두 우주를 한 계약으로** 내는 훅의 불변식 셋:
//  ① 같은 (조건, 날짜)를 보는 소비자가 둘이어도 **평가는 한 벌**이다(키가 갈리면 비용이 곱해진다).
//  ② 고정(핀)은 전역 선택을 안 따라가고, 재마운트를 건너 살아남는다.
//  ③ 조건이 없으면 **하루 재료를 안 당긴다**(/day-replay 는 한 날 13MB — setup 의 네트워크 그물이 증인).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { exprOfStages } from "../expr.js";
import { render } from "@testing-library/react";
import type { DayReplay, MinuteDerived } from "@trade-data-manager/wire";
import { kstToUnix } from "@trade-data-manager/market/domain";
import { Providers, seedEditing, seededClient } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { useBoundSet } from "../useBoundSet.js";
import type { FilterStage } from "../stage.js";

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


beforeEach(() => {
    localStorage.clear();
    evalSpy.mockClear();
    useWorkbench.setState({
        focus: { ...useWorkbench.getState().focus, date: DATE, code: "", time: null },
        panelUi: {},
        // 하루 평가는 **손으로 시작한다**(2026-09-21) — 저장물 스냅샷이 곧 "계산을 눌렀다"다.
        // 안 심으면 아래 검사들이 전부 0건이 되는데, 그건 버그가 아니라 이 모델의 뜻이다.
    });
    seedEditing(exprOfStages([wideStage]));
});

describe("useBoundSet — 하루 우주", () => {
    it("소비자가 둘이어도 **평가는 한 벌**이다(모듈 메모 — 키가 갈리면 비용이 곱해진다)", () => {
        renderProbes(["a", "b"]);
        expect(seen.a!.view.viewedItems).toHaveLength(3);
        expect(seen.b!.view.viewedItems).toHaveLength(3);
        expect(evalSpy, "같은 (조건, 날짜, opts) 는 한 번만 평가한다").toHaveBeenCalledTimes(1);
    });

    it("종단 모드면 하루 경로가 아예 안 선다 — 재료도 안 당긴다", () => {
        seedEditing(exprOfStages([]), [], "longitudinal");
        renderProbes(["a"], false); // 재료를 안 심었다: 당기면 setup 의 네트워크 그물이 이 테스트를 죽인다
        expect(seen.a!.universe).toBe("longitudinal");
        expect(seen.a!.day.on, "하루 경로가 안 선다 — 이게 이 검사의 본론이다").toBe(false);
        expect(evalSpy).not.toHaveBeenCalled();
    });
});

describe("useBoundSet — 모드가 라우팅을 정한다 (2026-09-22)", () => {
    it("평가할 조건이 없으면(전부 결손) **이유 있는 빈 집합**이다 — 빈 목록이 아니다", () => {
        // 종단 전용 조건(date)을 하루 모드에 두면 결손이라 평가할 식이 안 남는다.
        seedEditing(exprOfStages([{ id: "d1", enabled: true, predicates: [{ kind: "date", ranges: [{ from: DATE, to: DATE }] }] }]), [], "daily");
        renderProbes(["a"], false); // 재료를 안 당기는 것도 이 검사의 일부다
        expect(seen.a!.day.on, "하루 경로는 선다").toBe(true);
        expect(seen.a!.view.viewedItems).toHaveLength(0);
        // ⚠ 본론 — `isFiltering && broken` 이라야 화면이 "조건에 다 걸렸다"로 안 읽는다.
        //   「계산」 관문이 걷히면서 이 가드가 그 자리를 물려받았다(재료 없음 · 조건 없음 · 전부 결손).
        expect(seen.a!.view.isFiltering, "거르고 있다").toBe(true);
        expect(seen.a!.view.broken, "값은 아직 모른다").toBe(true);
        expect(evalSpy).not.toHaveBeenCalled();
    });

    it("빈 집합을 하루 모드에서 열어도 **하루로** 라우팅된다 — 파생은 종단으로 떨어진다", () => {
        seedEditing(exprOfStages([]), [], "daily");
        renderProbes(["a"], false);
        expect(seen.a!.universe, "자는 모드다(파생이 아니다)").toBe("daily");
        expect(seen.a!.day.unsupported, "조건이 없다고 말한다").toBeTruthy();
        expect(evalSpy, "조건이 없으면 재료를 안 당긴다").not.toHaveBeenCalled();
    });
});

