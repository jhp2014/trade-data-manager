// 라벨 타점 [탐색] — 배선(멤버십 피드 → 목록 · 열 판 영속 · w/s · 우클릭 배정). 칸 판정·정렬은 순수부 테스트가 잠근다.
// 여기서 잠그는 불변식 —
//  ① w/s 는 날짜 경계를 넘고, 하루 라벨만 있는 차트의 「타점 없음」 줄에서 멈춘다(focus.time null — goToDay).
//  ② 배정 입구는 **행의 날짜**를 싣는다(행마다 날짜가 다르다 — focus.date 가 아니다).
//  ③ 열 판에서 고르면 (이름, 종류)로 영속.
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { selectRowNavOwner, useRowNavHotkeys } from "../../../lib/rowNav.js";
import { useKeymapDynamic } from "../../../keymap/dynamic.js";
import { useGroupAssign } from "../../../store/groupAssign.js";
import { useWorkbench } from "../../../store/workbench.js";
import { pointGroupMembershipsQuery } from "../../../api/queries.js";
import { LabelExplorePanel } from "../LabelExplorePanel.js";
import { LABEL_EXPLORE_PANEL_ID as PANEL } from "../labelRows.js";
import { PanelFrame } from "../../../components/header/PanelFrame.js";
import { ControlBoard } from "../../../components/header/ControlBoard.js";

const seed: Seed = {
    groups: [{ name: "돌파", parentName: null }, { name: "주도", parentName: null }],
    memberships: [{ stockCode: "C", date: "2026-09-25", groupNames: ["주도"] }],
    pointMemberships: [
        { stockCode: "A", date: "2026-09-25", time: "09:12:00", groupNames: ["돌파"] },
        { stockCode: "B", date: "2026-09-24", time: "09:04:00", groupNames: ["돌파"] },
    ],
    stockNames: [
        { stockCode: "A", name: "에이", market: "거래소" },
        { stockCode: "B", name: "비", market: "거래소" },
        { stockCode: "C", name: "씨", market: "거래소" },
    ],
};

// 헤더는 셸(PanelFrame·모음 판)이 그린다 — 실제 배치처럼 틀에 감싸고, 컨트롤 판은 상시 렌더해 손잡이에 닿는다.
function Harness(): JSX.Element {
    useRowNavHotkeys();
    return (
        <>
            <PanelFrame panelId={PANEL}><LabelExplorePanel panelId={PANEL} /></PanelFrame>
            <ControlBoard panelId={PANEL} />
        </>
    );
}

const renderLabel = (s: Seed = seed): ReturnType<typeof render> & { client: ReturnType<typeof seededClient> } => {
    const client = seededClient(s);
    return { ...render(<Providers client={client}><Harness /></Providers>), client };
};

const press = (key: "w" | "s"): void => {
    const cmd = Object.values(useKeymapDynamic.getState().commands).find((c) => c.keys === key);
    act(() => cmd?.run?.(new KeyboardEvent("keydown")));
};

const rowTexts = (c: HTMLElement): string[] => [...c.querySelectorAll<HTMLTableRowElement>("tbody tr")].map((tr) => tr.textContent ?? "").filter((t) => t !== "");

beforeEach(() => {
    localStorage.clear();
    useWorkbench.setState({ focus: { ...useWorkbench.getState().focus, date: "2026-09-20", code: "", time: null }, panelUi: {} });
    useKeymapDynamic.setState({ commands: {} });
    useGroupAssign.getState().close();
    act(() => selectRowNavOwner("label-explore"));
});

describe("라벨 [탐색] — 목록", () => {
    it("기본 = 「고른 라벨」 + 열 0 → 안내, 「모든 라벨」로 바꾸면 날짜 → 종목 → 시간(최근순)", () => {
        const { container } = renderLabel();
        expect(container.textContent).toContain("열을 고르면");
        act(() => { useWorkbench.getState().setPanelUi(PANEL, "rowRange", "all"); });
        expect(rowTexts(container)).toEqual(["2026-09-25 (금)", "에이", "09:12", "씨", "타점 없음", "2026-09-24 (목)", "비", "09:04"]);
    });

    it("열 판에서 고르면 (이름, 종류)로 영속되고 그 열 ●/○ 행만 선다", () => {
        const { container, baseElement } = renderLabel();
        // 판형 컨트롤의 열기 트리거 — 이름은 줄(span)이 말하고 트리거는 요약("N개 ▾")만 든다. title 로 집는다.
        const colsBtn = [...container.querySelectorAll("button")].find((b) => (b.title ?? "").startsWith("열로 세울 라벨"))!;
        act(() => { fireEvent.click(colsBtn); });
        const items = [...baseElement.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !container.contains(b) && (b.textContent ?? "").includes("주도"));
        expect(items, "주도는 하루 라벨 절에만").toHaveLength(1);
        act(() => { fireEvent.click(items[0]!); });
        expect(useWorkbench.getState().panelUi[PANEL]?.["labelCols"]).toEqual([{ name: "주도", scope: "day" }]);
        expect(rowTexts(container), "하루 라벨만 있는 씨 = 「타점 없음」 줄에 ● · 날짜 줄·범례에 개수 없음").toEqual(["2026-09-25 (금)", "씨", "타점 없음●"]);
        expect(container.textContent).not.toContain("주도 1");
    });
});

