// Daily 타점 생성소 — **줄 0 = 열린 집합 하나**라는 배치 규약(옛 집합 편성에서 승계)과 하루 고정 머리글.
//
// 여기서 재는 건 조건 판정이 아니라 **자리**다: 줄 0 에 지금 열린 집합 하나가 서는가, 목록과
// 관리(새 집합·열기·이름·삭제)가 그 칩의 판 **하나**에 사는가, 모드 토글·종단 정산이 없는가.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exprOfStages, leavesOf, refNode, type SetExpr, type SetTerm } from "../../filter/expr.js";
import { fireEvent, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seedEditing, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import type { SavedSet } from "../../../store/savedSetsSlice.js";
import { DailyGenPanel } from "../DailyGenPanel.js";

/** 연산자가 균일한 식 — 괄호가 없는 줄(대부분의 검사가 이 모양이다). */
const mk = (op: "and" | "or", id: string, of: SetTerm[]): SetExpr => ({ id, of, ops: of.slice(1).map(() => op), groups: [] });

const A = "005930", B = "000660";
const DATES = ["2026-07-06", "2026-07-07"];
const candidateDays: Seed["candidateDays"] = [
    { stockCode: A, date: DATES[0] },
    { stockCode: B, date: DATES[1] },
];
const points: SeedPoint[] = [{ stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" }];
const SEED: Seed = { candidateDays, points };

const PANEL = "filter-funnel-1";
const renderPanel = (): ReturnType<typeof render> =>
    render(<DailyGenPanel panelId={PANEL} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

/** 제목이 이 접두로 시작하는 버튼 — 손잡이는 전부 title 로 자기가 무엇인지 말한다. */
const btnByTitle = (c: HTMLElement, prefix: string): HTMLElement => {
    const el = [...c.querySelectorAll("button")].find((b) => (b.title ?? "").startsWith(prefix));
    if (!el) throw new Error(`'${prefix}…' 손잡이가 없다`);
    return el;
};
const chipByText = (c: HTMLElement, text: string): HTMLElement | undefined =>
    [...c.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith(text));

const RESET = { savedSets: [], panelUi: {}, filterMode: "daily" as const };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("줄 0 — 열린 집합 하나", () => {
    it("붙박이 칩(전체·연동)도, 모드 토글(종단·하루)도 없다 — 작업면은 하루 고정", () => {
        const { container } = renderPanel();
        expect(chipByText(container, "전체")).toBeUndefined();
        expect(chipByText(container, "연동")).toBeUndefined();
        expect(chipByText(container, "종단")).toBeUndefined();
        expect(chipByText(container, "하루")).toBeUndefined();
        expect(container.textContent, "종단 정산(전체 → 생존)은 안 쓴다").not.toContain("→");
    });

    it("줄 0 의 칩은 **테두리만 액센트**다 — 채움은 드릴다운 열림 전용", () => {
        seedEditing(exprOfStages([]));
        const { container } = renderPanel();
        const chip = btnByTitle(container, "집합 목록");
        expect(chip.style.background).toBe("transparent");
        expect(chip.style.borderColor || chip.style.border).toContain("accent");
        expect(chip.textContent).toContain("▾"); // 목록을 여는 손잡이
    });
});

describe("집합 목록 — 줄 0 칩의 판 하나(새 집합·열기·이름·삭제)", () => {
    const ONE = [{ id: "fs1", name: "돌파", expr: exprOfStages([]), universe: "daily" as const }];

    it("판에서 고르면 **그 집합이 열리고**(뿌리가 된다) 판이 닫힌다", () => {
        seedEditing(exprOfStages([]), ONE, "daily");
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 목록"));
        const mgr = baseElement as HTMLElement;
        fireEvent.click(btnByTitle(mgr, "돌파 —"));
        expect(useWorkbench.getState().editingSetId).toBe("fs1");
        expect(useWorkbench.getState().editPath, "연 집합이 곧 뿌리다").toEqual(["fs1"]);
    });

    it("판은 **지금 모드의 집합만** 세운다", () => {
        seedEditing(exprOfStages([]), [...ONE, { id: "fs-long", name: "종단묶음", expr: exprOfStages([]), universe: "longitudinal" as const }], "daily");
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 목록"));
        const mgr = baseElement as HTMLElement;
        expect(within(mgr).queryByText("돌파")).toBeTruthy();
        expect(within(mgr).queryByText("종단묶음"), "종단 집합은 숨는다(지우지 않는다)").toBeNull();
    });

    it("고정 칸이 없다 — 줄에 칩이 하나뿐이라 고정할 것이 없다", () => {
        seedEditing(exprOfStages([]), ONE, "daily");
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 목록"));
        const mgr = baseElement as HTMLElement;
        expect([...mgr.querySelectorAll("button")].some((b) => (b.title ?? "").includes("고정"))).toBe(false);
    });

    it("삭제는 2단계 — 한 번으로는 안 지워지고, 목록이 비지도 않는다", () => {
        seedEditing(exprOfStages([]), ONE, "daily");
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 목록"));
        const mgr = baseElement as HTMLElement;
        // ⚠ **그 행의** 손잡이를 눌러야 한다 — 목록에 여러 행이 있으면 첫 행이 잡힌다.
        const row = [...mgr.querySelectorAll("div")].find((d) => (d.textContent ?? "").startsWith("돌파") && d.querySelector("button[title^='삭제']"))!;
        fireEvent.click(within(row).getByTitle(/^삭제\(한 번 더/));
        expect(useWorkbench.getState().savedSets.some((x) => x.id === "fs1")).toBe(true);
        fireEvent.click(within(row).getByTitle(/^정말 삭제/));
        expect(useWorkbench.getState().savedSets.some((x) => x.id === "fs1")).toBe(false);
        // ⚠ 목록이 비지는 않는다 — **편집할 집합은 늘 하나 있다**.
        expect(useWorkbench.getState().savedSets.length).toBeGreaterThan(0);
    });

    // 편집 = 저장이라 「저장」 버튼이 없다(2026-09-20) — 남은 손은 **＋ 새 집합** 하나다.
    it("＋ 새 집합 — 빈 집합이 생기고 그게 편집 대상이 된다(이름은 나중에)", () => {
        seedEditing(exprOfStages([{ id: "st1", enabled: true, predicates: [{ kind: "date", ranges: [{ from: DATES[0], to: DATES[0] }] }] }]), ONE);
        const before = useWorkbench.getState().savedSets.length;
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 목록"));
        const mgr = baseElement as HTMLElement;
        expect(mgr.querySelector("input[placeholder='집합 이름']"), "「저장」 입력이 없다").toBeNull();

        fireEvent.click(within(mgr).getByText("＋ 새 집합"));
        const sets = useWorkbench.getState().savedSets;
        expect(sets).toHaveLength(before + 1);
        const editing = sets.find((x) => x.id === useWorkbench.getState().editingSetId)!;
        expect(editing.name, "이름은 안 짓는다 — 자동 이름(점선)").toBeUndefined();
        expect(leavesOf(editing.expr), "빈 집합으로 시작").toHaveLength(0);
    });

    it("이름 바꾸기 — 행의 이름 버튼 → 입력 → Enter. 다른 집합과 같은 이름은 무시된다", () => {
        useWorkbench.setState({ savedSets: [...ONE, { id: "fs2", name: "눌림", expr: exprOfStages([]), universe: "longitudinal" as const }] });
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 목록"));
        const mgr = baseElement as HTMLElement;
        fireEvent.click([...mgr.querySelectorAll("button")].find((b) => b.title === "이름 바꾸기")!);
        const input = mgr.querySelector("input[value='돌파']") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "눌림" } }); // 충돌 — 무시
        fireEvent.keyDown(input, { key: "Enter" });
        expect(useWorkbench.getState().savedSets.map((x) => x.name)).toEqual(["돌파", "눌림"]);
        fireEvent.click([...mgr.querySelectorAll("button")].find((b) => b.title === "이름 바꾸기")!);
        const input2 = mgr.querySelector("input[value='돌파']") as HTMLInputElement;
        fireEvent.change(input2, { target: { value: "돌파2" } });
        fireEvent.keyDown(input2, { key: "Enter" });
        expect(useWorkbench.getState().savedSets.map((x) => x.name)).toEqual(["돌파2", "눌림"]);
    });
});

// ── 목록 구획 — 쓰는 곳 0 / 1 / 2+ (2026-09-20) ────────────────────────────
//
// ⚠ **숨기는 게 아니라 나누기만 한다.** 안 보이는 내부 집합을 두면 익명 묶음이 이름만 바꿔 돌아온다
//   (2026-09-19 기각분이 예고한 함정). 0 칸이 청소 창구고, 2+ 칸이 파급을 미리 말한다.
describe("집합 관리 판 — 쓰는 곳으로 구획한다", () => {
    it("세 칸이 서고 아무도 안 쓰는 집합도 **보인다**", () => {
        const shared: SavedSet = { id: "sh", name: "양념장", expr: exprOfStages([]), universe: "daily" };
        const a: SavedSet = { id: "a", name: "불고기", expr: mk("and", "root", [refNode("sh")]), universe: "daily" };
        const b: SavedSet = { id: "b", name: "제육", expr: mk("and", "root", [refNode("sh")]), universe: "daily" };
        const lone: SavedSet = { id: "lone", name: "혼자", expr: exprOfStages([]), universe: "daily" };
        useWorkbench.setState({ savedSets: [shared, a, b, lone], editingSetId: "a", editPath: ["a"] });

        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 목록"));
        const mgr = baseElement as HTMLElement;
        expect(mgr.textContent).toContain("여럿이 쓰는 집합");
        expect(mgr.textContent).toContain("아무도 안 쓰는 집합");
        // 지도(위 칩 줄)에도 같은 이름이 서므로 **목록 쪽 손잡이**로 집는다(data-chip 없는 버튼).
        const listNames = [...mgr.querySelectorAll("button")]
            .filter((b) => (b as HTMLElement).dataset.chip === undefined)
            .map((b) => b.textContent ?? "");
        expect(listNames.some((t) => t.startsWith("혼자")), "안 쓰는 집합도 목록에 선다").toBe(true);
        expect(listNames.some((t) => t.startsWith("양념장"))).toBe(true);
    });
});

describe("머리글 — 하루 고정", () => {
    const cellStage = {
        id: "c1", enabled: true,
        predicates: [{ kind: "cellValue" as const, field: "ratePct" as const, ranges: [{ from: { kind: "value" as const, value: 5 } }] }],
    };

    // 조건을 **꺼 둔다** — 켜진 셀 조건이면 머리글의 수(useBoundSet)가 그날 분봉을 당겨 하네스가 네트워크를 막는다.
    it("「계산」·「낡음」·모드 바꾸기 손잡이가 없고, 조건 수는 편집 집합의 잎이다(켠 것 / 전부)", () => {
        seedEditing(exprOfStages([{ ...cellStage, enabled: false }]), [], "daily");
        const { container } = renderPanel();
        expect(container.textContent).not.toContain("계산");
        expect(container.textContent).not.toContain("낡음");
        expect(container.textContent).not.toContain("모드 바꾸기");
        expect(container.textContent).toContain("조건 0 / 1");
    });

    it("종단 조건을 품은 옛 집합을 열면 **평가 안 함**을 말한다(건너갈 손은 없다 — 종단 보류)", () => {
        seedEditing(exprOfStages([{ id: "d1", enabled: true, predicates: [{ kind: "date", ranges: [{ from: DATES[0], to: DATES[1] }] }] }]), [], "daily");
        const { container } = renderPanel();
        expect(container.textContent).toContain("종단 집합 — 평가 안 함");
    });
});
