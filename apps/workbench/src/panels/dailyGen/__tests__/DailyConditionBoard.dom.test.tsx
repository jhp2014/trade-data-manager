// 일별 타점 [생성] 조건 보드 — 옛 「집합 편성」 ConditionBoard 의 **관리소 규약**을 하루 보드로 옮긴 것.
//   ① 걸린 것이 전부 **한 줄에 칩으로** 선다 ② 칩을 누르면 그 내용이 **아랫줄**에 열린다(편집면은 한 곳)
//   ③ 이름 클릭 = 그 종류의 편집면(시각·테마·돌파 = 그 자리 팝오버 — 2026-09-26 격자판·연동 은퇴)
//   ④ ＋ 조건 = 하루 종류만(생성기 돌파 + 후보 필터) ⑤ 연산자·괄호·NOT·묶음 쌓임은 옛 보드와 같은 식 문법
//
// ⚠ 조건 줄은 **열었을 때만** 선다 — 그래서 대부분의 검사가 `openChip` 으로 시작한다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exprOfStages, refsOf, topOpOf } from "../../filter/expr.js";
import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers, seedEditing, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { selectEditingExpr, selectEditingStages, useWorkbench } from "../../../store/workbench.js";
import { DailyConditionBoard, setPickerOf } from "../DailyConditionBoard.js";

