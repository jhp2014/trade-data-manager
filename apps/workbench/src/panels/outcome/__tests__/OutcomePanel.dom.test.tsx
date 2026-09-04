// 결과 패널 — T 레일은 정의(pointDef)를 만지고 조건(stages)은 안 만진다 / 결과 레일은 그으면 조건이 된다.
// 시드: 렌더 하네스의 격자는 얕은 눌림(<2%)뿐이라 상태가 전부 "이내"가 된다 — 결과 걷기를 실제로 태우려면
// **깊은 눌림 격자를 직접 심는다**(pointGridsQuery 캐시 덮어쓰기, 구조 불변식 준수).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { pointGridsQuery } from "../../../api/queries.js";
import { selectFilterStages, useWorkbench } from "../../../store/workbench.js";
import { RAIL_PAD } from "../../filter/rail/Rail.js";
import { OutcomePanel } from "../OutcomePanel.js";

const DATE = "2026-07-06";

/**
 * 시그널 1개짜리 격자 — 터치 560 → Point 봉 570(신고가 101, 대금 60억, 양봉) 뒤에 (고점, 저점) 쌍들.
 * 걷기 breaks 가 곧 pairs 의 (깊이, 고점) 러닝-최대 접두가 된다.
 */
const gridOf = (pairs: readonly [high: number, low: number][]): PointGrid => ({
    base: 100,
    touch: { min: 560, tv: "1000000000", cum: "1000000000" },
    pivots: pairs.flatMap(([high, low], i) => [
        {
            kind: "high" as const, min: 575 + i * 15, price: high, confirmedMin: 580 + i * 15,
            cum: String((3 + 2 * i) * 1_000_000_000),
            cross: i === 0 ? null : { min: 573 + i * 15, tv: "1000000000", cum: String((2 + 2 * i) * 1_000_000_000) },
        },
        { kind: "low" as const, min: 580 + i * 15, price: low, confirmedMin: null, cum: String((4 + 2 * i) * 1_000_000_000), cross: null },
    ]),
    newHighs: [{ min: 570, open: 100, high: 101, low: 100, close: 101, tv: "6000000000", cum: "2000000000" }],
    prevBase: 100,
    prevBaseKrx: null,
    // 세션 최고가 = 마지막 (고점) 쌍의 고가 — 꼬리 없음(회복/미회복이 마지막 저가에서 갈리게 두려면 여기서 조절).
    sessionHigh: pairs.length > 0
        ? { min: 575 + (pairs.length - 1) * 15, price: pairs[pairs.length - 1]![0] }
        : { min: 570, price: 101 },
});

// 기본 허용 T1=2(기본)에서 셋 다 "초과"(첫 눌림 깊이는 zigzag 상 항상 ≥2%), 연장 고점 % 가 서로
// 다르게(도메인에 중간값이 있어야 반열림으로 안 접힌다):
//   A: [110, 104](5.45%) → [120, 110](8.33%) — 초과 @110, extPct ≈ 8.9
//   B: [130, 122](6.15%)                     — 초과 @130, extPct ≈ 28.7
//   C: [118, 111](5.93%)                     — 초과 @118, extPct ≈ 16.8
const GRIDS = new Map([
    ["005930", gridOf([[110, 104], [120, 110]])],
    ["000660", gridOf([[130, 122]])],
    ["035720", gridOf([[118, 111]])],
]);

const SEED: Seed = { candidateDays: [...GRIDS.keys()].map((stockCode) => ({ stockCode, date: DATE })) };

const renderPanelUnder = (): ReturnType<typeof render> => {
    const client = seededClient(SEED);
    client.setQueryData(pointGridsQuery().queryKey, { version: 1, byDate: new Map([[DATE, GRIDS]]) });
    return render(<OutcomePanel />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={client}>{children}</Providers>,
    });
};

const WIDTH = 1000;
const xAt = (frac: number): number => RAIL_PAD + frac * (WIDTH - 2 * RAIL_PAD);
/** T 도메인 [2,30]% → 트랙 프랙션 — ToleranceRail 의 toFrac 과 같은 식. */
const toFracOf = (pct: number): number => (pct - 2) / 28;
const drag = (el: HTMLElement, from: number, to: number): void => {
    fireEvent.pointerDown(el, { button: 0, clientX: xAt(from), pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: xAt(to), pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
};
const trackOf = (c: HTMLElement, label: string): HTMLElement => {
    const name = [...c.querySelectorAll("div")].find((d) => d.title === label || d.title.startsWith(`${label} —`));
    if (!name) throw new Error(`레일 '${label}' 의 이름 열이 없다`);
    const row = name.parentElement!.parentElement!;
    const track = row.querySelector('[title^="빈 곳을 끌면"]');
    if (!track) throw new Error(`레일 '${label}' 에 그을 수 있는 트랙이 없다(disabledNote 상태)`);
    return track as HTMLElement;
};
const stages = (): ReturnType<typeof selectFilterStages> => selectFilterStages(useWorkbench.getState());

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [], panelUi: {}, sessionUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); useWorkbench.getState().resetPointDef(); });
afterEach(() => { useWorkbench.setState(RESET); useWorkbench.getState().resetPointDef(); localStorage.clear(); });

