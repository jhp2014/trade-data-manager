// 조건판(테마 순위 [조건]) — pull 연동의 배선. 산점·컷선 기하는 browser-verifier 실측이 재고(캔버스),
// 여기서 재는 건: 미연동/연동의 정직한 말, "조건 ▾" 팝오버가 연동 행의 술어를 직접 고치는지(2026-08-29
// 재편의 수용 기준 승계 — 값 편집의 집은 여기 하나), 연동 해제 시 자 스냅샷, 고아 바인딩의 무해함.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { selectEditingStages, useWorkbench } from "../../../store/workbench.js";
import { DEFAULT_THEME_STRENGTH } from "../../../lib/themeStrength.js";
import { ThemeRankPanel } from "../ThemeRankPanel.js";

const SEED: Seed = { points: [] };
const PANEL = "theme-rank-1";

const renderPanel = (): ReturnType<typeof render> =>
    render(<ThemeRankPanel panelId={PANEL} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const addThemeRow = (over: Partial<typeof DEFAULT_THEME_STRENGTH> = {}): string => {
    act(() => useWorkbench.getState().addFilterStage([{ kind: "themeStrength", params: { ...DEFAULT_THEME_STRENGTH, ...over } }]));
    const stages = selectEditingStages(useWorkbench.getState());
    return stages[stages.length - 1]!.id;
};

const bind = (rowId: string): void => act(() => useWorkbench.getState().bindTheme(rowId, PANEL));

type ThemePredicate = Extract<ReturnType<typeof selectEditingStages>[number]["predicates"][number], { kind: "themeStrength" }>;
const paramsOf = (id: string): ThemePredicate["params"] => {
    const s = selectEditingStages(useWorkbench.getState()).find((x) => x.id === id)!;
    return (s.predicates[0] as ThemePredicate).params;
};

const RESET = { filterStages: [], funnelSelection: null, savedSets: [], sessionUi: {}, themeBindings: {}, panelUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("미연동 — 판은 있되 행이 없다(pull: 연동 손잡이는 보드에 있다)", () => {
    it("'미연동' 문구가 서고, 조건 ▾ 도 카운트도 없다", () => {
        addThemeRow(); // 행이 있어도 이 판을 가리키지 않으면 미연동이다(자동 연동 폐지)
        const { container } = renderPanel();
        expect(container.textContent).toContain("미연동");
        expect(container.textContent).not.toContain("조건 ▾");
        expect(container.textContent).not.toContain("통과");
    });
});

describe("연동 — 바인딩이 가리키는 행 하나를 비춘다", () => {
    it("연동 배지 = 행 요약(보드·막대와 같은 표기 한 벌)", () => {
        bind(addThemeRow());
        const { container } = renderPanel();
        expect(container.textContent).toContain("존 30/40 · 등락");
        expect(container.textContent).toContain("조건 ▾");
    });

    it("행이 지워지면(고아 바인딩) 정직하게 미연동으로 — 죽은 참조를 비추지 않는다", () => {
        const a = addThemeRow();
        bind(a);
        const { container } = renderPanel();
        act(() => { useWorkbench.getState().removeFilterStage(a); });
        expect(container.textContent).toContain("미연동");
    });

    it("꺼진 행 연동 — '꺼짐' 배지가 선다(탐색 상태를 화면이 말한다)", () => {
        const a = addThemeRow();
        bind(a);
        act(() => { useWorkbench.getState().toggleFilterStage(a); });
        const { container } = renderPanel();
        expect(container.textContent).toContain("꺼짐");
    });
});

// ⚠ 이 블록이 2026-08-29 재편의 수용 기준(승계) — 값 편집의 집은 이 판 하나다(보드 행은 요약 줄).
//   2026-09-17 재편으로 손잡이 줄이 "조건 ▾" 팝오버로 들어갔을 뿐, 술어를 직접 고친다는 계약은 그대로다.
describe("조건 ▾ 팝오버 — 연동 행의 파라미터를 직접 고친다", () => {
    const openControls = (container: HTMLElement): void => {
        const btn = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("조건 ▾"))!;
        act(() => { fireEvent.click(btn); });
    };
    /** 팝오버는 document.body 로 portal 된다 — 그 이름의 칩 안 ＋/− 를 body 에서 찾는다. */
    const stepIn = (chipText: string, sign: "＋" | "−"): HTMLButtonElement => {
        const chip = [...document.body.querySelectorAll("span")].find((s) => (s.textContent ?? "").startsWith(chipText));
        const found = [...(chip?.querySelectorAll("button") ?? [])].find((b) => b.textContent === sign);
        if (!found) throw new Error(`'${chipText}' 칩의 ${sign} 가 없다`);
        return found;
    };

    it("스텝퍼 1클릭 = 1커밋 — 동료 ＋ 가 countMin 을 한 칸 올리고 나머지는 그대로", () => {
        const a = addThemeRow();
        bind(a);
        const { container } = renderPanel();
        openControls(container);
        act(() => { fireEvent.click(stepIn("✓ 동료 ≥", "＋")); });
        expect(paramsOf(a).countMin).toBe(DEFAULT_THEME_STRENGTH.countMin + 1);
        expect(paramsOf(a).zoneRateN).toBe(DEFAULT_THEME_STRENGTH.zoneRateN);
    });

    it("존 N/M ±1 스테퍼 — 컷선 드래그와 같은 값을 본다", () => {
        const a = addThemeRow();
        bind(a);
        const { container } = renderPanel();
        openControls(container);
        act(() => { fireEvent.click(stepIn("존 등락 ≤", "−")); });
        expect(paramsOf(a).zoneRateN).toBe(DEFAULT_THEME_STRENGTH.zoneRateN - 1);
        act(() => { fireEvent.click(stepIn("존 대금 ≤", "＋")); });
        expect(paramsOf(a).zoneAmountN).toBe(DEFAULT_THEME_STRENGTH.zoneAmountN + 1);
    });

    it("창 택1(당일→60분) — zoneAmountWindow 가 술어로 커밋된다(판정 공간 = 행의 창)", () => {
        const a = addThemeRow();
        bind(a);
        const { container } = renderPanel();
        openControls(container);
        const btn = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "60분" && b.title.includes("창"))!;
        act(() => { fireEvent.click(btn); });
        expect(paramsOf(a).zoneAmountWindow).toBe(60);
    });

    it("기준(basis) 택1 — 그 행의 파라미터다", () => {
        const a = addThemeRow();
        bind(a);
        const { container } = renderPanel();
        openControls(container);
        const btn = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "대금" && b.title.startsWith("순위 조건"))!;
        act(() => { fireEvent.click(btn); });
        expect(paramsOf(a).basis).toBe("amount");
    });
});

describe("연동 해제 — 마지막 N/M 이 자로 남는다('선은 항상 있다'의 승계)", () => {
    it("unbind 시 guides(panelUi)에 존 값이 스냅샷된다", () => {
        const a = addThemeRow({ zoneRateN: 17, zoneAmountN: 55 });
        bind(a);
        renderPanel();
        act(() => { useWorkbench.getState().unbindTheme(a); });
        const guides = useWorkbench.getState().panelUi[PANEL]?.["guides"] as Record<string, number>;
        expect(guides["y:rank"]).toBe(17);
        expect(guides["x:rank:0"]).toBe(55);
    });
});
