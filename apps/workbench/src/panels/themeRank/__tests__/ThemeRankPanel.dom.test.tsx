// 테마 순위 패널 — **연동 거울**의 배선. 산점·컷선의 기하는 browser-verifier 실측이 재고(캔버스),
// 여기서 재는 건 연동 상태의 왕복이다: 행 목록 → 칩, 칩 클릭 → 연동 전환, 행 0/꺼짐의 정직한 말.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { selectFilterStages, useWorkbench } from "../../../store/workbench.js";
import { DEFAULT_THEME_STRENGTH } from "../../../lib/themeStrength.js";
import { THEME_LINK_KEY, THEME_LINK_SCOPE } from "../../filter/themeLink.js";
import { ThemeRankPanel } from "../ThemeRankPanel.js";

const SEED: Seed = { points: [] };

const renderPanel = (): ReturnType<typeof render> =>
    render(<ThemeRankPanel />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const addThemeRow = (over: Partial<typeof DEFAULT_THEME_STRENGTH> = {}): string => {
    act(() => useWorkbench.getState().addFilterStage([{ kind: "themeStrength", params: { ...DEFAULT_THEME_STRENGTH, ...over } }]));
    const stages = selectFilterStages(useWorkbench.getState());
    return stages[stages.length - 1]!.id;
};

const linkedStored = (): unknown => useWorkbench.getState().sessionUi[THEME_LINK_SCOPE]?.[THEME_LINK_KEY];

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [], sessionUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("행 0 — 조건이 없다는 사실을 그대로 말한다", () => {
    it("칩도 컷선 안내도 없이 '행 없음' 문구만", () => {
        const { container } = renderPanel();
        expect(container.textContent).toContain("테마 조건 행 없음");
        expect([...container.querySelectorAll("button")].filter((b) => b.title.includes("이 행을 비추기"))).toHaveLength(0);
    });
});

describe("칩 스트립 — 행 목록의 파생 뷰, 클릭 = 연동 전환", () => {
    it("행이 서면 칩이 서고, 기록이 없으면 첫 행이 자동 연동된다", () => {
        const a = addThemeRow();
        const { container } = renderPanel();
        const chips = [...container.querySelectorAll("button")].filter((b) => b.title.includes("연동 중") || b.title.includes("이 행을 비추기"));
        expect(chips).toHaveLength(1);
        expect(chips[0]!.title).toContain("연동 중"); // 자동 연동
        expect(container.textContent).toContain("존 30/40 · 등락"); // 요약 표기 = 보드·막대와 같은 한 벌
        expect(a).toBeTruthy();
    });

    it("다른 칩을 누르면 연동이 갈아타고, 연동 칩을 다시 누르면 해제된다", () => {
        addThemeRow();
        const b = addThemeRow({ zoneRateN: 11, zoneAmountN: 22 });
        const { container } = renderPanel();
        const chipOf = (text: string): HTMLButtonElement =>
            [...container.querySelectorAll("button")].find((x) => x.textContent?.includes(text)) as HTMLButtonElement;
        act(() => { fireEvent.click(chipOf("존 11/22")); });
        expect(linkedStored()).toBe(b);
        act(() => { fireEvent.click(chipOf("존 11/22")); });
        expect(linkedStored()).toBeNull(); // 명시적 해제 = 순수 산점
        expect(container.textContent).toContain("연동 없음");
    });

    it("연동 행이 지워지면 남은 행으로 옮겨 간다 — 죽은 참조를 비추지 않는다", () => {
        const a = addThemeRow();
        const b = addThemeRow({ zoneRateN: 11 });
        const { container } = renderPanel();
        act(() => { useWorkbench.getState().setSessionUi(THEME_LINK_SCOPE, THEME_LINK_KEY, b); });
        act(() => { useWorkbench.getState().removeFilterStage(b); });
        expect(linkedStored()).toBe(a);
        expect(container.textContent).not.toContain("존 11/40");
    });
});

// ⚠ 이 블록이 2026-08-29 재편의 수용 기준이다 — 값 편집의 집이 여기 하나다(보드 행은 요약 줄).
describe("손잡이 줄 — 연동 행의 파라미터를 직접 고친다", () => {
    type ThemePredicate = Extract<ReturnType<typeof selectFilterStages>[number]["predicates"][number], { kind: "themeStrength" }>;
    const paramsOf = (id: string): ThemePredicate["params"] => {
        const s = selectFilterStages(useWorkbench.getState()).find((x) => x.id === id)!;
        return (s.predicates[0] as ThemePredicate).params;
    };
    const btn = (c: HTMLElement, pred: (b: HTMLButtonElement) => boolean): HTMLButtonElement =>
        [...c.querySelectorAll("button")].find(pred) as HTMLButtonElement;

    it("연동 행이 없으면 손잡이 줄도 없다 — 고칠 대상이 없는 폼은 거짓말이다", () => {
        const { container } = renderPanel();
        expect(btn(container, (b) => b.title === "1 늘리기")).toBeUndefined();
    });

    /** 그 이름의 칩 안에 있는 ＋/− — 칩마다 스텝퍼가 있어 title 만으로는 못 가른다. */
    const stepIn = (c: HTMLElement, chipText: string, sign: "＋" | "−"): HTMLButtonElement => {
        const chip = [...c.querySelectorAll("span")].find((s) => (s.textContent ?? "").startsWith(chipText));
        const found = [...(chip?.querySelectorAll("button") ?? [])].find((b) => b.textContent === sign);
        if (!found) throw new Error(`'${chipText}' 칩의 ${sign} 가 없다`);
        return found;
    };

    it("스텝퍼 1클릭 = 1커밋 — 동료 ＋ 가 countMin 을 한 칸 올리고 나머지는 그대로", () => {
        const a = addThemeRow();
        const { container } = renderPanel();
        act(() => { fireEvent.click(stepIn(container, "✓ 동료 ≥", "＋")); });
        expect(paramsOf(a).countMin).toBe(DEFAULT_THEME_STRENGTH.countMin + 1);
        expect(paramsOf(a).zoneRateN).toBe(DEFAULT_THEME_STRENGTH.zoneRateN);
    });

    // 옛 보드 카드의 √ 척도 레일이 하던 "한 위씩 다듬기" — 산점 컷선(선형)은 상위권에서 위를 건너뛴다.
    it("존 N/M 은 ±1 스테퍼로도 고쳐진다 — 컷선 드래그와 같은 값을 본다", () => {
        const a = addThemeRow();
        const { container } = renderPanel();
        act(() => { fireEvent.click(stepIn(container, "존 등락 ≤", "−")); });
        expect(paramsOf(a).zoneRateN).toBe(DEFAULT_THEME_STRENGTH.zoneRateN - 1);
        act(() => { fireEvent.click(stepIn(container, "존 대금 ≤", "＋")); });
        expect(paramsOf(a).zoneAmountN).toBe(DEFAULT_THEME_STRENGTH.zoneAmountN + 1);
    });

    it("존순위 칩을 켜면 술어가 바뀐다 — 옛 보드 카드의 레일이 하던 일", () => {
        const a = addThemeRow();
        const { container } = renderPanel();
        act(() => { fireEvent.click(btn(container, (b) => (b.textContent ?? "").includes("존순위"))); });
        expect(paramsOf(a).zoneRankOn).toBe(!DEFAULT_THEME_STRENGTH.zoneRankOn);
    });

    it("기준(basis) 택1 은 그 행의 파라미터다 — 2026-08-28 에 지운 패널 헤더 컨트롤과 다른 물건", () => {
        const a = addThemeRow();
        const { container } = renderPanel();
        act(() => { fireEvent.click(btn(container, (b) => b.textContent === "대금" && b.title.startsWith("순위 조건"))); });
        expect(paramsOf(a).basis).toBe("amount");
    });
});

describe("꺼진 행 연동 — 탐색 상태를 화면이 말한다", () => {
    it("'꺼짐' 배지가 선다(깔때기 숫자와 패널 숫자가 다른 이유)", () => {
        const a = addThemeRow();
        act(() => { useWorkbench.getState().toggleFilterStage(a); });
        const { container } = renderPanel();
        expect(container.textContent).toContain("꺼짐");
    });
});