const A = "005930", B = "000660";
const DATES = ["2026-07-06", "2026-07-07"];
const candidateDays: Seed["candidateDays"] = [
    { stockCode: A, date: DATES[0] },
    { stockCode: B, date: DATES[1] },
];
const points: SeedPoint[] = [{ stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" }];
const SEED: Seed = { candidateDays, points };

const renderBoard = (seed: Seed = SEED): ReturnType<typeof render> =>
    render(<DailyConditionBoard />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
    });

const buttons = (c: HTMLElement): HTMLButtonElement[] => [...c.querySelectorAll("button")];
/**
 * 손잡이 찾기 — **위 칩 줄(지도)은 건너뛴다**(`data-chip`). 같은 이름이 지도와 작업대에 둘 다 서는데,
 * 여기서 재는 건 늘 작업대 쪽(편집면을 여는 손)이다. 지도 쪽은 `chipByText` 로 따로 집는다.
 */
const byText = (c: HTMLElement, text: string): HTMLButtonElement | undefined =>
    buttons(c).filter((b) => b.dataset.chip === undefined).find((b) => (b.textContent ?? "").includes(text));
const chipByText = (c: HTMLElement, text: string): HTMLButtonElement | undefined =>
    buttons(c).filter((b) => b.dataset.chip !== undefined).find((b) => (b.textContent ?? "").includes(text));
const stages = (): ReturnType<typeof selectEditingStages> => selectEditingStages(useWorkbench.getState());
/** 칩을 눌러 **아랫줄 편집면**을 연다 — 조건 줄은 이제 늘 서 있지 않다(2026-09-21). */
const openChip = (c: HTMLElement, text: string): void => {
    const chip = chipByText(c, text);
    if (!chip) throw new Error(`칩 '${text}' 가 없다`);
    act(() => { fireEvent.click(chip); });
};
const rows = (c: HTMLElement): HTMLElement[] => [...c.querySelectorAll("[data-row]")] as HTMLElement[];
/** 우클릭 — 항의 성질(NOT·끄기·빼기)과 괄호 조작은 **여기 전용**이다(2026-09-22). */
const rightClick = (el: Element): void => { act(() => { fireEvent.contextMenu(el); }); };
/** 뜬 판에서 한 줄 고르기 — 판은 body 로 portal 된다(ui/popover). `c` 는 부르는 자리 표시일 뿐 검색은 body. */
const pickItem = (_c: HTMLElement, text: string): void => {
    const it = [...document.body.querySelectorAll('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes(text));
    if (!it) throw new Error(`판에 '${text}' 가 없다`);
    act(() => { fireEvent.click(it); });
};

const RATE_STAGE = { id: "d1", enabled: true, predicates: [{ kind: "candle" as const, axes: { rate: { on: true, from: 5 } } }] };
const BO_STAGE = { id: "t1", enabled: true, predicates: [{ kind: "breakout" as const, zigzagPct: 2, bandPct: 0.5, chain: { expr: { id: "chain", of: [], ops: [], groups: [] }, firstK: 1 } }] };
const TIME_STAGE = { id: "tm", enabled: true, predicates: [{ kind: "time" as const, ranges: [{ from: "09:00", to: "10:30" }] }] };
const RESET = { savedSets: [], editingSetId: "edit", editPath: ["edit"], sessionUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

describe("한 줄 — 종류를 가리지 않고 걸린 것이 전부 칩으로 선다", () => {
    it("셀 값 조건도, 돌파 생성기도 같은 줄에 칩으로 선다", () => {
        seedEditing(exprOfStages([RATE_STAGE, BO_STAGE]));
        const { container } = renderBoard();
        expect(chipByText(container, "캔들 등락률≥5%"), "셀 값 요약").toBeDefined();
        expect(chipByText(container, "돌파 2%/0.5%"), "생성기 칩 — 요약 라벨(테마 칩과 같은 문법)").toBeDefined();
        expect(rows(container), "줄은 하나 — 내려간 게 없다").toHaveLength(1);
    });

    // ⚠ "조건 없음"은 **줄이 제 입으로** 말한다 — 위에 또 적으면, 묶음으로 내려가 아랫줄이 비었을 때
    //   화면 맨 위가 "없음"이라면서 바로 아래 줄에는 조건이 서 있는 모순이 생긴다(실측이 잡은 자리).
    it("조건이 없으면 **그 줄이** 제한 없음을 말한다 — 같은 말을 두 자리에서 하지 않는다", () => {
        const { container } = renderBoard();
        expect(rows(container)).toHaveLength(1);
        expect(rows(container)[0]!.textContent).toContain("조건 없음 — 제한이 없습니다");
        expect(container.textContent).toContain("＋ 조건");
        expect(container.textContent, "옛 상단 안내는 죽었다").not.toContain("으로 만듭니다");
    });
});

describe("줄에는 값 편집 손잡이가 없다 — 편집면은 종류마다 따로", () => {
    it("컷 레일도 스텝퍼도 트랙도 서지 않는다", () => {
        seedEditing(exprOfStages([RATE_STAGE, BO_STAGE]));
        const { container } = renderBoard();
        expect(container.querySelector('[title^="빈 곳을 끌면"]')).toBeNull(); // 레일 트랙
        expect(container.querySelector('[title^="누르거나 끌어서"]')).toBeNull(); // 컷 레일
        expect(buttons(container).filter((b) => b.title === "1 늘리기")).toHaveLength(0); // 스텝퍼
    });

    it("줄은 요약 한 줄이 전부다 — 5칸 진단(새로 죽임)은 은퇴했다", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const { container } = renderBoard();
        expect(container.textContent).not.toContain("새로 죽임");
    });
});

describe("이름 클릭 — 그 종류의 편집면으로", () => {
    it("시각 조건은 **그 자리 팝오버**를 연다 — 패널 경계를 안 넘는다", () => {
        seedEditing(exprOfStages([TIME_STAGE]));
        const { container, baseElement } = renderBoard();
        openChip(container, "09:00~10:30");
        act(() => { fireEvent.click(byText(container, "09:00~10:30")!); });
        expect(baseElement.textContent).toContain("시간 구간");
    });

    // 돌파 칩 = 요약 라벨(2026-09-26 — 옛 연동 표시·격자판 모델 은퇴), 클릭 = 그 자리 팝오버(테마와 같은 문법).
    it("돌파 칩 — 요약 라벨, 클릭 = 두 층 팝오버(격자 정의·사슬 필터)", () => {
        seedEditing(exprOfStages([RATE_STAGE, BO_STAGE]));
        const { container, baseElement } = renderBoard();
        const chip = chipByText(container, "돌파 2%/0.5%")!;
        expect(chip.textContent).not.toContain("미연동");
        act(() => { fireEvent.click(chip); });
        expect(baseElement.textContent).toContain("격자 정의");
        expect(baseElement.textContent).toContain("사슬 필터");
        expect(rows(container), "아랫줄 편집면은 안 열린다 — 편집면은 팝오버 하나").toHaveLength(1);
    });

    it("팝오버의 노브가 그 줄의 술어를 직접 고친다(값의 주인 = 줄)", () => {
        seedEditing(exprOfStages([BO_STAGE]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(chipByText(container, "돌파")!); });
        const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
        const zigzag = [...dialog.querySelectorAll("input")].find((el) => (el.closest("label")?.textContent ?? "").includes("zigzag"))!;
        expect(zigzag, "zigzag 입력칸").toBeDefined();
        act(() => {
            fireEvent.change(zigzag, { target: { value: "5" } });
            fireEvent.blur(zigzag);
        });
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "breakout", zigzagPct: 5, bandPct: 0.5 });
    });

    it("팝오버 안 「＋ 조건 ▾」 판 — 항목 클릭이 팝오버를 닫지 않는다(자식 판은 부모의 바깥이 아니다 — 판 스택)", async () => {
        seedEditing(exprOfStages([BO_STAGE]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(chipByText(container, "돌파")!); });
        // ⚠ 판은 setTimeout(0) 뒤에야 무장한다(판 스택) — 안 기다리면 이 테스트는 아무것도 안 잰다.
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
        const add = [...dialog.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("＋ 조건"))!;
        act(() => { fireEvent.mouseDown(add); fireEvent.click(add); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); // 자식 판도 무장시킨 뒤 누른다
        const item = [...baseElement.querySelectorAll('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes("봉 대금"))!;
        act(() => { fireEvent.mouseDown(item); fireEvent.click(item); });
        expect(baseElement.querySelector('[role="dialog"]'), "팝오버가 살아 있다").not.toBeNull();
        const chain = (stages()[0]!.predicates[0] as { chain: { expr: { of: unknown[] } } }).chain;
        expect(chain.expr.of).toHaveLength(1);
    });

    it("편집기 안 「＋ 조건」 판에서 Esc 한 번은 그 판만 닫는다 — 편집기는 남는다(맨 위 하나)", async () => {
        seedEditing(exprOfStages([BO_STAGE]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(chipByText(container, "돌파")!); });
        const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
        act(() => { fireEvent.click([...dialog.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("＋ 조건"))!); });
        expect(baseElement.querySelector('[role="menu"]'), "「＋ 조건」 판").not.toBeNull();
        act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
        expect(baseElement.querySelector('[role="menu"]'), "자식 판만 닫힘").toBeNull();
        expect(baseElement.querySelector('[role="dialog"]'), "편집기는 남음").not.toBeNull();
        act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
        expect(baseElement.querySelector('[role="dialog"]')).toBeNull();
    });

    it("입력 중 바깥을 누르면 값이 커밋되고 닫힌다 — 판 스택이 닫기 전에 blur 한다", async () => {
        seedEditing(exprOfStages([BO_STAGE]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(chipByText(container, "돌파")!); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
        const zigzag = [...dialog.querySelectorAll("input")].find((el) => (el.closest("label")?.textContent ?? "").includes("zigzag"))!;
        act(() => { zigzag.focus(); fireEvent.change(zigzag, { target: { value: "4" } }); });
        act(() => { fireEvent.mouseDown(document.body); });
        expect(baseElement.querySelector('[role="dialog"]'), "닫힘").toBeNull();
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "breakout", zigzagPct: 4 });
    });

    it("「시간대 제외」 = NOT 시각 칩으로 태어나고, 아랫줄에서 구간을 더한다(구간끼리 OR)", async () => {
        seedEditing(exprOfStages([BO_STAGE]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(chipByText(container, "돌파")!); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
        const btn = (text: string): HTMLButtonElement => [...dialog.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(text))!;
        act(() => { fireEvent.click(btn("＋ 조건")); });
        pickItem(container, "시간대 제외"); // 「＋ 조건」 판은 편집기의 자식 판 — body 에 따로 선다
        const term = (): { neg?: boolean; cond: { kind: string; ranges: { from: string; to: string }[] } } =>
            (stages()[0]!.predicates[0] as unknown as { chain: { expr: { of: never[] } } }).chain.expr.of[0]!;
        expect(term()).toMatchObject({ neg: true, cond: { kind: "time", ranges: [{ from: "09:00", to: "09:02" }] } });
        expect(dialog.textContent).toContain("NOT시각 09:00~09:02"); // NOT 은 칩 안 별도 표식

        act(() => { fireEvent.click(btn("＋ 구간")); });
        const inputs = [...dialog.querySelectorAll<HTMLInputElement>('input[aria-label="시각"]')];
        act(() => { fireEvent.change(inputs[2]!, { target: { value: "8:00" } }); fireEvent.blur(inputs[2]!); });
        act(() => { fireEvent.change(inputs[3]!, { target: { value: "08:03" } }); fireEvent.blur(inputs[3]!); });
        expect(term().cond.ranges).toEqual([{ from: "09:00", to: "09:02" }, { from: "08:00", to: "08:03" }]);

        // 앞 칸부터 늦은 시각으로 고치는 중간(15:20~08:03)은 뒤집혀 커밋되지 않는다 — 빨갛게 남고, 뒤 칸까지 맞으면 커밋.
        act(() => { fireEvent.change(inputs[2]!, { target: { value: "15:20" } }); fireEvent.blur(inputs[2]!); });
        expect(term().cond.ranges[1]).toEqual({ from: "08:00", to: "08:03" });
        expect(inputs[2]!.getAttribute("aria-invalid")).toBe("true");
        act(() => { fireEvent.change(inputs[3]!, { target: { value: "15:30" } }); fireEvent.blur(inputs[3]!); });
        expect(term().cond.ranges[1]).toEqual({ from: "15:20", to: "15:30" });
    });

    it("돌파 칩 우클릭 판 — 연동 항목이 없다(NOT·끄기·지우기 뿐)", () => {
        seedEditing(exprOfStages([BO_STAGE]));
        const { container } = renderBoard();
        rightClick(chipByText(container, "돌파")!);
        expect(document.body.textContent).not.toContain("격자판 연동");
        expect(document.body.textContent).toContain("NOT");
    });
});

describe("＋ 조건 — 생성 입구 하나", () => {
    // ⚠ 메뉴는 **포털(document.body)** 로 뜬다 — 스크롤 컨테이너 안 absolute 로 두면 판이 패널 위로
    //   솟아 dockview 탭 스트립에 덮인다(2026-09-19 실측). 그래서 항목은 container 가 아니라
    //   baseElement 에서 찾는다.
    const openMenu = (c: HTMLElement): void => { act(() => { fireEvent.click(byText(c, "＋ 조건")!); }); };

    it("팔레트는 하루 종류뿐이다 — 날짜·계산 축·결과·그룹·격자 Point 입구가 없다(테마는 하루 술어로 합류)", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        for (const t of ["돌파 사슬", "캔들", "분봉 대금", "누적대금", "시각", "테마", "▣ 라벨 (하루)", "◆ 라벨 (타점)"]) expect(byText(baseElement, t), t).toBeDefined();
        for (const t of ["날짜", "계산 축", "결과", "그룹 (하루)", "그룹 (타점)", "테마 강도", "격자 Point", "급타점", "존순위", "양봉", "분봉고가", "전고 돌파"]) expect(byText(baseElement, t), t).toBeUndefined();
    });

    it("돌파 = 기본값 행이 서고 **곧바로 팝오버**가 뜬다(값의 편집면이 팝오버 하나라서)", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "돌파")!); });
        expect(stages()).toHaveLength(1);
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "breakout", zigzagPct: 2, bandPct: 0.5, chain: { firstK: 1 } });
        expect(baseElement.textContent).toContain("격자 정의");
    });

    it("셀 필터 = 기본값 행이 선다(분봉 대금 ≥ 30억)", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "분봉 대금")!); });
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "cellValue", field: "minuteAmountEok" });
    });

    it("캔들 = 기본값(양봉) 행이 서고 곧바로 팝오버 — 스위치·From·To 가 payload 를 만진다", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "캔들")!); });
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "candle", axes: { openClose: { on: true, from: 0.01 } } });
        // 팝오버가 곧바로 뜬다 — 축 6줄.
        expect(baseElement.textContent).toContain("캔들 조건");
        for (const t of ["등락률", "고가 등락률", "시가→고가", "시가→저가", "시가→종가", "기준선 대비"]) {
            expect(baseElement.textContent, t).toContain(t);
        }
        // 등락률 축 켜기(스위치) → From 입력(blur 커밋).
        act(() => { fireEvent.click([...baseElement.querySelectorAll("button")].find((b) => b.title === "이 축 켜기")!); });
        const axesOn = () => (stages()[0]!.predicates[0] as { kind: "candle"; axes: Record<string, { on: boolean; from?: number }> }).axes;
        expect(axesOn().rate?.on, "첫 「끔」 축 = 등락률이 켜진다").toBe(true);
        // 축 줄 순서 = CANDLE_AXES(등락률이 첫 줄) — 첫 From 칸(placeholder ↓)이 등락률의 것이다.
        const from = [...baseElement.querySelectorAll("input")].find((i) => i.placeholder === "↓")!;
        act(() => {
            fireEvent.change(from, { target: { value: "7" } });
            fireEvent.blur(from);
        });
        expect(axesOn().rate).toMatchObject({ on: true, from: 7 });
        // From 을 비우면 그쪽 경계가 걷힌다(null 커밋).
        act(() => {
            fireEvent.change(from, { target: { value: "" } });
            fireEvent.blur(from);
        });
        expect(axesOn().rate?.from, "빈 칸 = 경계 없음").toBeUndefined();
    });

    it("라벨(타점) = 빈 행이 서고 곧바로 팝오버 — 타점 그룹만 계층 트리로, 체크 = OR", () => {
        // 하루 그룹 「후발주」 · 타점 그룹 「돌파」 ▸ 「돌파: 성공」(라벨은 자식에만 — 부모는 롤업으로 타점 grain).
        const seed: Seed = {
            ...SEED,
            points: [], // 기본 시드의 자동 라벨 그룹을 빼고 이 검사의 그룹만
            groups: [
                { name: "돌파", parentName: null },
                { name: "돌파: 성공", parentName: "돌파" },
                { name: "후발주", parentName: null },
            ],
            memberships: [{ stockCode: "000100", date: "2026-07-01", groupNames: ["후발주"] }],
            pointMemberships: [{ stockCode: "000100", date: "2026-07-01", time: "09:05:00", groupNames: ["돌파: 성공"] }],
        };
        const { container, baseElement } = renderBoard(seed);
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "◆ 라벨 (타점)")!); });
        expect(stages()[0]!.predicates[0]).toEqual({ kind: "label", scope: "point", groups: [] });
        const items = [...baseElement.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')];
        expect(items.map((b) => b.textContent?.replace(/\d+$/, "")), "타점 그룹만 — 하루 그룹은 안 선다").toEqual(["돌파", "돌파: 성공"]);
        expect(items[1]!.style.paddingLeft, "자식은 들여쓴다").not.toBe(items[0]!.style.paddingLeft);
        act(() => { fireEvent.click(items[1]!); });
        expect(stages()[0]!.predicates[0]).toEqual({ kind: "label", scope: "point", groups: ["돌파: 성공"] });
    });

    it("라벨(하루) 입구는 하루 그룹만 세운다", () => {
        const seed: Seed = {
            ...SEED,
            points: [], // 기본 시드의 자동 라벨 그룹을 빼고 이 검사의 그룹만
            groups: [{ name: "돌파: 성공", parentName: null }, { name: "후발주", parentName: null }],
            memberships: [{ stockCode: "000100", date: "2026-07-01", groupNames: ["후발주"] }],
            pointMemberships: [{ stockCode: "000100", date: "2026-07-01", time: "09:05:00", groupNames: ["돌파: 성공"] }],
        };
        const { container, baseElement } = renderBoard(seed);
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "▣ 라벨 (하루)")!); });
        const items = [...baseElement.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')];
        expect(items.map((b) => b.textContent?.replace(/\d+$/, ""))).toEqual(["후발주"]);
    });

    it("캔들 핸들 드래그 — 기준이 얼어 있어 같은 자리에서 값이 안 발산하고, 커밋은 pointerup 한 번이다(H1·M4)", () => {
        const { container, baseElement } = renderBoard();
        openMenu(container);
        act(() => { fireEvent.click(byText(baseElement, "캔들")!); });
        const svg = baseElement.querySelector("svg")!;
        // 핸들 순서 = 렌더 순서: highRate, openHigh, rate, openClose, openLow, baseline.
        const openCloseHandle = baseElement.querySelectorAll("circle")[3]!;
        const axesOn = () => (stages()[0]!.predicates[0] as { kind: "candle"; axes: Record<string, { on: boolean; from?: number }> }).axes;
        act(() => { fireEvent.pointerDown(openCloseHandle, { pointerId: 1, clientY: 100 }); });
        act(() => { fireEvent.pointerMove(svg, { pointerId: 1, clientY: 50 }); });
        expect(axesOn().openClose?.from, "드래그 중엔 저장물이 안 바뀜다(draft)").toBe(0.01);
        // 같은 자리에서 포인터를 흔들어도(이벤트 반복) 값이 누적되지 않는다 — H1 회귀.
        act(() => { fireEvent.pointerMove(svg, { pointerId: 1, clientY: 50 }); });
        act(() => { fireEvent.pointerMove(svg, { pointerId: 1, clientY: 50 }); });
        act(() => { fireEvent.pointerUp(svg, { pointerId: 1 }); });
        const committed = axesOn().openClose?.from;
        expect(committed, "pointerup 에 한 번 커밋").toBe(3);
    });

});

