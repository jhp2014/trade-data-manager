// 집합 편성 패널 — **가운데가 본론, 집합은 상시 한 줄, 막대는 아래 서랍**이라는 배치 규약.
//
// 여기서 재는 건 조건 판정이 아니라 **자리**다: 처음 열었을 때 보이는 게 보드인가, 집합 줄이 늘 서서
// "지금 보는 집합"을 말하는가, 관리(저장·고정·열기·이름·삭제)가 줄 끝 판 **하나**에 사는가(우클릭 없음).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { FilterFunnelPanel } from "../../FilterFunnelPanel.js";

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

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [], panelUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("집합 줄은 상시 한 줄, 막대 서랍은 접힌 채로 시작한다 — 처음 보이는 것이 곧 본론(보드)이다", () => {
    it("붙박이 둘(전체·연동)은 늘 서 있고, 막대 목록은 안 펼쳐져 있다", () => {
        const { container } = renderPanel();
        expect(chipByText(container, "전체")).toBeDefined();
        expect(chipByText(container, "연동")).toBeDefined();
        expect(container.textContent).not.toContain("근접 탈락"); // 막대 서랍(칸 범례 포함)은 접혀 있다
        expect(btnByTitle(container, "막대 펼치기").textContent).toContain("→"); // 2 → 2
    });

    // 칩 줄은 **한 줄로 못 박혀 있다**(ScrollRow): 두 줄이 되면 본문 높이가 튀어 보드가 밀린다.
    it("집합 줄은 줄바꿈하지 않는다 — 넘치면 가로로 굴린다, 안내는 툴팁으로", () => {
        const { container } = renderPanel();
        const row = chipByText(container, "전체")!.parentElement!;
        expect(row.style.flexWrap).toBe("nowrap");
        expect(row.style.overflowX).toBe("auto");
        expect(container.querySelector("[title*='칩으로 섭니다']")).toBeTruthy(); // 안내는 줄 이름 툴팁에만 산다
        expect(container.textContent).not.toContain("칩으로 섭니다");
    });

    it("요약 줄을 누르면 막대가 아래에서 올라온다", () => {
        const { container } = renderPanel();
        fireEvent.click(btnByTitle(container, "막대 펼치기"));
        expect(container.textContent).toContain("근접 탈락"); // 칸 범례 = 막대가 펼쳐졌다는 표식
        fireEvent.click(btnByTitle(container, "막대 접기"));
        expect(container.textContent).not.toContain("근접 탈락");
    });
});

describe("집합 칩 = 전역 선택 포인터 — 연동 패널이 구독하는 그 값", () => {
    const ONE = [{ id: "fs1", name: "돌파", stages: [], part: { kind: "survivors" as const } }];

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
        expect(useWorkbench.getState().savedSets).toHaveLength(1);
        fireEvent.click(btnByTitle(mgr, "정말 삭제"));
        expect(useWorkbench.getState().savedSets).toHaveLength(0);
        expect(useWorkbench.getState().selectedSetRef).toBeNull(); // 보던 집합이 지워지면 작업 깔때기로
    });

    it("저장 — 판의 이름 입력으로, 같은 이름이면 버튼이 덮어쓰기로 바뀐다(브라우저 prompt 없음)", () => {
        useWorkbench.setState({
            savedSets: ONE,
            filterStages: [{ id: "st1", enabled: true, predicates: [{ kind: "date", ranges: [{ from: DATES[0], to: DATES[0] }] }] }],
        });
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "집합 관리"));
        const mgr = baseElement as HTMLElement;
        const input = mgr.querySelector("input[placeholder='집합 이름']") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "돌파" } });
        expect(within(mgr).getByText("덮어쓰기")).toBeDefined();
        fireEvent.change(input, { target: { value: "새 집합" } });
        fireEvent.keyDown(input, { key: "Enter" });
        const sets = useWorkbench.getState().savedSets;
        expect(sets.map((x) => x.name)).toEqual(["돌파", "새 집합"]);
        expect(sets[1]!.stages).toHaveLength(1);
    });

    it("이름 바꾸기 — 행의 이름 버튼 → 입력 → Enter. 다른 집합과 같은 이름은 무시된다", () => {
        useWorkbench.setState({ savedSets: [...ONE, { id: "fs2", name: "눌림", stages: [], part: { kind: "survivors" } }] });
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

describe("층위 머리 띠는 안 붙는다 — 스크롤 중 레일 위를 지나가지 않는다", () => {
    it("보드의 '하루'·'타점' 띠에 sticky 가 없다", () => {
        const { container } = renderPanel();
        const band = [...container.querySelectorAll("div")].find((d) => d.textContent?.startsWith("하루종목"))
            ?? [...container.querySelectorAll("span")].find((s) => s.textContent === "하루")?.parentElement;
        expect(band).toBeDefined();
        expect(band!.style.position).not.toBe("sticky");
    });
});
