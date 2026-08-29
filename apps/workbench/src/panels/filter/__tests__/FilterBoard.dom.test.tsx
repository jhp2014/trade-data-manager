// 필터 보드 — 레일이 아닌 조건들(그룹·테마)이 서는 자리.
//
// ⚠ 1차원 레일(축·날짜·시간)의 배치·배선은 이 파일이 아니라 **RailPanel.dom.test.tsx** 가 잰다
//   (레일은 전용 패널로 이사했다). 여기 남은 건 리스트형 조건 둘이다:
//   그룹(순서가 없어 레일이 못 된다) · 테마(다차원이라 전용 패널이 편집면).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { Providers, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { selectFilterStages, useWorkbench } from "../../../store/workbench.js";
import { RAIL_PAD } from "../rail/Rail.js";
import { FilterBoard } from "../FilterBoard.js";

const A = "005930", B = "000660";
const DATES = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"];

const candidateDays: Seed["candidateDays"] = DATES.map((date, i) => ({ stockCode: i % 2 ? A : B, date }));
const points: SeedPoint[] = [
    { stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" },
    { stockCode: B, date: DATES[1], time: "10:00:00", name: "SK하이닉스" },
    { stockCode: A, date: DATES[2], time: "09:40:00" },
    { stockCode: B, date: DATES[3], time: "10:20:00" },
];

/** 축 피드 — 여기선 재료가 갖춰졌다는 것만 알면 된다(레일 자체는 레일 패널 검사의 몫). */
const feedOf = (key: string, name: string, grain: "day" | "point", n: number): ComputedAxisFeed => ({
    key,
    name,
    strongerWhen: "higher",
    grain,
    values: points.slice(0, n).map((pt, i) =>
        grain === "day"
            ? { stockCode: pt.stockCode, date: pt.date, value: i + 1 }
            : { stockCode: pt.stockCode, date: pt.date, time: pt.time, value: i + 1 }),
});
const feeds: ComputedAxisFeed[] = [
    feedOf("day-ax", "하루축", "day", 4),
    feedOf("pt-ax", "타점축", "point", 4),
];

const SEED: Seed = { candidateDays, points, computedAxes: feeds };

const renderBoard = (seed: Seed = SEED, onlyActive = false): ReturnType<typeof render> =>
    render(<FilterBoard reveal={null} onlyActive={onlyActive} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
    });

const WIDTH = 1000;
const xAt = (frac: number): number => RAIL_PAD + frac * (WIDTH - 2 * RAIL_PAD);

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [] };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("층위 칸 — 리스트형 조건도 층위를 선언한다", () => {
    it("두 칸이 다 선다", () => {
        const { container } = renderBoard();
        expect(container.textContent).toContain("하루");
        expect(container.textContent).toContain("타점");
    });

    it("레일은 여기 없다 — 축·날짜·시간은 전용 패널로 이사했다", () => {
        const { container } = renderBoard();
        expect(container.textContent).not.toContain("하루축");
        expect(container.querySelector('[title^="빈 곳을 끌면"]')).toBeNull();
    });
});

describe("그룹 — 유일하게 리스트인 조건", () => {
    it("층위마다 추가 손잡이가 선다 — 순서가 없어 레일이 못 된다", () => {
        const { container } = renderBoard();
        const adders = [...container.querySelectorAll("button")].filter((b) => b.textContent === "+ 그룹 조건");
        expect(adders).toHaveLength(2); // 하루·타점
    });
});

