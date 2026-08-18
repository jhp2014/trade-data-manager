// 그룹 목록 배선 — 맵이 그림으로 하던 일을 목록이 값으로 하는지.
//
// 맵 테스트와 **같은 값을 단언한다**(같은 시드·같은 수): 대체물이 다른 숫자를 내면 옮긴 게 아니라
// 새로 지은 것이다. 그리고 쓰기는 하나여야 한다 — 짚어도 조건이 안 생기고, "필터에 추가"만이 만든다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Group } from "../../../api/groups.js";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { GroupListPanel } from "../../GroupListPanel.js";

const g = (name: string, parentName: string | null = null): Group =>
    ({ name, scope: "day", parentName });

// A: 돌파+갭상승 · B: 돌파+갭상승 · C: 돌파만 → 돌파 3, 갭상승 2, 눌림 0
// 테마 ⊃ 2차전지 는 포함관계 판정을 보기 위한 것(2차전지에 A 하나).
const SEED: Seed = {
    groups: [g("돌파"), g("갭상승"), g("눌림"), g("테마"), g("2차전지", "테마")],
    memberships: [
        { stockCode: "A", date: "2026-07-01", groupNames: ["돌파", "갭상승", "2차전지"] },
        { stockCode: "B", date: "2026-07-01", groupNames: ["돌파", "갭상승"] },
        { stockCode: "C", date: "2026-07-01", groupNames: ["돌파"] },
    ],
    candidateDays: [
        { stockCode: "A", date: "2026-07-01", traces: [] },
        { stockCode: "B", date: "2026-07-01", traces: [] },
        { stockCode: "C", date: "2026-07-01", traces: [] },
    ],
};

function renderPanel(seed: Seed = SEED): void {
    render(<Providers client={seededClient(seed)}><div style={{ width: 420, height: 600 }}><GroupListPanel /></div></Providers>);
}

/** 행 = 그룹 이름이 든 `tr`. 같은 이름이 머리줄(체인 칩)에도 서므로 표 안에서 골라야 한다. */
const row = (name: string): HTMLElement =>
    screen.getAllByText(name).map((e) => e.closest("tr")).find((t): t is HTMLTableRowElement => t !== null)!;
/** 그 행의 `&` 칸(마지막 열). */
const amp = (name: string): string => (row(name).lastElementChild?.textContent ?? "").trim();
const pick = (name: string): void => { fireEvent.click(row(name)); };
const add = (name: string): void => { fireEvent.click(row(name), { ctrlKey: true }); };

beforeEach(() => { useWorkbench.setState({ filterStages: [], filterExpandToPoints: false, funnelSelection: null }); });
afterEach(() => { useWorkbench.setState({ filterStages: [], funnelSelection: null }); cleanup(); localStorage.clear(); });

describe("모집단 수 — 맵과 같은 잣대", () => {
    it("자식 소속이 부모에도 센다(계층 상속) — 깔때기의 적용 집합을 그대로 쓴다", () => {
        renderPanel();
        // 2차전지에 A 하나 → 테마도 1(상속). 돌파 3·갭상승 2.
        expect(row("돌파").children[1]!.textContent).toBe("3");
        expect(row("갭상승").children[1]!.textContent).toBe("2");
        expect(row("테마").children[1]!.textContent).toBe("1");
        expect(row("눌림").children[1]!.textContent).toBe("0");
    });
});

/**
 * ⚠ 겪은 버그: 항목을 차트 단위로만 접어 놓으면 `appliedGroupNamesOf` 가 **하루 소속만** 돌려주므로
 * (시각 없는 참조 → chartOf) `scope:"point"` 그룹이 전부 0으로 나왔다. 맵은 평면마다 scope 가 있어
 * 그 함정을 피하고 있었는데 목록으로 옮기며 잃었던 자리다. 그래서 **두 층위를 함께** 못박는다.
 */
describe("scope — 층위별로 센다", () => {
    const TIME = "09:30:00";
    const POINT_SEED: Seed = {
        groups: [g("돌파"), { ...g("눌림타점"), scope: "point" }],
        memberships: [
            // 하루 소속 하나 + **타점 소속** 하나(시각이 있다).
            { stockCode: "A", date: "2026-07-01", groupNames: ["돌파"] },
            { stockCode: "A", date: "2026-07-01", time: TIME, groupNames: ["눌림타점"] },
        ],
        candidateDays: [{ stockCode: "A", date: "2026-07-01", traces: [] }],
        // 타점 모집단(viewedPointRefs)의 재료 — 이게 없으면 타점 피드가 비어 수가 0이 된다.
        points: [{ stockCode: "A", date: "2026-07-01", time: TIME, outcome: null, axisValues: {} } as never],
    };

    it("**타점 그룹의 수가 0이 아니다** — 이게 그 버그였다", () => {
        renderPanel(POINT_SEED);
        expect(row("눌림타점").children[1]!.textContent).toBe("1");
    });

    it("하루 그룹은 하루 층위로 센다 — 층위가 섞여도 각자 맞는다", () => {
        renderPanel(POINT_SEED);
        expect(row("돌파").children[1]!.textContent).toBe("1");
    });

    it("행에 scope 배지가 선다 — 수의 단위가 여기서 갈리므로 상시 표기다", () => {
        renderPanel(POINT_SEED);
        expect(row("눌림타점").textContent).toContain("타점");
        expect(row("돌파").textContent).toContain("하루");
    });

    it("하루 그룹과 타점 그룹의 교집합이 잡힌다 — 타점 층위에서 성립한다", () => {
        renderPanel(POINT_SEED);
        pick("돌파");
        expect(amp("눌림타점")).toContain("1");
    });
});

