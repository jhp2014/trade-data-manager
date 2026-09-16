// 조건 보드 — 집합 편성의 본론. 여기서 재는 건 **관리소의 규약**이다:
//   ① 걸린 것이 종류를 가리지 않고 전부 한 목록에 선다(불변식 — 안 보이는데 숫자가 달라지면 사고)
//   ② 줄에는 값 편집 손잡이가 없다(편집면은 종류마다 따로 — 두 문법으로 만지지 않게)
//   ③ 이름 클릭 = 그 종류의 편집면으로(레일 = 신호, 테마 = 연동, 그룹 = 그 자리 팝오버)
//   ④ ＋ 조건 = 생성 입구 하나. **레일만 행을 안 만든다**(빈 술어 필터 금지 · 긋는 순간 조건)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { selectFilterStages, useWorkbench } from "../../../store/workbench.js";
import { DEFAULT_THEME_STRENGTH } from "../../../lib/themeStrength.js";
import { REVEAL_SCOPE, RAIL_REVEAL } from "../boardReveal.js";
import { THEME_LINK_KEY, THEME_LINK_SCOPE } from "../themeLink.js";
import { ConditionBoard } from "../ConditionBoard.js";

const A = "005930", B = "000660";
const DATES = ["2026-07-06", "2026-07-07"];
const candidateDays: Seed["candidateDays"] = [
    { stockCode: A, date: DATES[0] },
    { stockCode: B, date: DATES[1] },
];
const points: SeedPoint[] = [{ stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" }];
const SEED: Seed = { candidateDays, points };

const renderBoard = (barsOpen = false): ReturnType<typeof render> =>
    render(<ConditionBoard barsOpen={barsOpen} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const buttons = (c: HTMLElement): HTMLButtonElement[] => [...c.querySelectorAll("button")];
const byText = (c: HTMLElement, text: string): HTMLButtonElement | undefined =>
    buttons(c).find((b) => (b.textContent ?? "").includes(text));
const stages = (): ReturnType<typeof selectFilterStages> => selectFilterStages(useWorkbench.getState());

const DATE_STAGE = { id: "d1", enabled: true, predicates: [{ kind: "date" as const, ranges: [{ from: DATES[0], to: DATES[1] }] }] };
const THEME_STAGE = { id: "t1", enabled: true, predicates: [{ kind: "themeStrength" as const, params: { ...DEFAULT_THEME_STRENGTH } }] };

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [], sessionUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("한 목록 — 종류를 가리지 않고 걸린 것이 전부 선다", () => {
    it("레일에서 만든 조건(날짜)도, 테마 행도 같은 목록에 요약 줄로 선다", () => {
        useWorkbench.setState({ filterStages: [DATE_STAGE, THEME_STAGE] });
        const { container } = renderBoard();
        expect(container.textContent).toContain("26.07.06~26.07.07"); // 날짜 요약
        expect(container.textContent).toContain("존 30/40 · 등락"); // 테마 요약(칩·패널과 같은 한 벌)
        expect(container.textContent).toContain("날짜");
        expect(container.textContent).toContain("테마");
    });

    it("조건이 없으면 어디서 만드는지 적는다 — 빈 자리로 두면 왜 없는지 모른다", () => {
        const { container } = renderBoard();
        expect(container.textContent).toContain("＋ 조건");
        expect(container.textContent).toContain("필터 레일에서 그으면");
    });
});

describe("줄에는 값 편집 손잡이가 없다 — 편집면은 종류마다 따로", () => {
    it("컷 레일도 스텝퍼도 트랙도 서지 않는다", () => {
        useWorkbench.setState({ filterStages: [DATE_STAGE, THEME_STAGE] });
        const { container } = renderBoard();
        expect(container.querySelector('[title^="빈 곳을 끌면"]')).toBeNull(); // 레일 트랙
        expect(container.querySelector('[title^="누르거나 끌어서"]')).toBeNull(); // 컷 레일
        expect(buttons(container).filter((b) => b.title === "1 늘리기")).toHaveLength(0); // 스텝퍼
    });

    it("막대는 머리글 토글이 지배한다 — 접히면 요약 한 줄, 펴면 5칸과 수치", () => {
        useWorkbench.setState({ filterStages: [DATE_STAGE] });
        const { container, rerender } = renderBoard(false);
        expect(container.textContent).not.toContain("새로 죽임");
        rerender(<ConditionBoard barsOpen />);
        expect(container.textContent).toContain("새로 죽임");
    });
});

describe("이름 클릭 — 그 종류의 편집면으로", () => {
    it("레일 조건은 되짚기 신호를 남긴다(패널 경계를 넘으므로 세션 자리에)", () => {
        useWorkbench.setState({ filterStages: [DATE_STAGE] });
        const { container } = renderBoard();
        act(() => { fireEvent.click(byText(container, "26.07.06~26.07.07")!); });
        const signal = useWorkbench.getState().sessionUi[REVEAL_SCOPE]?.[RAIL_REVEAL] as { stageId: string } | undefined;
        expect(signal?.stageId).toBe("d1");
    });

    it("테마 조건은 연동을 그 행으로 옮긴다 — 패널이 비추는 행이 곧 이 줄이다", () => {
        useWorkbench.setState({ filterStages: [DATE_STAGE, THEME_STAGE] });
        const { container } = renderBoard();
        act(() => { useWorkbench.getState().setSessionUi(THEME_LINK_SCOPE, THEME_LINK_KEY, null); });
        act(() => { fireEvent.click(byText(container, "존 30/40")!); });
        expect(useWorkbench.getState().sessionUi[THEME_LINK_SCOPE]?.[THEME_LINK_KEY]).toBe("t1");
    });
});

describe("＋ 조건 — 생성 입구 하나", () => {
    const openMenu = (c: HTMLElement): void => { act(() => { fireEvent.click(byText(c, "＋ 조건")!); }); };

    it("테마 강도 = 켜진 기본값 행이 선다", () => {
        const { container } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(container, "테마 강도")!); });
        expect(stages()).toHaveLength(1);
        expect(stages()[0]!.enabled).toBe(true);
        expect(stages()[0]!.predicates[0]!.kind).toBe("themeStrength");
    });

    // ⚠ 이 검사가 Q2 의 수용 기준 — 계산 축엔 기본값이 없고(분포를 봐야 안다) 빈 술어 필터는 안 만든다.
    it("레일은 **행을 만들지 않는다** — 판으로 데려갈 뿐이다(긋는 순간 조건)", () => {
        const { container } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(container, "레일 — 계산 축")!); });
        expect(stages()).toHaveLength(0);
    });

    // 2026-09-16 술어 scope 명시화 — 옛 "입구 하나"(2026-09-01, 그룹이 하루 층위 하나뿐이던 시절)를
    // 뒤집었다: scope 는 태어나는 자리에서 확정되므로 입구가 곧 층위다.
    it("그룹 입구는 둘(하루/타점) — 팔레트만 열고, 식을 쓰기 전엔 필터가 아니다(draft)", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        expect(byText(container, "그룹 조건")).toBeUndefined(); // 옛 단일 입구는 없다
        expect(byText(container, "그룹 (하루)")).toBeDefined();
        expect(byText(container, "그룹 (타점)")).toBeDefined();
        act(() => { fireEvent.click(byText(container, "그룹 (하루)")!); });
        expect(stages()).toHaveLength(0);
        expect(baseElement.textContent).toContain("그룹 조건 (하루)"); // 팔레트 머리가 층위를 말한다
    });

    // 팔레트 1:1(B안, 2026-09-16 저녁): 그룹의 낟알 = 조건의 scope. 하루 팔레트에 타점 그룹이 다시
    // 섞이면(오전 안의 ∃ 뜻) 같은 그룹이 입구 따라 다른 질문이 되는 모호함이 재발한다 — 여기서 걸린다.
    it("그룹 (하루) 팔레트 — 하루 그룹만 선다(타점 그룹·빈 그룹 제외), ∅ 은 있다", () => {
        const seed: Seed = {
            ...SEED,
            groups: [{ name: "눌림", parentName: null }, { name: "돌파형", parentName: null }, { name: "빈그룹", parentName: null }],
            memberships: [{ stockCode: A, date: DATES[0], groupNames: ["돌파형"] }],
            pointMemberships: [{ stockCode: A, date: DATES[0], time: "09:30:00", groupNames: ["눌림"] }],
        };
        const { container, baseElement } = render(<ConditionBoard barsOpen={false} />, {
            wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
        });
        openMenu(container);
        act(() => { fireEvent.click(byText(container, "그룹 (하루)")!); });
        const palette = [...baseElement.querySelectorAll("button")].map((b) => b.textContent ?? "");
        expect(palette.some((t) => t.includes("돌파형"))).toBe(true);
        expect(palette.some((t) => t.includes("눌림"))).toBe(false); // 타점 그룹은 하루 질문을 못 받는다
        expect(palette.some((t) => t.includes("빈그룹"))).toBe(false); // 항상 거짓 리터럴은 노이즈
        expect(baseElement.textContent).toContain("그룹 없음"); // ∅ 행은 하루 전용으로 남는다
    });

    it("그룹 (타점) — 팔레트엔 타점 그룹만 서고(∅·day 그룹 없음), 닫으면 point scope 조건이 된다", () => {
        const seed: Seed = {
            ...SEED,
            groups: [{ name: "눌림", parentName: null }, { name: "돌파형", parentName: null }],
            memberships: [{ stockCode: A, date: DATES[0], groupNames: ["돌파형"] }], // 돌파형 = day 그룹
            pointMemberships: [{ stockCode: A, date: DATES[0], time: "09:30:00", groupNames: ["눌림"] }], // 눌림 = 타점 그룹
        };
        const { container, baseElement } = render(<ConditionBoard barsOpen={false} />, {
            wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
        });
        openMenu(container);
        act(() => { fireEvent.click(byText(container, "그룹 (타점)")!); });
        const palette = (): string[] => [...baseElement.querySelectorAll("button")].map((b) => b.textContent ?? "");
        expect(palette().some((t) => t.includes("눌림"))).toBe(true);
        expect(palette().some((t) => t.includes("돌파형"))).toBe(false); // day 그룹은 point 질문을 못 받는다
        expect(baseElement.textContent).not.toContain("그룹 없음"); // ∅ 은 하루 질문 하나뿐
        // 고르고 Escape 로 닫으면 draft 가 point scope 조건으로 커밋된다(scope 는 입구가 정한 값).
        act(() => { fireEvent.click([...baseElement.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("눌림"))!); });
        act(() => { fireEvent.keyDown(baseElement.querySelector('input[placeholder="그룹 검색"]')!, { key: "Escape" }); });
        expect(stages()).toHaveLength(1);
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "group", scope: "point" });
    });

    // ⚠ 리뷰 F4 — "scope 보존" 주석(ConditionEditors)이 지목한 조용한 손실 경로의 그물. 편집 쓰기에서
    // scope 를 빠뜨리거나 openEditor 가 "day" 로 단순화되면 여기가 잡는다(타입·다른 테스트는 통과한다).
    it("point 조건 재편집 — 팔레트에서 칩을 추가해도 scope 가 유지된다", () => {
        const seed: Seed = {
            ...SEED,
            groups: [{ name: "눌림", parentName: null }, { name: "재돌파", parentName: null }],
            pointMemberships: [{ stockCode: A, date: DATES[0], time: "09:30:00", groupNames: ["눌림", "재돌파"] }],
        };
        useWorkbench.setState({
            filterStages: [{
                id: "pg", enabled: true,
                predicates: [{ kind: "group" as const, expr: { groups: [{ literals: [{ groupId: "눌림", neg: false }] }] }, scope: "point" as const }],
            }],
        });
        const { container, baseElement } = render(<ConditionBoard barsOpen={false} />, {
            wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
        });
        act(() => { fireEvent.click(byText(container, "눌림")!); }); // 줄 이름 → 그 자리 팔레트(편집)
        const addRow = [...baseElement.querySelectorAll("button")]
            .find((b) => (b.textContent ?? "").includes("재돌파") && !container.contains(b))!; // 팔레트 쪽 행만
        act(() => { fireEvent.click(addRow); });
        const p = stages()[0]!.predicates[0]!;
        expect(p).toMatchObject({ kind: "group", scope: "point" });
        expect(p.kind === "group" ? p.expr.groups : []).toHaveLength(2);
    });
});

