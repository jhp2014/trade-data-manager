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
import { fireEvent, render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AxisLine, CandidateDay, RankAxis, ReviewPointListItem } from "@trade-data-manager/wire";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { RAIL_PAD } from "../rail/Rail.js";
import { FilterBoard } from "../FilterBoard.js";

const A = "005930", B = "000660";
const DATES = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"];

const candidateDays: CandidateDay[] = DATES.map((date, i) => ({ stockCode: i % 2 ? A : B, date, traces: [] }));
const points: ReviewPointListItem[] = [
    { stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" },
    { stockCode: B, date: DATES[1], time: "10:00:00", name: "SK하이닉스" },
];

/** 판단 축 두 개 — 층위가 갈린다(하루 축 · 타점 축). */
const axes: RankAxis[] = [
    { key: "p:하루축", name: "하루축", scope: "day" },
    { key: "p:타점축", name: "타점축", scope: "point" },
] as unknown as RankAxis[];

/**
 * ⚠ 레일의 자리는 축 정의가 아니라 **배치줄**에서 온다(손으로 배치한 타점들이 자리를 만든다).
 * 이걸 안 심으면 축이 있어도 레일이 "배치 없음"으로 뜬다 — 처음엔 그걸 모르고 축만 심어서,
 * "자리 없는 축은 이유를 적는다" 검사가 **모든 축이 비어 있는 상태로** 통과하고 있었다.
 */
const lineOf = (axisName: string, slots: string[]): AxisLine => ({
    axisName,
    placements: slots.map((_slot, i) => ({
        orderKey: i + 1,
        stockCode: points[i % points.length].stockCode,
        date: points[i % points.length].date,
        time: points[i % points.length].time,
    })),
});
/**
 * ⚠ 자리를 넷 둔다(둘이 아니라). 자리가 둘이면 트랙을 끝에서 끝까지 그을 수밖에 없는데, 양끝에
 * 닿은 경계는 "무제한"이라 **조건이 통째로 비어** 필터가 안 선다(railBound 의 반열림 규칙).
 * 그것도 옳은 동작이지만, 배선을 재려는 검사가 그 규칙에 막혀 0건으로 통과하면 안 된다.
 */
const axisLines: AxisLine[] = [
    lineOf("하루축", ["s1", "s2", "s3", "s4"]),
    lineOf("타점축", ["t1", "t2", "t3", "t4"]),
];

const SEED: Seed = { candidateDays, points, axes, axisLines };

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
const trackOf = (c: HTMLElement, label: string): HTMLElement => {
    const name = [...c.querySelectorAll("div")].find((d) => d.title === label);
    if (!name) throw new Error(`레일 '${label}' 의 이름 열이 없다`);
    const row = name.parentElement!.parentElement!;
    const track = row.querySelector('[title^="빈 곳을 끌면"]');
    if (!track) throw new Error(`레일 '${label}' 에 그을 수 있는 트랙이 없다(disabledNote 상태)`);
    return track as HTMLElement;
};
const drag = (el: HTMLElement, from: number, to: number): void => {
    fireEvent.pointerDown(el, { button: 0, clientX: xAt(from), pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: xAt(to), pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
};
const stages = (): ReturnType<typeof useWorkbench.getState>["filterStages"] => useWorkbench.getState().filterStages;

beforeEach(() => { useWorkbench.setState({ filterStages: [], filterExpandToPoints: false, funnelSelection: null, selectedSetRef: null, savedSets: [] }); });
afterEach(() => { useWorkbench.setState({ filterStages: [], filterExpandToPoints: false, funnelSelection: null, selectedSetRef: null, savedSets: [] }); localStorage.clear(); });

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
        const { container } = renderBoard({ ...SEED, axes: [axes[0]] });
        expect(container.textContent).toContain("이 층위에 축이 없습니다");
    });

    // ⚠ 자리는 축 정의가 아니라 **배치줄**에서 온다 — 축만 있고 배치가 없으면 그을 수 없다.
    it("배치가 없는 축은 트랙 대신 이유를 적는다 — 빈 트랙을 주면 그을 수 있는 줄 안다", () => {
        const { container } = renderBoard({ ...SEED, axisLines: [] });
        expect(container.textContent).toContain("배치 없음");
        expect(() => trackOf(container, "하루축")).toThrow();
    });

    it("배치가 있으면 그을 수 있다 — 위 검사가 '늘 배치 없음'을 상대로 헛돌지 않게", () => {
        const { container } = renderBoard();
        expect(container.textContent).not.toContain("배치 없음");
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

    it("판단 축 레일을 그으면 그 축의 필터가 선다 — 축 id 까지 매인다", () => {
        const { container } = renderBoard();
        drag(trackOf(container, "하루축"), 0.35, 0.7); // 양끝을 안 건드린다(끝에 닿으면 무제한)
        expect(stages()).toHaveLength(1);
        const p = stages()[0].predicates[0];
        expect(p.kind).toBe("axisBand");
        expect(p.kind === "axisBand" && p.axisId).toBe("p:하루축");
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
// 오버레이 재료: 유니버스 두 차트(A@D0·B@D1), 각각 타점 하나. 타점축 배치줄이 두 타점을 자리로 갖는다.
// 날짜 필터로 A@D0 만 남기면 축 레일의 자리 둘 중 **하나만** 멤버가 되어야 한다.
const OVL_CAND: CandidateDay[] = [
    { stockCode: A, date: DATES[0], traces: [] },
    { stockCode: B, date: DATES[1], traces: [] },
];
const OVL_POINTS: ReviewPointListItem[] = [
    { stockCode: A, date: DATES[0], time: "09:30:00", name: "삼성전자" },
    { stockCode: B, date: DATES[1], time: "10:00:00", name: "SK하이닉스" },
];
const OVL_LINE: AxisLine = {
    axisName: "타점축",
    placements: [
        { orderKey: 1, stockCode: A, date: DATES[0], time: "09:30:00" },
        { orderKey: 2, stockCode: B, date: DATES[1], time: "10:00:00" },
    ],
};
const OVL_SEED: Seed = { candidateDays: OVL_CAND, points: OVL_POINTS, axes: [axes[1]], axisLines: [OVL_LINE] };

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
