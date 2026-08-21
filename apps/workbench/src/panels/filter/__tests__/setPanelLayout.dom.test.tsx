// 집합 편성 패널 — **가운데가 본론, 위아래가 서랍**이라는 배치 규약.
//
// 여기서 재는 건 조건 판정이 아니라 **자리**다: 처음 열었을 때 보이는 게 보드인가, 두 서랍이 각자
// 제 손잡이로 여닫히는가, 접힌 채로도 "지금 보는 집합"과 "전체 → 생존"을 말하는가.
// 옛 화면에서 이 셋이 전부 상시 표시라 보드가 화면의 절반도 못 쓰던 것이 이 배치의 이유다.
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

describe("두 서랍은 접힌 채로 시작한다 — 처음 보이는 것이 곧 본론(보드)이다", () => {
    it("집합 칩도 막대 목록도 안 펼쳐져 있다", () => {
        const { container } = renderPanel();
        expect(chipByText(container, "전체")).toBeUndefined(); // 집합 서랍이 접혀 있다
        expect(container.textContent).not.toContain("근접 탈락"); // 막대 서랍(칸 범례 포함)도 접혀 있다
    });

    it("접혀 있어도 말은 한다 — 상주 칩(지금 보는 집합)과 요약 줄(전체 → 생존)", () => {
        const { container } = renderPanel();
        expect(btnByTitle(container, "지금 보는 집합").textContent).toContain("작업 깔때기");
        expect(btnByTitle(container, "막대 펼치기").textContent).toContain("→"); // 2 → 2
    });
});

describe("서랍은 각자 제 손잡이로 여닫힌다", () => {
    it("상주 칩을 누르면 집합 칩이 내려온다 — 붙박이 둘(전체·연동)", () => {
        const { container } = renderPanel();
        fireEvent.click(btnByTitle(container, "지금 보는 집합"));
        expect(chipByText(container, "전체")).toBeDefined();
        expect(chipByText(container, "연동")).toBeDefined();
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
    it("저장 집합 칩을 누르면 포인터가 그 집합을 가리키고, 다시 누르면 작업 깔때기로 돌아온다", () => {
        useWorkbench.setState({ savedSets: [{ id: "fs1", name: "돌파", stages: [], part: { kind: "survivors" } }] });
        const { container } = renderPanel();
        fireEvent.click(btnByTitle(container, "지금 보는 집합"));

        // ⚠ 이름으로 찾지 않는다 — 상주 칩도 같은 이름을 말하므로(그게 이 배치의 요점이다) 글자로
        // 고르면 서랍 칩 대신 헤더 칩을 눌러 서랍이 닫힌다. 칩은 title 로 자기가 무엇인지 말한다.
        fireEvent.click(btnByTitle(container, "돌파 —"));
        expect(useWorkbench.getState().selectedSetRef).toEqual({ kind: "saved", setId: "fs1" });
        // 상주 칩이 접힘 상태에서도 그 이름을 말한다 — 다른 패널의 모수가 왜 그런지의 답이 여기 있다.
        expect(btnByTitle(container, "지금 보는 집합").textContent).toContain("돌파");

        fireEvent.click(btnByTitle(container, "돌파 —"));
        expect(useWorkbench.getState().selectedSetRef).toBeNull();
    });

    it("우클릭이 열기·삭제 메뉴를 연다 — 칩에 버튼을 더 달지 않으려고 고른 자리", () => {
        useWorkbench.setState({ savedSets: [{ id: "fs1", name: "돌파", stages: [], part: { kind: "survivors" } }] });
        const { container, baseElement } = renderPanel();
        fireEvent.click(btnByTitle(container, "지금 보는 집합"));
        fireEvent.contextMenu(btnByTitle(container, "돌파 —"));
        // 메뉴는 portal 이라 container 밖에 선다.
        expect(within(baseElement as HTMLElement).getByText("보드에 열기")).toBeDefined();
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