// ⚠ 순서는 결과가 아니라 **서술**을 정한다(어느 필터가 무엇을 죽였나) — 그래서 표시 순서와 store
//   배열 인덱스의 사상이 어긋나면 숫자가 조용히 틀린다. 층위를 넘는 드롭 차단도 여기서 잰다.
describe("순서 — 표시 순서를 store 배열 인덱스로 옮긴다", () => {
    const DATE_2 = { id: "d2", enabled: true, predicates: [{ kind: "date" as const, ranges: [{ from: DATES[1], to: DATES[1] }] }] };
    const TIME_POINT = { id: "p1", enabled: true, predicates: [{ kind: "time" as const, ranges: [{ from: "09:00", to: "10:00" }] }] };
    /** dataTransfer 는 jsdom 에 없다 — 우리가 실제로 쓰는 셋(setData·types·effectAllowed)만 흉내낸다. */
    const fakeDt = (): DataTransfer => {
        const bag = new Map<string, string>();
        return {
            setData: (t: string, v: string) => { bag.set(t, v); },
            getData: (t: string) => bag.get(t) ?? "",
            get types() { return [...bag.keys()]; },
            effectAllowed: "none",
        } as unknown as DataTransfer;
    };
    /** 줄 전체(draggable div) — 이름 버튼의 조상 중 draggable 인 것. */
    const rowOf = (c: HTMLElement, text: string): HTMLElement => {
        let el: HTMLElement | null = byText(c, text) ?? null;
        while (el && !el.draggable) el = el.parentElement;
        if (!el) throw new Error(`'${text}' 줄이 없다`);
        return el;
    };
    /**
     * ⚠ 세 이벤트를 한 `act` 로 묶으면 안 된다 — dragStart 가 심은 `dragId` 가 커밋되기 전에 drop
     * 핸들러가 옛 클로저를 읽어 아무 일도 안 난다(검사가 조용히 통과하는 게 아니라 조용히 실패한다).
     * fireEvent 는 각자 act 로 감싸므로 나눠 부르면 사이에 리렌더가 낀다.
     */
    const dragRow = (c: HTMLElement, from: string, to: string): void => {
        const dataTransfer = fakeDt();
        fireEvent.dragStart(rowOf(c, from), { dataTransfer });
        fireEvent.dragOver(rowOf(c, to), { dataTransfer });
        fireEvent.drop(rowOf(c, to), { dataTransfer });
    };

    const ids = (): string[] => stages().map((s) => s.id);

    // ⚠ **표시 순서 ≠ store 순서**로 심는다(타점 조건이 배열 맨 앞인데 화면에선 하루 칸이 먼저 선다).
    //   둘이 같은 배열로 재면 인덱스 사상이 어긋나도 항등이라 통과한다 — 재려던 걸 안 재는 검사가 된다.
    it("표시로는 이웃이어도 store 인덱스로 옮긴다", () => {
        useWorkbench.setState({ filterStages: [TIME_POINT, DATE_STAGE, DATE_2] });
        const { container } = renderBoard();
        expect(ids()).toEqual(["p1", "d1", "d2"]);

        dragRow(container, "26.07.07~26.07.07", "26.07.06~26.07.07"); // d2 를 d1 자리로

        expect(ids()).toEqual(["p1", "d2", "d1"]);
    });

    it("층위는 못 넘는다 — 하루 조건을 타점 조건에 떨어뜨려도 그대로", () => {
        useWorkbench.setState({ filterStages: [DATE_STAGE, TIME_POINT] });
        const { container } = renderBoard();

        dragRow(container, "26.07.06~26.07.07", "09:00~10:00");

        expect(ids()).toEqual(["d1", "p1"]);
    });
});

describe("관리 — 켜기/끄기와 삭제는 보드가 진다", () => {
    it("◉ 토글로 깔때기에서 빼고, ✕ 로 지운다", () => {
        useWorkbench.setState({ filterStages: [DATE_STAGE] });
        const { container } = renderBoard();
        act(() => { fireEvent.click(buttons(container).find((b) => b.title.startsWith("이 필터 끄기"))!); });
        expect(stages()[0]!.enabled).toBe(false);
        act(() => { fireEvent.click(buttons(container).find((b) => b.title === "이 필터 지우기")!); });
        expect(stages()).toHaveLength(0);
    });
});