// ⚠ 순서는 결과가 아니라 **서술**을 정한다(어느 필터가 무엇을 죽였나) — 그래서 표시 순서와 store
//   배열 인덱스의 사상이 어긋나면 숫자가 조용히 틀린다. 층위를 넘는 드롭 차단도 여기서 잰다.
describe("관리 — 켜기/끄기와 삭제는 보드가 진다", () => {
    // ⚠ 아랫줄은 **값만** 맡는다(2026-09-22) — 끄기·지우기·NOT 은 칩 우클릭 전용이다.
    it("칩 우클릭으로 끄고, 우클릭으로 지운다 — 아랫줄에는 그 손잡이가 없다", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const { container } = renderBoard();
        openChip(container, "캔들 등락률≥5%");
        expect(buttons(container).some((b) => b.title === "이 조건 지우기"), "아랫줄에 지우기가 없다").toBe(false);

        rightClick(chipByText(container, "캔들 등락률≥5%")!);
        pickItem(container, "끄기");
        expect(stages()[0]!.enabled).toBe(false);

        rightClick(chipByText(container, "캔들 등락률≥5%")!);
        pickItem(container, "지우기");
        expect(stages()).toHaveLength(0);
    });
});

// ── 연산자와 괄호 (2026-09-21) ─────────────────────────────────────────────
//
// 연산자는 **경계마다 하나**고, 판을 열어 바꾼다. 섞이는 순간 괄호가 박히므로 화면에 "읽는 규칙을
// 알아야 뜻이 정해지는 식"이 서지 않는다.
describe("연산자 — 경계마다 하나, 섞이면 괄호", () => {
    const stage2 = { id: "d2", enabled: true, predicates: [{ kind: "time" as const, ranges: [{ from: DATES[1], to: DATES[1] }] }] };
    const stage3 = { id: "d3", enabled: true, predicates: [{ kind: "time" as const, ranges: [{ from: DATES[0], to: DATES[0] }] }] };
    const stage4 = { id: "d4", enabled: true, predicates: [{ kind: "time" as const, ranges: [{ from: DATES[1], to: DATES[1] }] }] };

    it("항 사이에 연산자가 낱말로 선다 — AND 기본", () => {
        seedEditing(exprOfStages([RATE_STAGE, stage2]));
        const { container } = renderBoard();
        expect(buttons(container).filter((b) => b.dataset.op !== undefined)).toHaveLength(1);
        expect(byText(container, "AND")).toBeDefined();
    });

    it("연산자 판에서 OR 을 고르면 그 자리가 바뀐다", () => {
        seedEditing(exprOfStages([RATE_STAGE, stage2]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(buttons(container).find((b) => b.dataset.op === "0")!); });
        act(() => { fireEvent.click(byText(baseElement as HTMLElement, "OR")!); });
        expect(topOpOf(selectEditingExpr(useWorkbench.getState()))).toBe("or");
    });

    // ⚠ 본론 — 숨은 우선순위가 없다는 규칙이 화면에서도 성립하는지.
    it("섞이는 순간 **괄호가 박힌다** — `a AND b OR c`", () => {
        seedEditing(exprOfStages([RATE_STAGE, stage2, stage3]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(buttons(container).find((b) => b.dataset.op === "1")!); });
        act(() => { fireEvent.click(byText(baseElement as HTMLElement, "OR")!); });
        const e = selectEditingExpr(useWorkbench.getState());
        expect(e.groups, "앞의 AND 구간이 괄호로 묶인다").toEqual([{ from: 0, to: 1 }]);
        expect(container.textContent).toContain("(");
        expect(container.textContent).toContain(")");
    });

    // ⚠ 괄호 조작은 **경계 토글 하나**다(2026-09-22) — 만들기·넓히기·자르기·풀기가 여기 모인다.
    it("경계 우클릭 = 괄호로 묶기 — 균일한 줄에서도 칠 수 있다(NOT 을 걸 자리가 생긴다)", () => {
        seedEditing(exprOfStages([RATE_STAGE, stage2, stage3]));
        const { container } = renderBoard();
        rightClick(buttons(container).find((b) => b.dataset.op === "0")!);
        pickItem(container, "괄호 묶기");
        expect(selectEditingExpr(useWorkbench.getState()).groups).toEqual([{ from: 0, to: 1 }]);
    });

    it("이웃 경계를 또 누르면 괄호가 넓어지고, 안쪽을 누르면 거기서 잘린다", () => {
        seedEditing(exprOfStages([RATE_STAGE, stage2, stage3, stage4]));
        const { container } = renderBoard();
        rightClick(buttons(container).find((b) => b.dataset.op === "0")!);
        pickItem(container, "괄호 묶기");
        rightClick(buttons(container).find((b) => b.dataset.op === "1")!);
        pickItem(container, "괄호 묶기");
        expect(selectEditingExpr(useWorkbench.getState()).groups, "넓어진다").toEqual([{ from: 0, to: 2 }]);

        rightClick(buttons(container).find((b) => b.dataset.op === "0")!);
        pickItem(container, "괄호 자르기");
        expect(selectEditingExpr(useWorkbench.getState()).groups, "한 항짜리는 접히고 뒤만 남는다").toEqual([{ from: 1, to: 2 }]);
    });

    // ⚠ 줄 전체를 덮는 괄호는 **뜻이 없다**(줄 그 자체다) — NOT 이 붙어야 남는다.
    it("괄호가 줄 전체를 덮으면 사라진다 — 단 NOT 이 붙어 있으면 남는다", () => {
        seedEditing(exprOfStages([RATE_STAGE, stage2, stage3]));
        const { container } = renderBoard();
        rightClick(buttons(container).find((b) => b.dataset.op === "0")!);
        pickItem(container, "괄호 묶기");
        rightClick(buttons(container).find((b) => b.dataset.op === "1")!);
        pickItem(container, "괄호 묶기");
        expect(selectEditingExpr(useWorkbench.getState()).groups, "줄 그 자체라 뜻이 없다").toEqual([]);
    });

    it("괄호 우클릭 = NOT — 그리고 NOT 붙은 괄호는 **풀기가 막힌다**", () => {
        seedEditing(exprOfStages([RATE_STAGE, stage2, stage3]));
        const { container } = renderBoard();
        rightClick(buttons(container).find((b) => b.dataset.op === "0")!);
        pickItem(container, "괄호 묶기");

        rightClick(container.querySelector("[data-paren]")!);
        pickItem(container, "NOT");
        expect(selectEditingExpr(useWorkbench.getState()).groups[0]!.neg).toBe(true);

        rightClick(container.querySelector("[data-paren]")!);
        const ungroup = [...document.body.querySelectorAll('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes("괄호 풀기"))!;
        expect((ungroup as HTMLButtonElement).disabled, "NOT 이 갈 곳이 없어 막힌다").toBe(true);
    });
    it("항 부정 — 칩 우클릭으로 NOT 이 식에 실린다", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const { container } = renderBoard();
        rightClick(chipByText(container, "캔들 등락률≥5%")!);
        pickItem(container, "NOT");
        expect(selectEditingExpr(useWorkbench.getState()).of[0]!.neg).toBe(true);
    });
});

// ── 줄 쌓임 = 경로 (2026-09-21) ────────────────────────────────────────────
//
// ⚠ 빵부스러기가 없다 — 줄이 쌓이는 것 자체가 경로다. 그리고 **내려가도 윗줄은 그대로**여야 한다
//   (관측 대상은 경로의 뿌리라 하류가 안 흔들린다 — 빈 묶음 클릭이 먹통이던 자리).
describe("줄 쌓임 — 내려가면 줄이 하나 는다", () => {
    it("＋ 묶음 = 빈 집합을 만들어 참조로 붙이고 **그 안으로 내려간다**", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const outer = useWorkbench.getState().editingSetId;
        const { container } = renderBoard();

        act(() => { fireEvent.click(byText(container, "＋ 묶음")!); });
        const st = useWorkbench.getState();
        expect(st.editingSetId, "편집 대상이 새 집합으로 내려간다").not.toBe(outer);
        expect(st.editPath, "빵부스러기가 자란다").toEqual([outer, st.editingSetId]);
        expect(refsOf(st.savedSets.find((x) => x.id === outer)!.expr), "바깥에는 참조가 남는다")
            .toEqual([st.editingSetId]);
        expect(selectEditingExpr(st).of, "새 집합은 비어서 시작한다").toEqual([]);
    });

    it("내려가면 줄이 하나 늘고 **윗줄은 그대로**다", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const { container } = renderBoard();
        expect(rows(container)).toHaveLength(1);
        expect(chipByText(container, "캔들 등락률≥5%"), "뿌리의 조건이 칩으로 선다").toBeDefined();

        act(() => { fireEvent.click(byText(container, "＋ 묶음")!); });
        expect(rows(container), "줄이 하나 는다").toHaveLength(2);
        expect(chipByText(container, "캔들 등락률≥5%"), "윗줄은 그대로").toBeDefined();
    });

    it("윗줄의 칩을 누르면 그 층이 다시 편집 대상이 된다 — 빵부스러기 없이", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const outer = useWorkbench.getState().editingSetId;
        const { container } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 묶음")!); });
        expect(useWorkbench.getState().editingSetId).not.toBe(outer);

        openChip(container, "캔들 등락률≥5%"); // 윗줄의 조건 칩
        expect(useWorkbench.getState().editingSetId).toBe(outer);
        expect(useWorkbench.getState().editPath).toEqual([outer]);
    });
});