describe("체인 — 맵과 같은 손짓", () => {
    it("클릭하면 짚히고 공통 수가 뜬다", () => {
        renderPanel();
        pick("돌파");
        expect(screen.getByText("공통 3")).toBeTruthy();
    });

    it("Ctrl+클릭으로 이어 누르면 체인이 자라고 공통 수가 좁아진다", () => {
        renderPanel();
        pick("돌파");
        add("갭상승");
        expect(screen.getByText("공통 2")).toBeTruthy();
    });

    it("그냥 클릭은 갈아타기 — 교집합이 안 생긴다", () => {
        renderPanel();
        pick("돌파");
        pick("갭상승");
        expect(screen.getByText("공통 2")).toBeTruthy(); // 갭상승 하나만
        expect(screen.queryByText("&")).toBeNull();       // 체인이 하나면 & 이 없다
    });

    it("같은 행을 다시 그냥 클릭하면 풀린다", () => {
        renderPanel();
        pick("돌파");
        pick("돌파");
        expect(screen.queryByText("필터에 추가")).toBeNull();
    });

    it("갈 수 없는 곳은 Ctrl+클릭으로도 안 붙는다 — 교집합이 0이다", () => {
        renderPanel();
        pick("돌파");
        add("눌림");
        expect(screen.getByText("공통 3")).toBeTruthy(); // 돌파만 그대로
    });
});

describe("`&` 열 — 맵의 화살표 위 숫자가 여기로 왔다", () => {
    it("체인 전에는 비어 있다", () => {
        renderPanel();
        expect(amp("갭상승")).toBe("");
    });

    it("짚은 것은 '짚음', 갈 수 있는 곳은 그 수", () => {
        renderPanel();
        pick("돌파");
        expect(amp("돌파")).toBe("짚음");
        expect(amp("갭상승")).toContain("2");
        expect(amp("눌림")).toBe("0");
    });

    it("**체인 전체 기준**이다 — 마지막 하나가 아니라", () => {
        renderPanel();
        pick("돌파");
        add("갭상승");
        // 돌파&갭상승 = {A,B}, 그중 2차전지는 A 하나 → 1. (갭상승만 기준이어도 1이지만
        // 여기서 보는 건 값이 체인 전체를 탄다는 사실이다 — 0이 아니라 1이 나온다.)
        expect(amp("2차전지")).toContain("1");
    });

    it("조상·자손은 '포함' — 좁혀지지 않는 걸음이라 수를 안 적는다", () => {
        renderPanel();
        pick("2차전지");
        expect(amp("테마")).toBe("포함");
    });
});

describe("쓰기는 하나 — 필터에 추가", () => {
    it("짚기만 해서는 조건이 안 생긴다", () => {
        renderPanel();
        pick("돌파");
        add("갭상승");
        expect(useWorkbench.getState().filterStages).toHaveLength(0);
    });

    it("누르면 **그룹마다 단계 하나**가 생긴다 — 한 단계에 몰면 어느 단계가 무엇을 죽였는지 못 묻는다", () => {
        renderPanel();
        pick("돌파");
        add("갭상승");
        fireEvent.click(screen.getByText("필터에 추가"));
        const stages = useWorkbench.getState().filterStages;
        expect(stages).toHaveLength(2);
    });
});

describe("계층 — 들여쓰기와 접기", () => {
    it("접으면 자식 행이 사라진다", () => {
        renderPanel();
        expect(row("2차전지")).toBeTruthy();
        fireEvent.click(screen.getByTitle("접기"));
        expect(screen.queryAllByText("2차전지")).toHaveLength(0);
    });

    it("정렬을 겹침으로 바꾸면 계층이 접힌다(들여쓰기 없음)", () => {
        renderPanel();
        pick("돌파");
        fireEvent.click(screen.getByTitle(/계층 그대로 볼까/));
        // 겹침순에서는 짚은 것이 맨 위 — 표의 첫 행이 돌파다.
        const first = document.querySelector("tbody tr")!;
        expect(first.textContent).toContain("돌파");
    });
});
