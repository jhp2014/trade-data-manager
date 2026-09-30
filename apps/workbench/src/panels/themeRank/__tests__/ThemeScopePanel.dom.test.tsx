// 시장 단면 판(옛 테마 순위) — 축 자유·연동 원리적 부재의 배선. 기하는 실측 몫이고 여기선:
// 축 ▾ 팝오버 왕복(임의 분 입력 → panelUi 영속), 연동/판정 UI 가 아예 없다는 사실.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import { ThemeScopePanel } from "../ThemeScopePanel.js";

const SEED: Seed = { points: [] };
const PANEL = "theme-scope-1";

const renderPanel = (): ReturnType<typeof render> =>
    render(<ThemeScopePanel panelId={PANEL} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const RESET = { savedSets: [], sessionUi: {}, panelUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("관찰판 — 연동·판정이 원리적으로 없다", () => {
    it("테마 행이 있어도 연동 배지·조건 ▾·카운트가 안 서고, 존은 고르기 전엔 없다(자동 겹침 폐지)", () => {
        act(() => useWorkbench.getState().addFilterStage([{ kind: "theme", ...DEFAULT_THEME_ZONE }]));
        const { container } = renderPanel();
        expect(container.textContent).not.toContain("조건 ▾");
        expect(container.textContent).not.toContain("통과");
        expect(container.textContent).not.toContain("미연동");
        expect(useWorkbench.getState().panelUi[PANEL]?.["zone"]).toBeUndefined();
    });
});

describe("존 ▾ — 걸린 테마 조건에서 존 값을 **복사**한다", () => {
    const openZone = (container: HTMLElement): void => {
        const trigger = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("존"))!;
        act(() => { fireEvent.click(trigger); });
    };
    const item = (text: string): HTMLElement =>
        [...document.body.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(text))!;

    it("고르면 존·축이 판에 복사되고, 원본을 고쳐도 안 따라간다", () => {
        act(() => useWorkbench.getState().addFilterStage([{ kind: "theme", ...DEFAULT_THEME_ZONE, window: 30, zoneAmountN: 25, rate: { mode: "value", minPct: 7 } }]));
        const { container } = renderPanel();
        openZone(container);
        act(() => { fireEvent.click(item("대금≤25")); });
        const ui = useWorkbench.getState().panelUi[PANEL]!;
        expect(ui["zone"]).toMatchObject({ window: 30, zoneAmountN: 25, rate: { mode: "value", minPct: 7 } });
        expect(ui["axes"]).toMatchObject({ windowMin: 30, xMode: "rank", yMode: "value" });
        expect(container.textContent).toContain("존: 테마 30분");
        // 원본 수정 — 판의 사본은 그대로.
        const st = useWorkbench.getState();
        const leaf = st.savedSets.find((x) => x.id === st.editingSetId)!.expr.of.find((t) => t.kind === "cond")!;
        if (leaf.kind !== "cond") throw new Error("cond");
        act(() => useWorkbench.getState().setFilterStagePredicates(leaf.stage.id, [{ kind: "theme", ...DEFAULT_THEME_ZONE, zoneAmountN: 99 }]));
        expect(useWorkbench.getState().panelUi[PANEL]!["zone"]).toMatchObject({ zoneAmountN: 25 });
    });

    it("고른 뒤 축을 손으로 바꾸면 그 변은 숨고 「존 선 숨김(축 다름)」이 말한다 · ● 는 출처 주소로", () => {
        act(() => useWorkbench.getState().addFilterStage([{ kind: "theme", ...DEFAULT_THEME_ZONE, window: 30 }]));
        act(() => useWorkbench.getState().addFilterStage([{ kind: "theme", ...DEFAULT_THEME_ZONE, window: 30 }])); // 같은 값 두 줄
        const { container } = renderPanel();
        openZone(container);
        const rows = [...document.body.querySelectorAll("button")].filter((b) => (b.textContent ?? "").includes("테마 30분"));
        expect(rows).toHaveLength(2);
        act(() => { fireEvent.click(rows[1]!); });
        openZone(container);
        const marked = [...document.body.querySelectorAll("button")].filter((b) => (b.textContent ?? "").includes("테마 30분") && (b.textContent ?? "").includes("●"));
        expect(marked, "같은 값 두 줄 중 고른 것 하나만 ●").toHaveLength(1);
        act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
        act(() => useWorkbench.getState().setPanelUi(PANEL, "axes", { xMode: "rank", yMode: "value", windowMin: null }));
        expect(container.textContent).toContain("존 선 숨김(축 다름)");
    });

    it("끄기 = null · 기본값으로 = 기본 존", () => {
        const { container } = renderPanel();
        openZone(container);
        act(() => { fireEvent.click(item("기본값으로")); });
        expect(useWorkbench.getState().panelUi[PANEL]!["zone"]).toMatchObject({ zoneAmountN: DEFAULT_THEME_ZONE.zoneAmountN, from: "기본값" });
        openZone(container);
        act(() => { fireEvent.click(item("끄기")); });
        expect(useWorkbench.getState().panelUi[PANEL]!["zone"]).toBeNull();
    });
});

describe("축 ▾ — 창 임의 분 입력이 인스턴스 영속으로 커밋된다", () => {
    it("45분 입력(Enter) → panelUi axes.windowMin=45, 헤더 요약이 따라온다", () => {
        const { container } = renderPanel();
        const trigger = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("축:"))!;
        act(() => { fireEvent.click(trigger); });
        const input = document.body.querySelector("input")!;
        act(() => {
            fireEvent.change(input, { target: { value: "45" } });
            fireEvent.keyDown(input, { key: "Enter" });
        });
        expect((useWorkbench.getState().panelUi[PANEL]?.["axes"] as { windowMin?: number }).windowMin).toBe(45);
        expect(container.textContent).toContain("45분");
    });

    it("모드 택(등락 값) → 저장 + 요약 반영", () => {
        const { container } = renderPanel();
        const trigger = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("축:"))!;
        act(() => { fireEvent.click(trigger); });
        // 팝오버의 "등락" 줄 안 "값" 버튼 — 줄(span)로 좁혀 찾는다.
        const row = [...document.body.querySelectorAll("span")].find((s) => (s.textContent ?? "").startsWith("등락순위값"))
            ?? [...document.body.querySelectorAll("span")].find((s) => (s.textContent ?? "").startsWith("등락"));
        const btn = [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "값")!;
        act(() => { fireEvent.click(btn); });
        expect((useWorkbench.getState().panelUi[PANEL]?.["axes"] as { yMode?: string }).yMode).toBe("value");
    });
});

