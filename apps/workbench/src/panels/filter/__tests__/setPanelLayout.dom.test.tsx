// 집합 편성 패널 — **가운데가 본론, 집합은 상시 한 줄**이라는 배치 규약.
//
// 여기서 재는 건 조건 판정이 아니라 **자리**다: 처음 열었을 때 보이는 게 보드인가, 집합 줄이 늘 서서
// "지금 보는 집합"을 말하는가, 관리(저장·고정·열기·이름·삭제)가 줄 끝 판 **하나**에 사는가(우클릭 없음).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exprOfStages, leavesOf, refNode, type SetExpr, type SetTerm } from "../expr.js";
import { fireEvent, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seedEditing, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import type { SavedSet } from "../../../store/savedSetsSlice.js";
import { FilterFunnelPanel } from "../../FilterFunnelPanel.js";

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
    render(<FilterFunnelPanel panelId={PANEL} />, {
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

const RESET = { selectedSetRef: null, savedSets: [], panelUi: {}, filterMode: "longitudinal" as const, evalSets: null };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("집합 줄은 상시 한 줄 — 처음 보이는 것이 곧 본론(조건 목록)이다", () => {
    it("붙박이 둘(전체·연동)은 늘 서 있다", () => {
        const { container } = renderPanel();
        expect(chipByText(container, "전체")).toBeDefined();
        expect(chipByText(container, "연동")).toBeDefined();
        expect(container.textContent).toContain("→"); // 전체 → 생존은 머리글이 상시로 말한다
    });

    // 칩 줄은 **한 줄로 못 박혀 있다**(ScrollRow): 두 줄이 되면 본문 높이가 튀어 보드가 밀린다.
    it("집합 줄은 줄바꿈하지 않는다 — 넘치면 가로로 굴린다, 안내는 툴팁으로", () => {
        const { container } = renderPanel();
        const row = chipByText(container, "전체")!.parentElement!;
        expect(row.style.flexWrap).toBe("nowrap");
        expect(row.style.overflowX).toBe("auto");
        expect(container.querySelector("[title*='집합 관리']")).toBeTruthy(); // 안내는 줄 이름 툴팁에만 산다
        expect(container.textContent).not.toContain("줄 끝 ⋯");
    });
});

describe("집합 칩 = 전역 선택 포인터 — 연동 패널이 구독하는 그 값", () => {
    const ONE = [{ id: "fs1", name: "돌파", expr: exprOfStages([]), universe: "longitudinal" as const }];

    it("저장 집합은 고정 없이는 줄에 안 서고(⋯ 판에만), 고르면 줄에 서며 다시 누르면 연동으로 돌아온다", () => {
        useWorkbench.setState({ savedSets: ONE });
        const { container, baseElement } = renderPanel();
        expect(chipByText(container, "돌파")).toBeUndefined();

        fireEvent.click(btnByTitle(container, "집합 관리"));
        const mgr = baseElement as HTMLElement;
        fireEvent.click(btnByTitle(mgr, "돌파 —")); // 판에서 고르면 판이 닫힌다
        expect(useWorkbench.getState().selectedSetRef).toEqual({ kind: "saved", setId: "fs1" });
        expect(chipByText(container, "돌파")).toBeDefined(); // 고른 것은 줄에 선다

        fireEvent.click(btnByTitle(container, "돌파 —"));
        expect(useWorkbench.getState().selectedSetRef).toBeNull();
    });

    it("칩에는 멤버 수가 안 적힌다 — 이름만(수는 툴팁)", () => {
        useWorkbench.setState({ savedSets: ONE, selectedSetRef: { kind: "saved", setId: "fs1" } });
        const { container } = renderPanel();
        expect(chipByText(container, "돌파")!.textContent).toBe("돌파");
        expect(chipByText(container, "전체")!.textContent).toBe("전체");
    });

    it("칩 우클릭은 아무것도 안 연다 — 관리는 줄 끝 판 하나(고정·열기·이름·삭제)", () => {
        useWorkbench.setState({ savedSets: ONE, selectedSetRef: { kind: "saved", setId: "fs1" } });
        const { container, baseElement } = renderPanel();
        fireEvent.contextMenu(btnByTitle(container, "돌파 —"));
        expect(within(baseElement as HTMLElement).queryByText("보드에 열기")).toBeNull();

        fireEvent.click(btnByTitle(container, "집합 관리"));
        const mgr = baseElement as HTMLElement;
        // 고정 — 줄에 늘 선다(고른 것과 무관). 판에서도 안 사라진다(해제할 자리가 그 판뿐이라).
        fireEvent.click(btnByTitle(mgr, "돌파 — 줄에 고정"));
        expect(btnByTitle(mgr, "돌파 — 고정 해제").getAttribute("aria-pressed")).toBe("true");
        // 삭제는 2단계 — 한 번으로는 안 지워진다.
        fireEvent.click(btnByTitle(mgr, "삭제(한 번 더"));
        expect(useWorkbench.getState().savedSets.some((x) => x.id === "fs1")).toBe(true);
        fireEvent.click(btnByTitle(mgr, "정말 삭제"));
        expect(useWorkbench.getState().savedSets.some((x) => x.id === "fs1")).toBe(false);
        // ⚠ 목록이 비지는 않는다 — **편집할 집합은 늘 하나 있다**(빈 집합이 다시 선다).
        expect(useWorkbench.getState().savedSets).toHaveLength(1);
        expect(useWorkbench.getState().selectedSetRef).toBeNull(); // 보던 집합이 지워지면 포인터가 풀린다
    });

    // 편집 = 저장이라 「저장」 버튼이 없다(2026-09-20) — 남은 손은 **＋ 새 집합** 하나다.
    it("＋ 새 집합 — 빈 집합이 생기고 그게 편집 대상이 된다(이름은 나중에)", () => {
        seedEditing(exprOfStages([{ id: "st1", enabled: true, predicates: [{ kind: "date", ranges: [{ from: DATES[0], to: DATES[0] }] }] }]), ONE);
        const before = useWorkbench.getState().savedSets.length;
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 관리"));
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
        fireEvent.click(btnByTitle(container, "집합 관리"));
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
        const shared: SavedSet = { id: "sh", name: "양념장", expr: exprOfStages([]), universe: "longitudinal" };
        const a: SavedSet = { id: "a", name: "불고기", expr: mk("and", "root", [refNode("sh")]), universe: "longitudinal" };
        const b: SavedSet = { id: "b", name: "제육", expr: mk("and", "root", [refNode("sh")]), universe: "longitudinal" };
        const lone: SavedSet = { id: "lone", name: "혼자", expr: exprOfStages([]), universe: "longitudinal" };
        useWorkbench.setState({ savedSets: [shared, a, b, lone], editingSetId: "a", editPath: ["a"] });

        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 관리"));
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

// ⚠ 실측이 "하루 우주인데 건수가 늘 0" 으로 헷갈린 자리 — 저 정산은 **종단 기계**의 것이고
//   셀 술어는 거기서 전부 결손이라 하루 집합이면 언제나 0 이다("조건에 다 걸렸다"로 읽힌다).
//   2026-09-21 부터 그 자리에는 **「계산」 버튼**이 선다(하루 평가는 손으로 시작한다).
describe("머리글 — 모드와 계산", () => {
    const cellStage = {
        id: "c1", enabled: true,
        predicates: [{ kind: "cellValue" as const, field: "ratePct" as const, ranges: [{ from: { kind: "value" as const, value: 5 } }] }],
    };

    it("종단 모드는 `전체 → 생존` 을 적는다(재료가 구워져 있어 자동으로 따라온다)", () => {
        seedEditing(exprOfStages([{ id: "d1", enabled: true, predicates: [{ kind: "date", ranges: [{ from: DATES[0], to: DATES[1] }] }] }]));
        useWorkbench.setState({ filterMode: "longitudinal" });
        const long = renderPanel();
        expect(long.container.textContent).toContain("→");
    });

    it("하루 모드는 **「계산」 버튼**이 서고, 안 눌렀으면 그 사실을 말한다", () => {
        seedEditing(exprOfStages([cellStage]));
        useWorkbench.setState({ filterMode: "daily", evalSets: null });
        const daily = renderPanel();
        expect(daily.container.textContent).toContain("계산");
        // ⚠ 이 한 줄이 본론이다 — 빈 화면이 "조건에 다 걸렸다"로 읽히지 않게 화면이 갈라 말한다.
        expect(daily.container.textContent).toContain("아직 계산 안 함");
        expect(daily.container.textContent, "종단 정산은 안 쓴다").not.toContain("→");
    });

    it("모드와 집합이 어긋나면 한 번 클릭으로 건너갈 손잡이가 선다", () => {
        seedEditing(exprOfStages([cellStage])); // 하루 조건인데
        useWorkbench.setState({ filterMode: "longitudinal" }); // 모드는 종단
        const { container } = renderPanel();
        expect(container.textContent).toContain("모드 바꾸기");
    });
});