describe("라벨 [탐색] — w/s", () => {
    it("날짜 경계를 넘고, 「타점 없음」 줄에서 멈춘다(time null)", () => {
        act(() => { useWorkbench.getState().setPanelUi(PANEL, "rowRange", "all"); });
        renderLabel();
        press("s");
        expect(useWorkbench.getState().focus).toMatchObject({ code: "A", date: "2026-09-25", time: "09:12:00" });
        press("s");
        expect(useWorkbench.getState().focus, "씨 = 「타점 없음」 멈춤").toMatchObject({ code: "C", date: "2026-09-25", time: null });
        press("s");
        expect(useWorkbench.getState().focus, "날짜를 넘는다").toMatchObject({ code: "B", date: "2026-09-24", time: "09:04:00" });
        press("s");
        expect(useWorkbench.getState().focus, "끝 = 그대로").toMatchObject({ code: "B", time: "09:04:00" });
    });

    it("둘러보다 목록의 다른 행(다른 날)에 닿아도 s 는 보던 타점 다음으로 — 커서 = 책갈피", () => {
        act(() => { useWorkbench.getState().setPanelUi(PANEL, "rowRange", "all"); });
        renderLabel();
        press("s"); // A 09:12
        act(() => { useWorkbench.getState().goToPoint({ date: "2026-09-24", code: "B", time: "09:04:00" }, "chart"); });
        press("s");
        expect(useWorkbench.getState().focus, "비 끝이 아니라 에이 다음 = 씨").toMatchObject({ code: "C", date: "2026-09-25", time: null });
    });

    it("라벨을 떼서 커서 행이 사라지면 다음 s 는 그 자리의 이웃으로", async () => {
        act(() => { useWorkbench.getState().setPanelUi(PANEL, "rowRange", "all"); });
        const { container, client } = renderLabel();
        press("s"); // A 09:12
        act(() => {
            client.setQueryData(pointGroupMembershipsQuery().queryKey, [{ stockCode: "B", date: "2026-09-24", time: "09:04:00", groupNames: ["돌파"] }]);
        });
        await waitFor(() => expect(rowTexts(container)).not.toContain("에이"));
        press("s");
        expect(useWorkbench.getState().focus, "처음이 아니라 사라진 A 다음 = 씨 「타점 없음」 — 같은 날 이웃").toMatchObject({ code: "C", time: null });
    });
});

describe("라벨 [탐색] — 우클릭 배정", () => {
    it("행의 날짜를 싣는다 — 종목 이름줄·「타점 없음」 = 하루 · 타점 줄 = 좌표", () => {
        act(() => { useWorkbench.getState().setPanelUi(PANEL, "rowRange", "all"); });
        const { container } = renderLabel();
        const head = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "비")!;
        act(() => { fireEvent.contextMenu(head, { clientX: 1, clientY: 2 }); });
        expect(useGroupAssign.getState().target).toEqual({ stockCode: "B", name: "비", date: "2026-09-24" });

        const pointRow = [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((tr) => tr.textContent === "09:04")!;
        act(() => { fireEvent.contextMenu(pointRow, { clientX: 1, clientY: 2 }); });
        expect(useGroupAssign.getState().target).toEqual({ stockCode: "B", name: "비", date: "2026-09-24", time: "09:04:00" });

        const noPoint = [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((tr) => tr.textContent === "타점 없음")!;
        act(() => { fireEvent.contextMenu(noPoint, { clientX: 1, clientY: 2 }); });
        expect(useGroupAssign.getState().target, "「타점 없음」 = 하루 배정(시각 없음)").toEqual({ stockCode: "C", name: "씨", date: "2026-09-25" });
    });
});