describe("축 ▾ — % 선 칩(panelUi rateTicks, 부재 = 기본)", () => {
    const open = (container: HTMLElement): void => {
        const trigger = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("축:"))!;
        act(() => { fireEvent.click(trigger); });
    };
    const chipRow = (): HTMLElement => [...document.body.querySelectorAll("span")].find((s) => (s.textContent ?? "").startsWith("% 선"))!;

    it("＋ 로 7 추가 → 오름차순 저장, × 로 빼기", () => {
        const { container } = renderPanel();
        open(container);
        act(() => { fireEvent.click([...chipRow().querySelectorAll("button")].find((b) => b.textContent === "＋")!); });
        const input = chipRow().querySelector("input")!;
        act(() => {
            fireEvent.change(input, { target: { value: "7" } });
            fireEvent.keyDown(input, { key: "Enter" });
        });
        expect(useWorkbench.getState().panelUi[PANEL]?.["rateTicks"]).toEqual([0, 5, 7, 10, 20]);
        act(() => { fireEvent.click(chipRow().querySelector("button[aria-label='5% 선 빼기']")!); });
        expect(useWorkbench.getState().panelUi[PANEL]?.["rateTicks"]).toEqual([0, 7, 10, 20]);
    });

    const editChip = (label: string, value: string, key = "Enter"): void => {
        act(() => { fireEvent.click([...chipRow().querySelectorAll("button")].find((b) => b.textContent === label)!); });
        const input = chipRow().querySelector("input")!;
        act(() => {
            fireEvent.change(input, { target: { value } });
            fireEvent.keyDown(input, { key });
        });
    };
    const stored = (): unknown => useWorkbench.getState().panelUi[PANEL]?.["rateTicks"];

    it("값 고치기 → 다시 정렬 · 중복은 합침 · 빈칸 = 삭제", () => {
        act(() => useWorkbench.getState().setPanelUi(PANEL, "rateTicks", [0, 5, 10]));
        const { container } = renderPanel();
        open(container);
        editChip("0", "12");
        expect(stored()).toEqual([5, 10, 12]);
        editChip("5", "10");
        expect(stored()).toEqual([10, 12]);
        editChip("12", "");
        expect(stored()).toEqual([10]);
    });

    it("못 읽는 글자·Esc 는 취소(칩 유지, 판도 안 닫힘) · 표시 모양(−5%)은 받는다", () => {
        act(() => useWorkbench.getState().setPanelUi(PANEL, "rateTicks", [5]));
        const { container } = renderPanel();
        open(container);
        editChip("5", "abc");
        expect(stored()).toEqual([5]);
        editChip("5", "9", "Escape");
        expect(stored()).toEqual([5]);
        expect(chipRow()).toBeTruthy(); // 판이 살아 있다
        editChip("5", "−5%");
        expect(stored()).toEqual([-5]);
    });

    it("키 없는 판에서 빈 ＋ 커밋은 아무것도 쓰지 않는다(기본값이 저장물로 굳지 않게)", () => {
        const { container } = renderPanel();
        open(container);
        editChip("＋", "");
        expect(stored()).toBeUndefined();
    });

    it("전부 빼면 [] 저장(끔 — 기본값으로 되살아나지 않는다)", () => {
        act(() => useWorkbench.getState().setPanelUi(PANEL, "rateTicks", [5]));
        const { container } = renderPanel();
        open(container);
        act(() => { fireEvent.click(chipRow().querySelector("button[aria-label='5% 선 빼기']")!); });
        expect(useWorkbench.getState().panelUi[PANEL]?.["rateTicks"]).toEqual([]);
        expect(chipRow().textContent).not.toContain("×");
    });
});
