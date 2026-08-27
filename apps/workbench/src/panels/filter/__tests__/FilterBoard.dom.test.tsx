// 필터 보드 — 조건을 거는 판. **레일 하나 = 필터 하나**가 이 화면의 규칙 전부다.
//
// 1:1 규칙(어떤 레일이 어떤 필터가 되나)은 stageBinding 이 지고 이미 덮여 있고, 레일 안의 손짓은
// Rail 테스트가 덮는다. 여기서 재는 건 그 둘을 잇는 **판 전체의 배치와 배선**이다:
// 무엇이 어느 층위 칸에 서나 · 그은 선이 정말 store 의 필터가 되나 · 사전이 오기 전엔 뭘 보여주나.
//
// ⚠ 로딩 가드가 특히 중요하다. 빈 레일을 그리면 화면이 **"축이 없다" · "날짜가 없다"고 말하는데
//   그건 사실이 아니다.** 그리고 그 빈 레일은 그을 수 있게 생겨서, 사용자가 아직 안 온 척도 위에
//   조건을 긋게 된다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { Providers, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { selectFilterStages, useWorkbench } from "../../../store/workbench.js";
import { RAIL_PAD } from "../rail/Rail.js";
import { FilterBoard } from "../FilterBoard.js";

const A = "005930", B = "000660";
const DATES = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"];

const candidateDays: Seed["candidateDays"] = DATES.map((date, i) => ({ stockCode: i % 2 ? A : B, date }));
const points: SeedPoint[] = [
    { stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" },
    { stockCode: B, date: DATES[1], time: "10:00:00", name: "SK하이닉스" },
    { stockCode: A, date: DATES[2], time: "09:40:00" },
    { stockCode: B, date: DATES[3], time: "10:20:00" },
];

/**
 * 계산 축 두 개 — 층위가 갈린다(하루 축 · 타점 축).
 * ⚠ 레일의 자리는 축 정의가 아니라 **값 피드**에서 온다(값 있는 타점이 자리를 만든다).
 * 이걸 안 심으면 축이 있어도 레일이 "값 없음"으로 뜬다 — "값 없는 축은 이유를 적는다" 검사가
 * **모든 축이 비어 있는 상태로** 통과하지 않게, 값을 심는 시드와 안 심는 시드를 가른다.
 */
const feedOf = (key: string, name: string, grain: "day" | "point", n: number): ComputedAxisFeed => ({
    key,
    name,
    strongerWhen: "higher",
    grain,
    // 행 = grain 의 정체성: day 축 행은 차트(시각 없음), point 축 행은 타점 — 실서버 피드와 같은 모양.
    values: points.slice(0, n).map((pt, i) =>
        grain === "day"
            ? { stockCode: pt.stockCode, date: pt.date, value: i + 1 }
            : { stockCode: pt.stockCode, date: pt.date, time: pt.time, value: i + 1 }),
});
/**
 * ⚠ 자리를 넷 둔다(둘이 아니라). 자리가 둘이면 트랙을 끝에서 끝까지 그을 수밖에 없는데, 양끝에
 * 닿은 경계는 "무제한"이라 **조건이 통째로 비어** 필터가 안 선다(railBound 의 반열림 규칙).
 * 그것도 옳은 동작이지만, 배선을 재려는 검사가 그 규칙에 막혀 0건으로 통과하면 안 된다.
 */
/**
 * ⚠ 자리를 넷 둔다(둘이 아니라). 자리가 둘이면 트랙을 끝에서 끝까지 그을 수밖에 없는데, 양끝에
 * 닿은 경계는 무제한(반열림)으로 접혀 "축 id 까지 매인다" 검사가 경계 없는 필터를 상대로 헛돈다.
 */
const feeds: ComputedAxisFeed[] = [
    feedOf("day-ax", "하루축", "day", 4),
    feedOf("pt-ax", "타점축", "point", 4),
];

const SEED: Seed = { candidateDays, points, computedAxes: feeds };

const renderBoard = (seed: Seed = SEED, onlyActive = false): ReturnType<typeof render> =>
    render(<FilterBoard reveal={null} onlyActive={onlyActive} />, {
        wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(seed)}>{children}</Providers>,
    });