// ── 묶음 우클릭 판 — 이름·빼기·지우기 (2026-09-22) ─────────────────────────
//
// ⚠ **빼기와 지우기는 다른 일이다**: 빼기는 이 식에서만 빠지고 집합은 목록에 남는다. 지우기는 집합
//   자체가 없어져 **쓰는 곳의 참조가 깨진다**. 그래서 쓰는 곳이 있으면 한 번 무장한다.
describe("묶음 우클릭 — 이름·빼기·지우기", () => {
    /** 묶음 하나를 만들고 다시 뿌리로 올라온 상태. */
    const withGroup = (): { container: HTMLElement; outer: string; inner: string } => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const outer = useWorkbench.getState().editingSetId;
        const { container } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 묶음")!); });
        const inner = useWorkbench.getState().editingSetId;
        act(() => { fireEvent.click(chipByText(container, "빈 집합")!); }); // 다시 닫아 뿌리로
        return { container, outer, inner };
    };

    it("이름을 판 안에서 짓는다 — 비우면 자동 이름으로 되돌아간다", () => {
        const { container, inner } = withGroup();
        rightClick(chipByText(container, "빈 집합")!);
        const input = document.body.querySelector('input[aria-label="묶음 이름"]') as HTMLInputElement;
        act(() => { fireEvent.change(input, { target: { value: "아침 돌파" } }); fireEvent.keyDown(input, { key: "Enter" }); });
        expect(useWorkbench.getState().savedSets.find((x) => x.id === inner)!.name).toBe("아침 돌파");

        rightClick(chipByText(container, "아침 돌파")!);
        const again = document.body.querySelector('input[aria-label="묶음 이름"]') as HTMLInputElement;
        act(() => { fireEvent.change(again, { target: { value: "  " } }); fireEvent.keyDown(again, { key: "Enter" }); });
        expect(useWorkbench.getState().savedSets.find((x) => x.id === inner)!.name, "부재 = 자동 이름").toBeUndefined();
    });

    it("빼기는 식에서만 뺀다 — 집합은 목록에 남는다", () => {
        const { container, outer, inner } = withGroup();
        rightClick(chipByText(container, "빈 집합")!);
        pickItem(container, "빼기");
        const st = useWorkbench.getState();
        expect(refsOf(st.savedSets.find((x) => x.id === outer)!.expr), "식에서 빠졌다").toEqual([]);
        expect(st.savedSets.some((x) => x.id === inner), "집합은 남았다").toBe(true);
    });

    it("쓰는 곳이 있으면 **한 번 무장**한 뒤에야 지워진다", () => {
        const { container, inner } = withGroup();
        rightClick(chipByText(container, "빈 집합")!);
        pickItem(container, "집합 지우기");
        expect(useWorkbench.getState().savedSets.some((x) => x.id === inner), "첫 누름은 무장만").toBe(true);
        pickItem(container, "정말 지우기");
        expect(useWorkbench.getState().savedSets.some((x) => x.id === inner)).toBe(false);
    });
});

