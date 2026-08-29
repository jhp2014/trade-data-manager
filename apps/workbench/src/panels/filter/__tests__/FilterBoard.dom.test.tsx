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

// ⚠ 재편의 반대편 수용 기준 — 보드는 **관리만** 한다. 값 편집이 여기 있으면 조건을 두 문법으로
//   만지게 된다(편집면 검사는 ThemeRankPanel.dom.test.tsx).
describe("테마 칸 — 요약 줄뿐, 값은 여기서 안 고친다", () => {
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

    it("＋ 테마 조건 = 켜진 기본값 행이 선다", () => {
        const { container } = renderBoard();
        addRow(container);
        const stages = selectFilterStages(useWorkbench.getState());
        expect(stages).toHaveLength(1);
        expect(stages[0].enabled).toBe(true);
        expect(themePred().params.zoneRateN).toBe(30); // DEFAULT_THEME_STRENGTH
    });

    it("행에는 편집 손잡이가 없다 — 컷 레일도 스텝퍼도 서지 않는다", () => {
        const { container } = renderBoard();
        addRow(container);
        addRow(container);
        expect(container.querySelectorAll('[title^="누르거나 끌어서"]')).toHaveLength(0); // 컷 레일 없음
        expect([...container.querySelectorAll("button")].filter((b) => b.title === "1 늘리기")).toHaveLength(0);
    });

    it("행마다 요약 한 줄 — 어느 것이 연동 중인지 표시가 갈린다", () => {
        const { container } = renderBoard();
        addRow(container);
        addRow(container); // 마지막에 만든 행이 연동을 가져간다
        // 행 = 끝에 연동 표시가 달린 줄(＋ 추가 버튼도 안내에 패널 이름을 쓰므로 title 로는 못 가른다).
        const rows = [...container.querySelectorAll("button")]
            .filter((b) => (b.textContent ?? "").includes("◆ 연동") || (b.textContent ?? "").includes("▸ 패널에서"));
        expect(rows).toHaveLength(2);
        expect(rows.filter((b) => b.textContent?.includes("◆ 연동"))).toHaveLength(1);
        expect(rows[0]!.textContent).toContain("존 30/40 · 등락 · 동료≥3"); // 요약 표기 = 칩·막대와 같은 한 벌
    });

    it("◉ 토글 = 행 끄기 — '꺼짐' 배지가 그 사실을 말한다(깔때기 불변)", () => {
        const { container } = renderBoard();
        addRow(container);
        const toggle = [...container.querySelectorAll("button")].find((b) => b.title.startsWith("이 조건 끄기"));
        act(() => { fireEvent.click(toggle!); });
        expect(selectFilterStages(useWorkbench.getState())[0].enabled).toBe(false);
        expect(container.textContent).toContain("꺼짐");
    });

    it("✕ = 행 삭제 — 관리는 보드가 진다", () => {
        const { container } = renderBoard();
        addRow(container);
        const del = [...container.querySelectorAll("button")].find((b) => b.title === "이 조건 삭제");
        act(() => { fireEvent.click(del!); });
        expect(selectFilterStages(useWorkbench.getState())).toHaveLength(0);
    });
});