const WIDTH = 1000;
const xAt = (frac: number): number => RAIL_PAD + frac * (WIDTH - 2 * RAIL_PAD);
/**
 * 이름으로 그 레일의 트랙을 찾는다 — 이름 열과 트랙은 **그 줄 안에서 형제**다(Rail 의 구조).
 * ⚠ 조상을 타고 끝까지 올라가면 안 된다: 못 찾으면 옆 줄(날짜 레일)의 트랙을 집어 와서,
 *   "이 레일은 못 긋는다"를 재려던 검사가 엉뚱한 레일을 긋고 통과한다(한 번 밟았다).
 */
/**
 * 레일의 이름 칸(제목 div) — 축 이름이 그대로 title 이다. 순서 잡이가 달린 레일은 뒤에 안내가 붙으므로
 * 접두로 찾는다(`하루축 — 끌어서 순서 바꾸기`). 트랙·마커·잡이를 찾는 세 helper 가 이 한 자리를 공유한다.
 */
const nameOf = (c: HTMLElement, label: string): HTMLElement => {
    const name = [...c.querySelectorAll("div")].find((d) => d.title === label || d.title.startsWith(`${label} —`));
    if (!name) throw new Error(`레일 '${label}' 의 이름 열이 없다`);
    return name;
};
const trackOf = (c: HTMLElement, label: string): HTMLElement => {
    const row = nameOf(c, label).parentElement!.parentElement!;
    const track = row.querySelector('[title^="빈 곳을 끌면"]');
    if (!track) throw new Error(`레일 '${label}' 에 그을 수 있는 트랙이 없다(disabledNote 상태)`);
    return track as HTMLElement;
};
const drag = (el: HTMLElement, from: number, to: number): void => {
    fireEvent.pointerDown(el, { button: 0, clientX: xAt(from), pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: xAt(to), pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
};
const stages = (): ReturnType<typeof selectFilterStages> => selectFilterStages(useWorkbench.getState());

const RESET = { filterStages: [], funnelSelection: null, selectedSetRef: null, savedSets: [] };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

// ⚠ 이 블록이 이 파일의 존재 이유 중 하나다.
describe("사전이 오기 전 — 빈 레일을 그리지 않는다", () => {
    it("불러오는 중이라고 말한다 — 빈 레일은 '축이 없다'는 거짓말이다", () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
        // 캐시를 안 심고 fetch 를 영원히 pending 으로 — 네트워크 그물의 명시적 탈출구.
        const original = window.fetch;
        window.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
        try {
            const { container } = render(<FilterBoard reveal={null} onlyActive={false} />, {
                wrapper: ({ children }: { children: ReactNode }) => <Providers client={client}>{children}</Providers>,
            });
            expect(container.textContent).toContain("불러오는 중");
            expect(container.querySelector('[title^="빈 곳을 끌면"]')).toBeNull(); // 그을 수 있는 트랙이 없다
        } finally {
            window.fetch = original;
        }
    });
});

describe("층위 칸 — 무엇이 어디에 사나", () => {
    it("두 칸이 다 선다", () => {
        const { container } = renderBoard();
        expect(container.textContent).toContain("하루");
        expect(container.textContent).toContain("타점");
    });

    it("하루 칸엔 하루 축과 **날짜**, 타점 칸엔 타점 축과 **시간**", () => {
        const { container } = renderBoard();
        expect(container.textContent).toContain("하루축");
        expect(container.textContent).toContain("타점축");
        expect(container.textContent).toContain("날짜");
        expect(container.textContent).toContain("시간");
    });

    it("그 층위에 축이 없으면 그렇게 적는다 — 빈 자리로 두면 왜 없는지 모른다", () => {
        const { container } = renderBoard({ ...SEED, computedAxes: [feeds[0]] });
        expect(container.textContent).toContain("이 층위에 축이 없습니다");
    });

    // ⚠ 자리는 축 정의가 아니라 **값 피드**에서 온다 — 축만 있고 값이 없으면 그을 수 없다.
    it("값이 없는 축은 트랙 대신 이유를 적는다 — 빈 트랙을 주면 그을 수 있는 줄 안다", () => {
        const { container } = renderBoard({ ...SEED, computedAxes: feeds.map((f) => ({ ...f, values: [] })) });
        expect(container.textContent).toContain("값 없음");
        expect(() => trackOf(container, "하루축")).toThrow();
    });

    it("값이 있으면 그을 수 있다 — 위 검사가 '늘 값 없음'을 상대로 헛돌지 않게", () => {
        const { container } = renderBoard();
        expect(container.textContent).not.toContain("값 없음");
        expect(trackOf(container, "하루축")).toBeTruthy();
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유 둘째다 — 판 전체의 배선.
describe("레일 하나 = 필터 하나 — 그은 선이 store 의 필터가 된다", () => {
    it("날짜 레일을 그으면 날짜 필터가 선다", () => {
        const { container } = renderBoard();
        expect(stages()).toHaveLength(0);

        drag(trackOf(container, "날짜"), 0.1, 0.9);

        expect(stages()).toHaveLength(1);
        const p = stages()[0].predicates[0];
        expect(p.kind).toBe("date");
        expect(p.kind === "date" && p.ranges[0].from).toBe(DATES[0]);
        expect(p.kind === "date" && p.ranges[0].to).toBe(DATES[DATES.length - 1]);
    });

    it("경계는 **실재하는 거래일**에 선다 — 중간을 끌어도 없는 날짜가 안 생긴다", () => {
        const { container } = renderBoard();
        drag(trackOf(container, "날짜"), 0.2, 0.7);
        const p = stages()[0].predicates[0];
        expect(p.kind === "date" && DATES).toContain(p.kind === "date" ? p.ranges[0].from : "");
        expect(p.kind === "date" && DATES).toContain(p.kind === "date" ? p.ranges[0].to : "");
    });

    it("축 레일을 그으면 그 축의 필터가 선다 — 축 id 까지 매인다", () => {
        const { container } = renderBoard();
        drag(trackOf(container, "하루축"), 0.35, 0.7); // 양끝을 안 건드린다(끝에 닿으면 무제한)
        expect(stages()).toHaveLength(1);
        const p = stages()[0].predicates[0];
        expect(p.kind).toBe("axisValue");
        expect(p.kind === "axisValue" && p.axisId).toBe("c:day-ax");
    });

    it("레일이 다르면 필터도 다르다 — 한 필터에 여러 축을 묶지 않는다(기여도가 뭉개진다)", () => {
        const { container } = renderBoard();
        drag(trackOf(container, "날짜"), 0.1, 0.9);
        drag(trackOf(container, "하루축"), 0.35, 0.7); // 양끝을 안 건드린다(끝에 닿으면 무제한)
        expect(stages()).toHaveLength(2);
    });

    it("같은 레일을 다시 그으면 **덮는다** — 한 축이 두 필터에 나타나면 뭘 그릴지 답이 없다", () => {
        const { container } = renderBoard();
        drag(trackOf(container, "날짜"), 0.1, 0.5);
        drag(trackOf(container, "날짜"), 0.5, 0.9);
        expect(stages()).toHaveLength(1);
    });

    it("구간을 지우면 필터가 통째로 사라진다 — '추가' 버튼이 없는 이유의 반대쪽", () => {
        const { container } = renderBoard();
        drag(trackOf(container, "날짜"), 0.1, 0.9);
        expect(stages()).toHaveLength(1);

        const close = [...container.querySelectorAll("button")].find((b) => b.title === "이 구간 삭제")!;
        fireEvent.click(close);
        expect(stages()).toHaveLength(0);
    });
});

describe("걸린 것만 보기", () => {
    it("꺼져 있으면 전부 보인다 — 분포를 보면서 자르는 게 이 화면의 목적이다", () => {
        const { container } = renderBoard(SEED, false);
        expect(container.textContent).toContain("하루축");
        expect(container.textContent).toContain("날짜");
    });

    it("켜면 조건이 걸린 줄만 남는다", () => {
        const { container, rerender } = renderBoard(SEED, false);
        drag(trackOf(container, "날짜"), 0.1, 0.9);

        rerender(<FilterBoard reveal={null} onlyActive />);
        expect(container.textContent).toContain("날짜");
        expect(container.textContent).not.toContain("하루축"); // 안 걸린 축은 접힌다
    });
});

describe("그룹 — 유일하게 리스트인 조건", () => {
    it("층위마다 추가 손잡이가 선다 — 순서가 없어 레일이 못 된다", () => {
        const { container } = renderBoard();
        const adders = [...container.querySelectorAll("button")].filter((b) => b.textContent === "+ 그룹 조건");
        expect(adders).toHaveLength(2); // 하루·타점
    });
});

// ── 선택 집합 오버레이 — 같은 점, 두 상태 ──────────────────────────────────
// 오버레이 재료: 유니버스 두 차트(A@D0·B@D1), 각각 타점 하나. 타점축 값 피드가 두 타점을 자리로 갖는다.
// 날짜 필터로 A@D0 만 남기면 축 레일의 자리 둘 중 **하나만** 멤버가 되어야 한다.
const OVL_CAND: Seed["candidateDays"] = [
    { stockCode: A, date: DATES[0] },
    { stockCode: B, date: DATES[1] },
];
const OVL_POINTS: SeedPoint[] = [
    { stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" },
    { stockCode: B, date: DATES[1], time: "10:00:00", name: "SK하이닉스" },
];
const OVL_FEED: ComputedAxisFeed = {
    key: "pt-ax",
    name: "타점축",
    strongerWhen: "higher",
    grain: "point",
    values: [
        { stockCode: A, date: DATES[0], time: "09:30:00", value: 1 },
        { stockCode: B, date: DATES[1], time: "10:00:00", value: 2 },
    ],
};
const OVL_SEED: Seed = { candidateDays: OVL_CAND, points: OVL_POINTS, computedAxes: [OVL_FEED] };

const memberSpans = (c: HTMLElement): HTMLElement[] =>
    [...c.querySelectorAll("span")].filter((s) => s.style.width === "2px" && s.style.borderRadius === "1px") as HTMLElement[];
const baseTicks = (c: HTMLElement): HTMLElement[] =>
    [...c.querySelectorAll("span")].filter((s) => s.style.width === "1px" && s.style.height === "9px") as HTMLElement[];

describe("선택 집합 오버레이 — 멤버는 강조색, 나머지 회색은 물러난다", () => {
    it("아무것도 안 걸렸으면 오버레이가 없다 — 전부 멤버인 그림은 아무 말도 아니다", () => {
        const { container } = renderBoard(OVL_SEED);
        expect(memberSpans(container)).toHaveLength(0);
        expect(baseTicks(container).every((t) => t.style.opacity === "0.35")).toBe(true);
    });

    it("필터가 걸리면 생존 멤버의 자리만 강조되고, 배경 회색은 더 죽는다(전경/배경 분리)", () => {
        useWorkbench.setState({
            filterStages: [{ id: "d1", enabled: true, predicates: [{ kind: "date", ranges: [{ from: DATES[0], to: DATES[0] }] }] }],
        });
        const { container } = renderBoard(OVL_SEED);
        expect(memberSpans(container)).toHaveLength(1); // 자리 둘 중 A@D0 하나만
        expect(baseTicks(container).some((t) => t.style.opacity === "0.12")).toBe(true);
    });

    it("선택 포인터가 전체(유니버스)면 오버레이가 접힌다 — 전경=배경(properSubset 규칙)", () => {
        useWorkbench.setState({ selectedSetRef: { kind: "universe" } });
        const { container } = renderBoard(OVL_SEED);
        expect(memberSpans(container)).toHaveLength(0);
    });
});

// ⚠ 마커는 **subject 계약**을 따른다(useSubject) — 타점을 골랐으면 타점, 하루만 골랐으면 그 하루.
// 옛날엔 activePoint 만 봐서 하루 선택이면 마커가 통째로 사라졌다: goToDay 가 activePoint 를 명시적으로
// 푸는 게 계약이라, 날짜도 일봉 축 값도 멀쩡히 있는데 "지금 어디쯤인가"가 안 보였다.
const markerOf = (c: HTMLElement, label: string): string | null =>
    nameOf(c, label).parentElement!.parentElement!.querySelector("[data-marker]")?.getAttribute("data-marker") ?? null;

describe("현재 자리 마커 — 하루만 골라도 하루 층위엔 선다", () => {
    const DAY = { date: DATES[0], code: A, time: null };
    afterEach(() => { useWorkbench.setState({ activePoint: null, focus: { date: DATES[0], code: "", time: null } }); });

    it("하루 선택(타점 없음)이면 하루 축과 날짜에 마커가 선다 — 차트 키로 값 맵에 닿는다", () => {
        useWorkbench.setState({ activePoint: null, focus: DAY });
        const { container } = renderBoard();
        expect(markerOf(container, "하루축")).toBe("+1.0%"); // A@D0 = 첫 행
        expect(markerOf(container, "날짜")).toBe("26.07.06");
    });

    it("하루 선택은 타점 축엔 안 선다 — 분기가 아니라 키 공간이 갈려서다(차트 키가 그 맵엔 없다)", () => {
        useWorkbench.setState({ activePoint: null, focus: DAY });
        const { container } = renderBoard();
        expect(markerOf(container, "타점축")).toBeNull();
        expect(markerOf(container, "시간")).toBeNull();
    });

    it("타점 선택이면 두 층위 다 선다 — 타점 키는 시각을 벗겨 하루 축에도 닿는다(회귀 방지)", () => {
        useWorkbench.setState({ activePoint: { code: A, date: DATES[0], time: "09:30:00" }, focus: { ...DAY, time: "09:30:00" } });
        const { container } = renderBoard();
        expect(markerOf(container, "하루축")).toBe("+1.0%");
        expect(markerOf(container, "타점축")).toBe("+1.0%");
        expect(markerOf(container, "시간")).toBe("09:30");
    });

    it("종목이 없으면(초기 상태) 아무 데도 안 선다 — 날짜만으로는 고른 자리가 아니다", () => {
        useWorkbench.setState({ activePoint: null, focus: { date: DATES[0], code: "", time: null } });
        const { container } = renderBoard();
        expect(markerOf(container, "하루축")).toBeNull();
        expect(markerOf(container, "날짜")).toBeNull();
    });
});

// ── 레일 순서 바꾸기 — 잡이는 **이름 열**이다(트랙은 조건 긋기라 못 쓴다).
// 저장물은 이 보드 전용(wb.filterAxisOrder) — 시트 축 서열(store rankAxisOrder)과 갈라져 있다(사용자 확정).
const ORDER_KEY = "wb.filterAxisOrder";
const ORDER_SEED: Seed = {
    candidateDays, points,
    computedAxes: [feedOf("day-a", "하루축A", "day", 4), feedOf("day-b", "하루축B", "day", 4), feedOf("pt-ax", "타점축", "point", 4)],
};
/** 그려진 레일 이름들(축만) — 순서가 정말 화면에 반영됐는지 재는 건 store 가 아니라 이 목록이다. */
const railNames = (c: HTMLElement): string[] =>
    [...c.querySelectorAll("div")].map((d) => d.title.split(" — ")[0]).filter((t) => t.startsWith("하루축") || t === "타점축");
/** dataTransfer 는 jsdom 에 없다 — 우리가 실제로 쓰는 세 가지(setData·types·effectAllowed)만 흉내낸다. */
const fakeDt = (): DataTransfer => {
    const store = new Map<string, string>();
    return {
        setData: (t: string, v: string) => { store.set(t, v); },
        getData: (t: string) => store.get(t) ?? "",
        get types() { return [...store.keys()]; },
        effectAllowed: "none",
    } as unknown as DataTransfer;
};
const dragAxisOnto = (c: HTMLElement, from: string, to: string): void => {
    const handle = nameOf(c, from).parentElement!;
    const targetRow = nameOf(c, to).parentElement!.parentElement!.parentElement!;
    const dataTransfer = fakeDt();
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(targetRow, { dataTransfer });
    fireEvent.drop(targetRow, { dataTransfer });
};

describe("레일 순서 — 이름 열을 끌어 바꾸고, 로컬에 남는다", () => {
    it("같은 층위 안에서 자리가 바뀐다", () => {
        const { container } = renderBoard(ORDER_SEED);
        expect(railNames(container)).toEqual(["하루축A", "하루축B", "타점축"]);

        dragAxisOnto(container, "하루축A", "하루축B");

        expect(railNames(container)).toEqual(["하루축B", "하루축A", "타점축"]);
    });

    it("바꾼 순서가 로컬에 남는다 — 다시 열어도 그대로", () => {
        const { container, unmount } = renderBoard(ORDER_SEED);
        dragAxisOnto(container, "하루축A", "하루축B");
        expect(JSON.parse(localStorage.getItem(ORDER_KEY)!)).toEqual(["c:day-b", "c:day-a", "c:pt-ax"]);
        unmount();

        const again = renderBoard(ORDER_SEED);
        expect(railNames(again.container)).toEqual(["하루축B", "하루축A", "타점축"]);
    });

    // ⚠ 층위는 축 정의(scope)가 정한다 — 드래그가 바꿀 값이 아니다.
    it("층위는 못 넘는다 — 하루 축을 타점 축에 떨어뜨려도 아무 일도 없다", () => {
        const { container } = renderBoard(ORDER_SEED);
        dragAxisOnto(container, "하루축A", "타점축");
        expect(railNames(container)).toEqual(["하루축A", "하루축B", "타점축"]);
    });

    it("시트 축 서열은 안 건드린다 — 두 순서는 별개 저장물이다", () => {
        const { container } = renderBoard(ORDER_SEED);
        dragAxisOnto(container, "하루축A", "하루축B");
        expect(useWorkbench.getState().rankAxisOrder).toEqual([]);
    });

    it("날짜·시간 레일엔 잡이가 없다 — 층위 안에서 자리가 정해진 줄이다", () => {
        const { container } = renderBoard(ORDER_SEED);
        expect(nameOf(container, "날짜").parentElement!.draggable).toBe(false);
        expect(nameOf(container, "하루축A").parentElement!.draggable).toBe(true);
    });
});

// ── 서랍 — 축을 치워 두는 자리. **보기 상태일 뿐 조건을 안 건드린다**(이 블록의 핵심 수용 기준) ──
const DRAWER_KEY = "wb.filterDrawerAxes";
/** 이름 열 안의 서랍 손잡이(넣기/꺼내기) — 값 입력 버튼과 같은 자리에 산다. */
const stowOf = (c: HTMLElement, label: string): HTMLElement => {
    const btn = nameOf(c, label).parentElement!.querySelector<HTMLElement>('button[title^="이 축을 서랍"]');
    if (!btn) throw new Error(`레일 '${label}' 에 서랍 손잡이가 없다`);
    return btn;
};
/** 층위 칸의 서랍 머리 줄. 없으면 null(그릴 게 없다는 뜻도 검사 대상이다). */
const drawerHeadOf = (c: HTMLElement, grain: "하루" | "타점"): HTMLElement | null =>
    [...c.querySelectorAll("button")].find((b) => b.title.startsWith(`${grain} 층위에서 치워 둔 축`)) ?? null;

describe("서랍 — 축을 치우되 조건은 살려 둔다", () => {
    it("넣으면 밖 목록에서 빠지고 서랍이 센다", () => {
        const { container } = renderBoard(ORDER_SEED);
        expect(drawerHeadOf(container, "하루")).toBeNull(); // 빈 서랍은 줄도 없다

        fireEvent.click(stowOf(container, "하루축A"));

        expect(railNames(container)).toEqual(["하루축B", "타점축"]);
        expect(drawerHeadOf(container, "하루")!.textContent).toContain("서랍 1");
    });

    it("**조건은 그대로 걸려 있다** — 배지가 그 사실을 말한다", () => {
        const { container } = renderBoard(ORDER_SEED);
        drag(trackOf(container, "하루축A"), 0.35, 0.7);
        const before = stages();
        expect(before).toHaveLength(1);

        fireEvent.click(stowOf(container, "하루축A"));

        expect(stages()).toEqual(before); // 숨겼다고 조건이 사라지지 않는다
        expect(drawerHeadOf(container, "하루")!.textContent).toContain("조건 1");
    });

    it("펼치면 같은 레일이 서고, 거기서 그으면 그 축의 필터가 선다", () => {
        const { container } = renderBoard(ORDER_SEED);
        fireEvent.click(stowOf(container, "하루축A"));
        fireEvent.click(drawerHeadOf(container, "하루")!);

        expect(railNames(container).filter((n) => n === "하루축A")).toHaveLength(1); // 두 곳에 서지 않는다
        drag(trackOf(container, "하루축A"), 0.35, 0.7);
        const p = stages()[0].predicates[0];
        expect(p.kind === "axisValue" && p.axisId).toBe("c:day-a");
    });

    it("저장 집합을 적용해 조건이 통째로 갈려도 서랍은 그대로 — 치운 자리가 유지되어야 서랍이 쓸모 있다", () => {
        const { container } = renderBoard(ORDER_SEED);
        drag(trackOf(container, "하루축A"), 0.35, 0.7);
        act(() => {
            const st = useWorkbench.getState();
            st.saveSet("집합");
            st.removeFilterStage(stages()[0].id); // 조건을 지운 상태에서 치운다
        });
        fireEvent.click(stowOf(container, "하루축A"));

        act(() => useWorkbench.getState().openSet(useWorkbench.getState().savedSets[0].id));

        expect(stages()).toHaveLength(1); // 조건은 돌아왔고
        expect(JSON.parse(localStorage.getItem(DRAWER_KEY)!)).toEqual(["c:day-a"]); // 서랍에 그대로 있다
    });

    it("서랍 안에서 직접 그은 조건은 자리를 안 옮긴다 — 손이 튀면 안 된다", () => {
        const { container } = renderBoard(ORDER_SEED);
        fireEvent.click(stowOf(container, "하루축A"));
        fireEvent.click(drawerHeadOf(container, "하루")!);

        drag(trackOf(container, "하루축A"), 0.35, 0.7);

        expect(JSON.parse(localStorage.getItem(DRAWER_KEY)!)).toEqual(["c:day-a"]); // 서랍에 그대로
    });

    it("'걸린 것만 보기'에서 조건 없는 서랍은 줄도 안 그린다 — 못 찾을 1개를 세어 봐야 소용없다", () => {
        // 그 모드에서는 조건 없는 레일이 아예 안 그려지므로 손잡이도 없다 — 치운 상태를 저장물로 심는다.
        localStorage.setItem(DRAWER_KEY, JSON.stringify(["c:day-a"]));
        const { container } = renderBoard(ORDER_SEED, true);
        expect(drawerHeadOf(container, "하루")).toBeNull();
    });

    it("접힌 서랍의 조건을 되짚으면 서랍이 펼쳐진다 — 안 그러면 눌러도 아무 일이 없다", async () => {
        const scrollInto = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = () => {};
        try {
            const { container, rerender } = renderBoard(ORDER_SEED);
            drag(trackOf(container, "하루축A"), 0.35, 0.7);
            fireEvent.click(stowOf(container, "하루축A"));
            expect(railNames(container)).not.toContain("하루축A"); // 접힌 상태

            const id = stages()[0].id;
            rerender(<FilterBoard reveal={{ stageId: id, at: 1 }} onlyActive={false} />);

            expect(railNames(container)).toContain("하루축A");
        } finally {
            Element.prototype.scrollIntoView = scrollInto;
        }
    });

    it("서랍은 로컬에 남는다 — 다시 열어도 치운 그대로", () => {
        const { container, unmount } = renderBoard(ORDER_SEED);
        fireEvent.click(stowOf(container, "하루축A"));
        expect(JSON.parse(localStorage.getItem(DRAWER_KEY)!)).toEqual(["c:day-a"]);
        unmount();

        const again = renderBoard(ORDER_SEED);
        expect(railNames(again.container)).toEqual(["하루축B", "타점축"]);
    });

    it("축이 아직 안 왔을 땐 청소하지 않는다 — 유령으로 오인해 지우면 설정이 조용히 사라진다", () => {
        localStorage.setItem(DRAWER_KEY, JSON.stringify(["c:day-a"]));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
        const original = window.fetch;
        window.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
        try {
            render(<FilterBoard reveal={null} onlyActive={false} />, {
                wrapper: ({ children }: { children: ReactNode }) => <Providers client={client}>{children}</Providers>,
            });
            expect(JSON.parse(localStorage.getItem(DRAWER_KEY)!)).toEqual(["c:day-a"]);
        } finally {
            window.fetch = original;
        }
    });

    it("순서 드래그는 편을 못 넘는다 — 서랍 안 축을 밖 축에 떨어뜨려도 그대로", () => {
        const { container } = renderBoard(ORDER_SEED);
        fireEvent.click(stowOf(container, "하루축A"));
        fireEvent.click(drawerHeadOf(container, "하루")!);

        dragAxisOnto(container, "하루축A", "하루축B");

        expect(JSON.parse(localStorage.getItem(DRAWER_KEY)!)).toEqual(["c:day-a"]); // 서랍에 그대로
        // 서랍은 그 층위 칸의 **맨 아래**라 하루 칸 안(타점 칸보다 위)에 그려진다.
        expect(railNames(container)).toEqual(["하루축B", "하루축A", "타점축"]);
    });
});

describe("테마 칸 — 라이브 미러 스냅샷과 동결", () => {
    // themeRankParams 는 전역 RESET 에 없어 테스트끼리 흘러간다 — 여기서 직접 기본값으로 되돌린다.
    beforeEach(() => {
        useWorkbench.getState().setThemeRankParams({
            zoneRateN: 30, zoneAmountN: 40, basis: "rate",
            countOn: true, countMin: 3, baseRankOn: false, baseRankMax: 3, zoneRankOn: false, zoneRankMax: 2,
        });
    });

    it("미러 클릭 = 그 순간 값으로 묶음 필터가 서고, 이후 패널 탐색값 변경에 안 흔들린다(동결)", () => {
        useWorkbench.getState().setThemeRankParams({ zoneRateN: 11, zoneAmountN: 22, countOn: true, countMin: 4 });
        const { container } = renderBoard();
        const mirror = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("(현재 패널값)"));
        expect(mirror?.textContent).toContain("테마 11/22"); // 눌리기 전에 찍힐 값이 보인다
        act(() => { fireEvent.click(mirror!); });
        const stages = selectFilterStages(useWorkbench.getState());
        const theme = stages.find((s) => s.predicates[0]?.kind === "themeStrength");
        const p = theme!.predicates[0] as Extract<ReturnType<typeof selectFilterStages>[number]["predicates"][number], { kind: "themeStrength" }>;
        expect(p.params.zoneRateN).toBe(11);
        expect(p.params.countMin).toBe(4);
        // 동결 — 패널 탐색값을 바꿔도 술어는 그대로.
        act(() => useWorkbench.getState().setThemeRankParams({ zoneRateN: 99 }));
        const after = selectFilterStages(useWorkbench.getState()).find((s) => s.predicates[0]?.kind === "themeStrength")!
            .predicates[0] as typeof p;
        expect(after.params.zoneRateN).toBe(11);
    });

    it("동결 행의 인라인 임계값 변경은 술어만 바꾸고 N/M(정체성)은 그대로", () => {
        useWorkbench.getState().setThemeRankParams({ zoneRateN: 11, zoneAmountN: 22 });
        const { container } = renderBoard();
        const mirror = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("(현재 패널값)"));
        act(() => { fireEvent.click(mirror!); });
        // 행 안의 "동료 ≥" 숫자칸을 8 로 — 커밋은 blur 한 번(키 입력마다 재정산하지 않는 보드 규약).
        const row = [...container.querySelectorAll("label")].find((l) => l.title.includes("존 내 테마 종목 수"));
        const num = row!.querySelector("input[type=number]")!;
        act(() => {
            fireEvent.change(num, { target: { value: "8" } });
            fireEvent.blur(num, { target: { value: "8" } });
        });
        const p = selectFilterStages(useWorkbench.getState()).find((s) => s.predicates[0]?.kind === "themeStrength")!
            .predicates[0] as Extract<ReturnType<typeof selectFilterStages>[number]["predicates"][number], { kind: "themeStrength" }>;
        expect(p.params.countMin).toBe(8);
        expect(p.params.zoneRateN).toBe(11); // 동결 유지
        expect(p.params.zoneAmountN).toBe(22);
    });
});