// ── ＋ 집합 판 (2026-09-25) ────────────────────────────────────────────────
//
// 버튼은 늘 눌리고 판은 늘 열린다. **절대 안 되는 것은 안 보이고**(열린 집합·경로 위 조상·종단 — Daily 전용 판),
// **상황 때문에 안 되는 것만** 회색 + 이유(나를 쓰는 집합 · 빈 집합). 이름 없는 집합은 누르면 이름 칸이 열린다.
describe("테마 조건 — 팝오버가 편집면(2026-09-26)", () => {
    it("＋ 테마 = 기본값 행이 서고 곧바로 팝오버 — 값을 쓰면 술어 payload 에 실린다", () => {
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 조건")!); });
        act(() => { fireEvent.click(byText(baseElement, "테마")!); });
        expect(stages()).toHaveLength(1);
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "theme", window: null, count: { on: true, min: 3 } });
        expect(baseElement.textContent).toContain("존 정의");
        // 재적 컷 끄기(체크) — payload 로 바로 쓰인다. 경계는 남는다.
        const off = baseElement.querySelector<HTMLInputElement>('input[aria-label="재적 켜기"]')!;
        act(() => { fireEvent.click(off); });
        expect(stages()[0]!.predicates[0]).toMatchObject({ kind: "theme", count: { on: false, min: 3 } });
    });

    it("컷 = [하한] ~ [상한] — 상한을 더하면 구간, 뒤집힌 중간 상태는 빨갛게 남고 커밋되지 않는다", () => {
        seedEditing(exprOfStages([{ id: "th", enabled: true, predicates: [{ kind: "theme", ...DEFAULT_THEME_ZONE }] }]));
        const { container, baseElement } = renderBoard();
        openChip(container, "테마");
        act(() => { fireEvent.click(byText(container, "테마")!); });
        const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
        const pred = (): Record<string, unknown> => stages()[0]!.predicates[0] as unknown as Record<string, unknown>;
        // 줄 순서: 재적 · 존 순위 · 기본 순위 — 각 줄에 하한·상한 칸.
        const lows = [...dialog.querySelectorAll<HTMLInputElement>('input[aria-label="하한"]')];
        const highs = [...dialog.querySelectorAll<HTMLInputElement>('input[aria-label="상한"]')];
        act(() => { fireEvent.change(highs[0]!, { target: { value: "5" } }); fireEvent.blur(highs[0]!); });
        expect(pred().count).toEqual({ on: true, min: 3, max: 5 });

        // 존 순위(상한 2)에 하한 3 → 뒤집힘 → 커밋 안 됨·빨강. 상한 6 까지 넣으면 3~6.
        act(() => { fireEvent.change(lows[1]!, { target: { value: "3" } }); fireEvent.blur(lows[1]!); });
        expect(pred().zoneRank).toEqual({ on: false, max: 2 });
        expect(lows[1]!.getAttribute("aria-invalid")).toBe("true");
        act(() => { fireEvent.change(highs[1]!, { target: { value: "6" } }); fireEvent.blur(highs[1]!); });
        expect(pred().zoneRank).toEqual({ on: false, min: 3, max: 6 });
        // 재적은 이제 옳은 부호로 적힌다(옛 화면은 ≤ 로 적었다).
        expect(container.textContent).toContain("재적 3~5");
    });

    it("테마 줄 이름 클릭 = 같은 팝오버 · 자 값 가져오기는 자 저장값이 없으면 회색", () => {
        seedEditing(exprOfStages([{ id: "th", enabled: true, predicates: [{ kind: "theme", ...DEFAULT_THEME_ZONE }] }]));
        const { container, baseElement } = renderBoard();
        openChip(container, "테마");
        act(() => { fireEvent.click(byText(container, "테마")!); });
        expect(baseElement.textContent).toContain("대금 창");
        const pull = [...baseElement.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").includes("자 값"))!;
        expect(pull.disabled).toBe(true);
    });
});

