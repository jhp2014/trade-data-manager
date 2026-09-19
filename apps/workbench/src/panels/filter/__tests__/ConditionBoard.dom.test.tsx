// 조건 보드 — 집합 편성의 본론. 여기서 재는 건 **관리소의 규약**이다:
//   ① 걸린 것이 종류를 가리지 않고 전부 한 목록에 선다(불변식 — 안 보이는데 숫자가 달라지면 사고)
//   ② 줄에는 값 편집 손잡이가 없다(편집면은 종류마다 따로 — 두 문법으로 만지지 않게)
//   ③ 이름 클릭 = 그 종류의 편집면으로(레일 = 신호, 테마 = 연동, 그룹 = 그 자리 팝오버)
//   ④ ＋ 조건 = 생성 입구 하나. **레일만 행을 안 만든다**(빈 술어 필터 금지 · 긋는 순간 조건)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exprOfStages } from "../expr.js";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { selectFilterStages, useWorkbench } from "../../../store/workbench.js";
import { DEFAULT_THEME_STRENGTH } from "../../../lib/themeStrength.js";
import { ConditionBoard } from "../ConditionBoard.js";

const A = "005930", B = "000660";
const DATES = ["2026-07-06", "2026-07-07"];
const candidateDays: Seed["candidateDays"] = [
    { stockCode: A, date: DATES[0] },
    { stockCode: B, date: DATES[1] },
];
const points: SeedPoint[] = [{ stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" }];
const SEED: Seed = { candidateDays, points };

const renderBoard = (): ReturnType<typeof render> =>
    render(<ConditionBoard panelId="filter-funnel-1" />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers>,
    });

const buttons = (c: HTMLElement): HTMLButtonElement[] => [...c.querySelectorAll("button")];
const byText = (c: HTMLElement, text: string): HTMLButtonElement | undefined =>
    buttons(c).find((b) => (b.textContent ?? "").includes(text));
const stages = (): ReturnType<typeof selectFilterStages> => selectFilterStages(useWorkbench.getState());

const DATE_STAGE = { id: "d1", enabled: true, predicates: [{ kind: "date" as const, ranges: [{ from: DATES[0], to: DATES[1] }] }] };
const THEME_STAGE = { id: "t1", enabled: true, predicates: [{ kind: "themeStrength" as const, params: { ...DEFAULT_THEME_STRENGTH } }] };
/**
 * 하루 우주로 **끌어내리는** 조건 — 우주는 파생이라(9단계) 셀 종류 메뉴는 이런 조건이 있어야 뜬다.
 * ⚠ 일부러 **누적대금**이다: 줄에 선 칩의 라벨이 팔레트 항목 이름과 겹치면(`등락률 ≥ 5` vs 팔레트
 *   `등락률`) `byText` 의 startsWith 가 칩을 먼저 집어, 메뉴 대신 편집면이 열린다.
 */
const CELL_STAGE = { id: "c1", enabled: true, predicates: [{ kind: "cellValue" as const, field: "cumAmountEok" as const, ranges: [{ from: { kind: "value" as const, value: 100 } }] }] };

const RESET = { filterExpr: exprOfStages([]), funnelSelection: null, selectedSetRef: null, savedSets: [], sessionUi: {}, themeBindings: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("한 목록 — 종류를 가리지 않고 걸린 것이 전부 선다", () => {
    it("레일에서 만든 조건(날짜)도, 테마 행도 같은 목록에 요약 줄로 선다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE, THEME_STAGE]) });
        const { container } = renderBoard();
        expect(container.textContent).toContain("26.07.06~26.07.07"); // 날짜 요약
        expect(container.textContent).toContain("존 30/40 · 등락"); // 테마 요약(칩·패널과 같은 한 벌)
        expect(container.textContent).toContain("날짜");
        expect(container.textContent).toContain("테마");
    });

    it("조건이 없으면 어디서 만드는지 적는다 — 빈 자리로 두면 왜 없는지 모른다", () => {
        const { container } = renderBoard();
        expect(container.textContent).toContain("＋ 조건");
        expect(container.textContent).toContain("으로 만듭니다");
    });
});

describe("줄에는 값 편집 손잡이가 없다 — 편집면은 종류마다 따로", () => {
    it("컷 레일도 스텝퍼도 트랙도 서지 않는다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE, THEME_STAGE]) });
        const { container } = renderBoard();
        expect(container.querySelector('[title^="빈 곳을 끌면"]')).toBeNull(); // 레일 트랙
        expect(container.querySelector('[title^="누르거나 끌어서"]')).toBeNull(); // 컷 레일
        expect(buttons(container).filter((b) => b.title === "1 늘리기")).toHaveLength(0); // 스텝퍼
    });

    it("줄은 요약 한 줄이 전부다 — 5칸 진단(새로 죽임)은 은퇴했다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE]) });
        const { container } = renderBoard();
        expect(container.textContent).not.toContain("새로 죽임");
    });
});