describe("결과 패널", () => {
    it("머리글 상태 3분류 — 시그널 3 · 초과 3(기본 허용 T1=2 는 첫 눌림(≥2%)에 항상 걸린다) + 회복 카운트", () => {
        const { container } = renderPanelUnder();
        expect(container.textContent).toContain("초과 3");
        expect(container.textContent).toContain("이내 0");
        expect(container.textContent).toContain("무눌림 0");
        // 회복: A 는 저가(104) 후 H2(120 > 110) 재돌파 = 회복 · B(130=세션최고)·C(118=세션최고)는 미회복.
        expect(container.textContent).toContain("회복 1");
        expect(container.textContent).toContain("미회복 2");
    });

    it("회복/미회복 칩 클릭 = outcomeRecovery 조건 토글, 보드에서 끈 조건은 재클릭이 삭제가 아니라 재활성", () => {
        const { container } = renderPanelUnder();
        const chip = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("미회복"))!;
        fireEvent.click(chip);
        expect(stages()).toHaveLength(1);
        expect(stages()[0]!.predicates[0]).toEqual({ kind: "outcomeRecovery", recovered: false });
        // 보드에서 꺼 둔 상태(enabled=false) — 칩은 꺼짐으로 그려지고, 클릭은 삭제가 아니라 재활성이어야 한다.
        act(() => useWorkbench.getState().toggleFilterStage(stages()[0]!.id));
        expect(stages()[0]!.enabled).toBe(false);
        fireEvent.click(chip);
        expect(stages()).toHaveLength(1);
        expect(stages()[0]!.enabled).toBe(true);
        fireEvent.click(chip); // 켜진 같은 칩 재클릭 = 해제
        expect(stages()).toHaveLength(0);
    });

    it("T 레일 빈 트랙 드래그 = T1 이동 — Δ폭(T2−T1)은 유지되고 stages 는 안 생긴다(필터가 아니다)", () => {
        const { container } = renderPanelUnder();
        drag(trackOf(container, "허용 폭 T"), 0.1, 0.5); // 2~30% 도메인에서 T1 → 16
        const def = useWorkbench.getState().pointDef;
        expect(def.toleranceT1Pct).toBe(16);
        expect(def.toleranceT2Pct - def.toleranceT1Pct).toBe(3); // 기본 Δ = 5−2 유지
        expect(stages()).toHaveLength(0);
    });

    it("T2 라벨 드래그 = Δ 관찰 폭만 조절 — T1 불변, 하한은 T1", () => {
        const { container } = renderPanelUnder();
        const track = trackOf(container, "허용 폭 T");
        const t2Label = container.querySelector('[title^="Δ 관찰 폭"]')!;
        expect(t2Label).not.toBeNull();
        fireEvent.pointerDown(t2Label, { button: 0, clientX: xAt(toFracOf(5)), pointerId: 1 });
        fireEvent.pointerMove(track, { clientX: xAt(toFracOf(12)), pointerId: 1 });
        fireEvent.pointerUp(track, { pointerId: 1 });
        expect(useWorkbench.getState().pointDef).toMatchObject({ toleranceT1Pct: 2, toleranceT2Pct: 12 });
        // T1 왼쪽까지 끌어도 T2 는 T1 아래로 못 내려간다.
        fireEvent.pointerDown(container.querySelector('[title^="Δ 관찰 폭"]')!, { button: 0, clientX: xAt(toFracOf(12)), pointerId: 1 });
        fireEvent.pointerMove(track, { clientX: xAt(0), pointerId: 1 });
        fireEvent.pointerUp(track, { pointerId: 1 });
        expect(useWorkbench.getState().pointDef).toMatchObject({ toleranceT1Pct: 2, toleranceT2Pct: 2 });
    });

    it("연장 고점 % 레일 — 그으면 outcome 술어 stage 가 생기고, ✕ 로 지우면 stage 째 사라진다", () => {
        const { container } = renderPanelUnder();
        // 왼쪽 끝(약)에서 중앙까지 — 왼끝은 반열림으로 비고, 오른 경계는 중간값(C ≈ frac 0.4)의 타점 앵커로 선다.
        drag(trackOf(container, "연장 고점 %"), 0.0, 0.5);
        const st = stages();
        expect(st).toHaveLength(1);
        expect(st[0]!.predicates[0]).toMatchObject({ kind: "outcome", metric: "extHigh" });
        const p = st[0]!.predicates[0] as { ranges: unknown[] };
        expect(p.ranges).toHaveLength(1);

        const del = container.querySelector('button[title="이 구간 삭제"]');
        expect(del).not.toBeNull();
        fireEvent.click(del!);
        expect(stages()).toHaveLength(0);
    });

    it("기본 허용 T1 을 10% 로 올리면 전부 '이내' — 깊이 최대 8.33% 라 T1 을 못 넘는다", () => {
        useWorkbench.getState().setPointDef({ toleranceT1Pct: 10, toleranceT2Pct: 12 });
        const { container } = renderPanelUnder();
        expect(container.textContent).toContain("초과 0");
        expect(container.textContent).toContain("이내 3");
    });
});