describe("사슬 필터 테마 칩 — 조건판 테마 팝오버를 자식 판으로(2026-09-30)", () => {
    const term = (): { firstK?: number; cond: Record<string, unknown> } =>
        (stages()[0]!.predicates[0] as unknown as { chain: { expr: { of: never[] } } }).chain.expr.of[0]!;

    it("＋ 조건 → 테마 = 기본 테마 칩으로 태어나고 테마 팝오버(존 정의·컷·발화 + 칩 순번)가 겹쳐 뜬다 · Esc 는 맨 위 하나만", async () => {
        seedEditing(exprOfStages([BO_STAGE]));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(chipByText(container, "돌파")!); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const dialog = baseElement.querySelector('[role="dialog"]') as HTMLElement;
        act(() => { fireEvent.click([...dialog.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("＋ 조건"))!); });
        pickItem(container, "테마");
        expect(term().cond).toMatchObject({ kind: "theme", zoneAmountN: DEFAULT_THEME_ZONE.zoneAmountN, count: { on: true, min: 3 } });
        const dialogs = (): HTMLElement[] => [...baseElement.querySelectorAll<HTMLElement>('[role="dialog"]')];
        expect(dialogs(), "돌파 팝오버 + 테마 팝오버").toHaveLength(2);
        const themeDlg = dialogs()[1]!;
        expect(themeDlg.textContent).toContain("존 정의");
        expect(themeDlg.textContent).toContain("칩 순번");
        expect(dialog.textContent).toContain("테마 재적≥3"); // 칩 본문 = 컷만

        // 칩 순번 「처음 1」 — RankPick 의 첫 K 칸
        const rank = [...themeDlg.querySelectorAll("button")].find((b) => b.textContent === "처음")!;
        act(() => { fireEvent.click(rank); });
        expect(term().firstK, "칩 순번 = 처음 1").toBe(1);
        expect(dialog.textContent).toContain("처음 1");

        act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
        expect(dialogs(), "테마 판만 닫힘").toHaveLength(1);
    });

    it("열린 테마 칩을 다시 누르면 닫힌다(칩은 판의 「안」 — mousedown 이 먼저 닫고 click 이 다시 여는 일이 없다)", async () => {
        const chain = { expr: { id: "chain", of: [{ kind: "check", id: "th", cond: { kind: "theme", ...DEFAULT_THEME_ZONE } }], ops: [], groups: [] }, firstK: 1 };
        seedEditing(exprOfStages([{ ...BO_STAGE, predicates: [{ ...BO_STAGE.predicates[0]!, chain }] }] as never));
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(chipByText(container, "돌파")!); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const chip = baseElement.querySelector<HTMLElement>('[role="dialog"] [data-chip="th"]')!;
        act(() => { fireEvent.mouseDown(chip); fireEvent.click(chip); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        expect(baseElement.querySelectorAll('[role="dialog"]'), "열림").toHaveLength(2);
        act(() => { fireEvent.mouseDown(chip); fireEvent.click(chip); });
        expect(baseElement.querySelectorAll('[role="dialog"]'), "다시 누르면 닫힘").toHaveLength(1);
    });
});

describe("＋ 집합 — 세 칸 판", () => {
    const leaf = { kind: "cond" as const, stage: RATE_STAGE };
    const set = (id: string, expr = exprOfStages([RATE_STAGE]), name: string | undefined = id) =>
        ({ id, expr, universe: "daily" as const, ...(name !== undefined ? { name } : {}) });
    const ref = (setId: string) => ({ kind: "ref" as const, id: `r-${setId}`, setId });

    it("setPickerOf — 자기는 안 보이고, 나를 쓰는 집합·빈 집합만 회색", () => {
        const edit = { id: "edit", expr: { id: "root", of: [ref("a")], ops: [], groups: [] }, universe: "daily" as const };
        const sets = [
            edit,
            set("a"),
            set("b"),
            set("cyc", { id: "root", of: [ref("edit")], ops: [], groups: [] }),
            set("empty", exprOfStages([])),
        ];
        const r = setPickerOf(sets, "edit", edit.expr);
        expect(r.attached.map((x) => x.id)).toEqual(["a"]);
        expect(r.attachable.map((x) => x.id)).toEqual(["b"]);
        expect(r.blocked.map((x) => [x.set.id, x.why])).toEqual([["cyc", "usesMe"], ["empty", "empty"]]);
        // 꺼진 조건뿐인 집합도 비어 있다(평가에선 부재).
        const off = set("off", exprOfStages([{ ...RATE_STAGE, enabled: false }]));
        expect(setPickerOf([edit, off], "edit", edit.expr).blocked).toEqual([{ set: off, why: "empty" }]);
    });

    it("setPickerOf — 올라와 있음은 식 순서 · 지워진 참조는 broken · 드릴인 중 경로 위 조상은 안 보인다", () => {
        const expr = { id: "root", of: [ref("b"), ref("gone"), ref("a")], ops: ["and" as const, "and" as const], groups: [] };
        const r = setPickerOf([set("a"), set("b"), { id: "edit", expr, universe: "daily" as const }], "edit", expr);
        expect(r.attached.map((x) => x.id)).toEqual(["b", "a"]);
        expect(r.broken).toEqual(["gone"]);
        // 드릴인: 편집 = inner, 경로 = [outer, inner] — outer 는 무조건 불가라 **어느 칸에도 없다**.
        const inner = { id: "inner", expr: exprOfStages([]), universe: "daily" as const };
        const outer = set("outer", { id: "root", of: [leaf, ref("inner")], ops: ["and" as const], groups: [] });
        const drilled = setPickerOf([outer, inner], "inner", inner.expr, ["outer", "inner"]);
        expect([...drilled.attached, ...drilled.attachable, ...drilled.blocked.map((x) => x.set)]).toEqual([]);
        // 경로 밖에서 나를 품은 집합은 회색 「이 집합을 쓰고 있음」.
        expect(setPickerOf([outer, inner], "inner", inner.expr, ["inner"]).blocked).toEqual([{ set: outer, why: "usesMe" }]);
    });

    it("버튼 순서 = ＋ 조건 · ＋ 묶음 · ＋ 집합", () => {
        const { container } = renderBoard();
        const labels = buttons(container).map((b) => (b.textContent ?? "").trim()).filter((t) => t.startsWith("＋"));
        expect(labels.map((t) => t.split(" ")[1])).toEqual(["조건", "묶음", "집합"]);
    });

    it("붙일 집합이 없어도 판이 열리고 이유를 말한다", () => {
        seedEditing(exprOfStages([RATE_STAGE])); // 편집 집합 자신만 있다 — 자기는 고를 거리가 아니다
        const { container, baseElement } = renderBoard();
        const btn = byText(container, "＋ 집합")!;
        expect(btn.disabled).toBe(false);
        act(() => { fireEvent.click(btn); });
        expect(baseElement.textContent).toContain("저장된 다른 집합이 없습니다");
    });

    it("빈 집합은 회색 + 「비어 있음」", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        act(() => { useWorkbench.setState((s) => ({ savedSets: [...s.savedSets,
            { id: "emp", name: "빈 것", expr: exprOfStages([]), universe: "daily" }] })); });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 집합")!); });
        const item = [...baseElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes("빈 것"))!;
        expect(item.disabled).toBe(true);
        expect(item.textContent).toContain("비어 있음");
    });

    it("이름 없는 집합 — 누르면 이름 칸, 이름을 넣고 Enter = 이름 짓고 붙인다 · 충돌 이름은 안 붙인다", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const outer = useWorkbench.getState().editingSetId;
        act(() => { useWorkbench.setState((s) => ({ savedSets: [...s.savedSets,
            { id: "anon", expr: exprOfStages([RATE_STAGE]), universe: "daily" },
            { id: "named", name: "아침 돌파", expr: exprOfStages([RATE_STAGE]), universe: "daily" }] })); });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 집합")!); });
        const anon = [...baseElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes("이름 없음"))!;
        act(() => { fireEvent.click(anon); });
        const input = baseElement.querySelector<HTMLInputElement>('input[aria-label="붙일 집합 이름"]')!;
        expect(refsOf(useWorkbench.getState().savedSets.find((x) => x.id === outer)!.expr), "누르기만으론 안 붙는다").toEqual([]);
        act(() => { fireEvent.change(input, { target: { value: "아침 돌파" } }); });
        expect(baseElement.textContent).toContain("같은 이름의 집합이 있습니다");
        act(() => { fireEvent.keyDown(input, { key: "Enter" }); });
        expect(refsOf(useWorkbench.getState().savedSets.find((x) => x.id === outer)!.expr), "충돌이면 안 붙는다").toEqual([]);
        act(() => { fireEvent.change(input, { target: { value: "거래대금" } }); });
        act(() => { fireEvent.keyDown(input, { key: "Enter" }); });
        const st = useWorkbench.getState();
        expect(st.savedSets.find((x) => x.id === "anon")!.name).toBe("거래대금");
        expect(refsOf(st.savedSets.find((x) => x.id === outer)!.expr)).toEqual(["anon"]);
    });

    it("이름 없는 집합 — Esc 는 이름 칸만 걷는다(판은 열린 채, 포커스는 그 줄로)", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        act(() => { useWorkbench.setState((s) => ({ savedSets: [...s.savedSets, { id: "anon", expr: exprOfStages([RATE_STAGE]), universe: "daily" }] })); });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 집합")!); });
        const anonBtn = (): HTMLButtonElement | undefined => [...baseElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes("이름 없음"));
        act(() => { fireEvent.click(anonBtn()!); });
        act(() => { fireEvent.keyDown(baseElement.querySelector('input[aria-label="붙일 집합 이름"]')!, { key: "Escape" }); });
        expect(baseElement.querySelector('input[aria-label="붙일 집합 이름"]')).toBeNull();
        expect(anonBtn(), "판은 열린 채 줄이 돌아온다").toBeDefined();
        expect(document.activeElement).toBe(anonBtn());
    });

    it("이름 있는 집합은 누르면 바로 붙는다", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const outer = useWorkbench.getState().editingSetId;
        act(() => { useWorkbench.setState((s) => ({ savedSets: [...s.savedSets, { id: "named", name: "아침 돌파", expr: exprOfStages([RATE_STAGE]), universe: "daily" }] })); });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 집합")!); });
        act(() => { fireEvent.click([...baseElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes("아침 돌파"))!); });
        expect(refsOf(useWorkbench.getState().savedSets.find((x) => x.id === outer)!.expr)).toEqual(["named"]);
    });

    it("이름 없는 집합 — 비우고 Enter 면 이름 없이 그대로 붙는다(강제 아님)", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const outer = useWorkbench.getState().editingSetId;
        act(() => { useWorkbench.setState((s) => ({ savedSets: [...s.savedSets, { id: "anon", expr: exprOfStages([RATE_STAGE]), universe: "daily" }] })); });
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 집합")!); });
        act(() => { fireEvent.click([...baseElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => (b.textContent ?? "").includes("이름 없음"))!); });
        act(() => { fireEvent.keyDown(baseElement.querySelector('input[aria-label="붙일 집합 이름"]')!, { key: "Enter" }); });
        const st = useWorkbench.getState();
        expect(st.savedSets.find((x) => x.id === "anon")!.name).toBeUndefined();
        expect(refsOf(st.savedSets.find((x) => x.id === outer)!.expr)).toEqual(["anon"]);
    });

    it("올라와 있는 집합(✓)을 누르면 그 묶음으로 내려간다 — 붙이기가 두 번 되지 않는다", () => {
        seedEditing(exprOfStages([RATE_STAGE]));
        const outer = useWorkbench.getState().editingSetId;
        const { container, baseElement } = renderBoard();
        act(() => { fireEvent.click(byText(container, "＋ 묶음")!); });
        const inner = useWorkbench.getState().editingSetId;
        openChip(container, "캔들 등락률≥5%"); // 뿌리로 올라온다
        expect(useWorkbench.getState().editingSetId).toBe(outer);

        act(() => { fireEvent.click(byText(container, "＋ 집합")!); });
        expect(baseElement.textContent).toContain("이 식에 올라와 있음");
        const item = [...baseElement.querySelectorAll('[role="menuitem"]')].find((b) => (b.textContent ?? "").startsWith("✓"))!;
        act(() => { fireEvent.click(item); });
        const st = useWorkbench.getState();
        expect(st.editingSetId).toBe(inner);
        expect(refsOf(st.savedSets.find((x) => x.id === outer)!.expr)).toEqual([inner]);
    });
});