describe("테마 칸 — 행이 조건의 실체(소유권 보드 단일화)", () => {
    type ThemePredicate = Extract<ReturnType<typeof selectFilterStages>[number]["predicates"][number], { kind: "themeStrength" }>;
    const themePred = (): ThemePredicate => {
        const s = selectFilterStages(useWorkbench.getState()).find((x) => x.predicates[0]?.kind === "themeStrength");
        return s!.predicates[0] as ThemePredicate;
    };
    const addRow = (container: HTMLElement): void => {
        const add = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("＋ 테마 조건"));
        act(() => { fireEvent.click(add!); });
    };
    /** 연동은 sessionUi 라 테스트끼리 흘러간다 — 매번 비운다. */
    beforeEach(() => { useWorkbench.setState({ sessionUi: {} }); });

    it("＋ 테마 조건 = 켜진 기본값 행이 서고 바로 펼쳐진다(연동)", () => {
        const { container } = renderBoard();
        addRow(container);
        const stages = selectFilterStages(useWorkbench.getState());
        expect(stages).toHaveLength(1);
        expect(stages[0].enabled).toBe(true);
        expect(themePred().params.zoneRateN).toBe(30); // DEFAULT_THEME_STRENGTH
        // 펼침 = 컷 레일이 DOM 에 있다(접힌 행엔 없다).
        expect(container.querySelectorAll('[title^="누르거나 끌어서"]').length).toBeGreaterThan(0);
    });

    it("존 N 레일 드래그 — 커밋은 손 뗄 때 한 번, √ 척도의 정수 서수로", () => {
        const { container } = renderBoard();
        addRow(container);
        const track = container.querySelector('[title^="누르거나 끌어서"]') as HTMLElement; // 첫 레일 = 존 N
        fireEvent.pointerDown(track, { button: 0, clientX: xAt(0.3), pointerId: 1 });
        fireEvent.pointerMove(track, { clientX: xAt(0.5), pointerId: 1 });
        expect(themePred().params.zoneRateN).toBe(30); // 끄는 동안엔 커밋 없음
        fireEvent.pointerUp(track, { pointerId: 1 });
        // 도메인 = max(universeMax=0(빈 번들), 30, 40, 2) = 40 → 0.5² · 39 ≈ 10 + 1
        expect(themePred().params.zoneRateN).toBe(1 + Math.round(0.25 * 39));
    });

    it("스텝퍼 1클릭 = 1커밋 — 동료 ＋ 가 countMin 을 한 칸 올린다", () => {
        const { container } = renderBoard();
        addRow(container);
        const plus = [...container.querySelectorAll("button")].find((b) => b.title === "1 늘리기");
        act(() => { fireEvent.click(plus!); });
        expect(themePred().params.countMin).toBe(4);
        expect(themePred().params.zoneRateN).toBe(30); // 다른 값은 그대로
    });

    it("행 둘이면 연동 안 된 행은 요약 한 줄로 접힌다 — 클릭하면 갈아탄다", () => {
        const { container } = renderBoard();
        addRow(container);
        addRow(container); // 두 번째가 연동을 가져간다(추가 = 펼침)
        const collapsed = [...container.querySelectorAll("button")].filter((b) => b.title.startsWith("펼쳐서 레일로"));
        expect(collapsed).toHaveLength(1);
        expect(collapsed[0]!.textContent).toContain("존 30/40 · 등락 · 동료≥3"); // 새 요약 표기
        act(() => { fireEvent.click(collapsed[0]!); });
        // 갈아탄 뒤에도 펼친 행은 하나뿐이다(펼침 ≡ 연동 상태 하나).
        expect([...container.querySelectorAll("button")].filter((b) => b.title.startsWith("펼쳐서 레일로"))).toHaveLength(1);
    });

    it("◉ 토글 = 행 끄기 — 꺼져도 펼침(연동)은 유지되고 '꺼짐' 배지가 말한다", () => {
        const { container } = renderBoard();
        addRow(container);
        const toggle = [...container.querySelectorAll("button")].find((b) => b.title.startsWith("이 조건 끄기"));
        act(() => { fireEvent.click(toggle!); });
        expect(selectFilterStages(useWorkbench.getState())[0].enabled).toBe(false);
        expect(container.textContent).toContain("꺼짐");
        expect(container.querySelectorAll('[title^="누르거나 끌어서"]').length).toBeGreaterThan(0); // 레일 유지(탐색)
    });

    it("존순위 칩을 켜면 레일이 서고, 값 편집은 레일이 진다", () => {
        const { container } = renderBoard();
        addRow(container);
        const before = container.querySelectorAll('[title^="누르거나 끌어서"]').length; // 존 N·M 둘
        const zoneChip = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("존순위 ≤"));
        act(() => { fireEvent.click(zoneChip!); });
        expect(themePred().params.zoneRankOn).toBe(true);
        expect(container.querySelectorAll('[title^="누르거나 끌어서"]').length).toBe(before + 1);
    });
});