describe("이름 클릭 — 그 종류의 편집면으로", () => {
    it("1차원 조건(날짜)은 **그 자리 팝오버**를 연다 — 패널 경계를 안 넘는다(2026-09-19 레일 패널 철거)", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE]) });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "26.07.06~26.07.07")!); });
        expect(baseElement.textContent).toContain("날짜 구간");
    });

    it("테마 조건 — 미연동 행 이름 클릭 = 연동 메뉴(pull: 이 보드가 유일한 연동 손잡이)", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE, THEME_STAGE]) });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "존 30/40")!); });
        // 자동 연동 폐지 — 세션 포인터 대신 메뉴가 뜬다(미연동 조건판 목록 + 새 조건판).
        expect(baseElement.textContent).toContain("연동할 조건판");
        expect(baseElement.textContent).toContain("＋ 새 조건판");
        // 상비 슬롯 1(테마 순위 [조건])이 후보로 선다 — 고르면 영속 바인딩이 생긴다.
        act(() => { fireEvent.click(byText(baseElement as HTMLElement, "○ 테마 순위 [조건]")!); });
        expect(useWorkbench.getState().themeBindings["t1"]).toBe("theme-rank-1");
    });

    it("소멸된 판을 가리키는 바인딩 = 읽기 시점 미연동 — 배지가 죽은 판 이름을 말하지 않는다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([THEME_STAGE]) });
        // 슬롯 대장(기본 시딩)에 없는 판 id — ×로 소멸된 판이 남긴 바인딩의 모양.
        act(() => { useWorkbench.getState().bindTheme("t1", "theme-rank-9"); });
        const { container } = renderBoard();
        expect(container.textContent).not.toContain("테마 순위 [조건] 9");
        expect(container.textContent).toContain("○ 미연동");
    });

    it("고아 바인딩은 후보를 점유하지 않는다 — 죽은 행이 가리키는 판도 목록에 선다(2026-09-17 실사용 버그)", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([THEME_STAGE]) });
        // 살아 있지 않은 행 id 가 기본 판(슬롯 1)을 가리키는 고아 — 집합 적용의 통째 교체가 남기는 모양.
        act(() => { useWorkbench.getState().bindTheme("dead-row", "theme-rank-1"); });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "존 30/40")!); });
        expect(byText(baseElement as HTMLElement, "○ 테마 순위 [조건]")).toBeTruthy();
    });

    it("연동된 테마 행 — 배지가 판 이름을 말하고, 배지 클릭 = 변경/해제 메뉴", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([THEME_STAGE]) });
        act(() => { useWorkbench.getState().bindTheme("t1", "theme-rank-1"); });
        const { container, baseElement } = renderBoard();
        expect(container.textContent).toContain("◆ 테마 순위 [조건]");
        act(() => { fireEvent.click(byText(container, "◆ 테마 순위 [조건]")!); });
        expect(baseElement.textContent).toContain("연동 해제");
        act(() => { fireEvent.click(byText(baseElement as HTMLElement, "연동 해제")!); });
        expect(useWorkbench.getState().themeBindings["t1"]).toBeUndefined();
    });
});

describe("＋ 조건 — 생성 입구 하나", () => {
    // ⚠ 메뉴는 **포털(document.body)** 로 뜬다 — 스크롤 컨테이너 안 absolute 로 두면 판이 패널 위로
    //   솟아 dockview 탭 스트립에 덮인다(2026-09-19 실측). 그래서 항목은 container 가 아니라
    //   baseElement 에서 찾는다.
    const openMenu = (c: HTMLElement): void => { act(() => { fireEvent.click(byText(c, "＋ 조건")!); }); };

    it("테마 강도 = 켜진 기본값 행이 선다", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "테마 강도")!); });
        expect(stages()).toHaveLength(1);
        expect(stages()[0]!.enabled).toBe(true);
        expect(stages()[0]!.predicates[0]!.kind).toBe("themeStrength");
    });

    // ⚠ 이 검사가 Q2 의 수용 기준 — 계산 축엔 기본값이 없고(분포를 봐야 안다) 빈 술어 필터는 안 만든다.
    it("1차원 조건은 **행을 만들지 않는다** — 팝오버만 열고 값이 커밋돼야 조건이 된다", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "날짜")!); });
        expect(stages()).toHaveLength(0);
        expect(baseElement.textContent).toContain("날짜 구간"); // 편집면은 그 자리에 열린다
    });

    it("계산 축은 팝오버 **안에서 한 겹** 들어간다 — 팝오버를 겹쳐 띄우면 바깥 클릭 해제가 서로를 먹는다", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "계산 축 — 값 구간")!); });
        expect(byText(baseElement, "◂ 종류")).toBeDefined();
        expect(stages()).toHaveLength(0);
    });

    // 2026-09-16 술어 scope 명시화 — 옛 "입구 하나"(2026-09-01, 그룹이 하루 층위 하나뿐이던 시절)를
    // 뒤집었다: scope 는 태어나는 자리에서 확정되므로 입구가 곧 층위다.
    it("그룹 입구는 둘(하루/타점) — 팔레트만 열고, 식을 쓰기 전엔 필터가 아니다(draft)", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        expect(byText(baseElement, "그룹 조건")).toBeUndefined(); // 옛 단일 입구는 없다
        expect(byText(baseElement, "그룹 (하루)")).toBeDefined();
        expect(byText(baseElement, "그룹 (타점)")).toBeDefined();
        act(() => { fireEvent.click(byText(baseElement, "그룹 (하루)")!); });
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
        const { container, baseElement } = render(<ConditionBoard panelId="filter-funnel-1" />, {
            wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
        });
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "그룹 (하루)")!); });
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
        const { container, baseElement } = render(<ConditionBoard panelId="filter-funnel-1" />, {
            wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
        });
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "그룹 (타점)")!); });
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
            filterExpr: exprOfStages([{
                id: "pg", enabled: true,
                predicates: [{ kind: "group" as const, expr: { groups: [{ literals: [{ groupId: "눌림", neg: false }] }] }, scope: "point" as const }],
            }]),
        });
        const { container, baseElement } = render(<ConditionBoard panelId="filter-funnel-1" />, {
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
describe("관리 — 켜기/끄기와 삭제는 보드가 진다", () => {
    it("◉ 토글로 깔때기에서 빼고, ✕ 로 지운다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE]) });
        const { container } = renderBoard();
        act(() => { fireEvent.click(buttons(container).find((b) => b.title.startsWith("이 조건 끄기"))!); });
        expect(stages()[0]!.enabled).toBe(false);
        act(() => { fireEvent.click(buttons(container).find((b) => b.title === "이 조건 지우기")!); });
        expect(stages()).toHaveLength(0);
    });
});

// 7단계 — 식 트리 편집면. 괄호를 손으로 치지 않고 **두 버튼**이 중첩을 만든다는 것이 핵심 계약이다.
describe("식 트리 — 묶음·부정·삽입 지점", () => {
    const stage2 = { id: "d2", enabled: true, predicates: [{ kind: "date" as const, ranges: [{ from: DATES[1], to: DATES[1] }] }] };

    it("묶음은 연산자 뱃지와 자식 수를 말한다 — AND 기본", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE, stage2]) });
        const { container } = renderBoard();
        expect(byText(container, "AND")).toBeDefined();
        expect(container.textContent).toContain("모두 · 2");
    });

    it("뱃지 클릭 = AND ↔ OR 토글", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE, stage2]) });
        const { container } = renderBoard();
        act(() => { fireEvent.click(byText(container, "AND")!); });
        expect(useWorkbench.getState().filterExpr.kind).toBe("or");
        expect(container.textContent).toContain("하나라도 · 2");
    });

    // ⚠ 이 검사가 7단계의 수용 기준 — 사용자는 괄호를 안 치고 "OR 로 추가"만 고른다.
    it("AND 자리에서 'OR 로 추가' 하면 **OR 묶음이 새로 생기며** 둘을 담는다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([CELL_STAGE]) });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 조건")!); });
        act(() => { fireEvent.click(byText(baseElement, "OR 로 추가")!); });
        act(() => { fireEvent.click(byText(baseElement, "등락률")!); });
        // 짚은 자리(루트 AND)가 **OR 묶음으로 감싸인다** — 뜻은 `기존 ∨ 새것` 이고, 그게 사용자가
        // "OR 로 추가"로 기대하는 것이다. 괄호는 이 규칙의 결과로 생긴다(손으로 안 친다).
        const e = useWorkbench.getState().filterExpr;
        expect(e.kind).toBe("or");
        expect(e.kind === "or" && e.of.map((c) => c.kind)).toEqual(["and", "cond"]);
    });

    // ⚠ 실측이 잡은 자리 — 셀 종류만 삽입 지점을 타고 **그룹·테마·급타점은 루트에 AND 로** 갔다.
    //   "조건 만들기의 입구는 하나"가 깨지면 토글이 조용히 무시된다. 셀이 아닌 종류로 한 번 더 잠근다.
    it("셀이 아닌 종류(테마 강도)도 'OR 로 추가'를 **탄다** — 붙는 곳을 정하는 손은 하나다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE]) });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 조건")!); });
        act(() => { fireEvent.click(byText(baseElement, "OR 로 추가")!); });
        act(() => { fireEvent.click(byText(baseElement, "테마 강도")!); });
        const e = useWorkbench.getState().filterExpr;
        expect(e.kind).toBe("or");
        expect(e.kind === "or" && e.of.map((c) => c.kind)).toEqual(["and", "cond"]);
    });

    it("잎 부정 — ¬ 가 식에 실리고 줄에 표식이 선다", () => {
        useWorkbench.setState({ filterExpr: exprOfStages([DATE_STAGE]) });
        const { container } = renderBoard();
        const negBtn = buttons(container).find((b) => b.title.startsWith("이 조건 부정"));
        expect(negBtn).toBeDefined();
        act(() => { fireEvent.click(negBtn!); });
        const e = useWorkbench.getState().filterExpr;
        expect(e.kind === "and" && e.of[0]!.neg).toBe(true);
    });
});
