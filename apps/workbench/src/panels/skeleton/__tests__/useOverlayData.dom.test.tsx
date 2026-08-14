// 골격 겹쳐 그리기의 **데이터 조립** — 무엇이 선이 되고, 안 된 것은 왜 안 됐나.
//
// 이 훅의 규약 중 하나는 순전히 **산수**다: 헤더가 `population`(M) · `lines.length`(N) · `missingPrevClose`
// 를 나란히 세워 사용자가 "M − N = 필터로 빠진 것 + 결손"으로 읽는다. 셋 중 하나만 세는 단위가
// 어긋나면(차트를 세느냐 타점을 세느냐) 그 산수가 조용히 깨진다 — 화면은 멀쩡해 보이고 숫자만 안 맞는다.
// 주석에만 있던 그 계약을 여기서 못박는다.
//
// ⚠ 특히 미묘한 것: **결손은 필터를 통과한 것 중에서만 센다.** 순서를 뒤집어 필터 전에 세면 필터가
//   걸린 화면에서 같은 타점이 "필터로 빠짐"과 "결손" 양쪽에 잡혀 산수가 두 번 센다.
//
// 깔때기는 셸이 계산해 나눠 주는 것이라(FunnelProvider) 여기서는 그 구독만 갈아 끼운다 — 조건 평가는
// 깔때기의 몫이고 이 훅은 **결과 집합을 받아 거르기만** 한다는 게 경계다.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ReviewPointListItem, SkeletonFeed } from "@trade-data-manager/wire";
import { seededClient, type Seed } from "../../../test/renderPanel.js";
import { StockNamesProvider } from "../../../lib/StockNamesContext.js";
import { useOverlayData } from "../useOverlayData.js";

const DATE = "2026-07-08";
const A = "005930", B = "000660", C = "035720";
const T1 = "09:30:00", T2 = "09:35:00";
const ck = (code: string): string => `${code}|${DATE}`;
const pk = (code: string, time: string): string => `${code}|${DATE}|${time}`;

/** 피벗 t 는 벽시계 분 — 타점 시각에 점이 있어야 그 타점의 선이 선다. */
const PIVOTS = [{ t: 565, price: 10_000 }, { t: 570, price: 12_000 }, { t: 575, price: 11_000 }];

const feed: SkeletonFeed = {
    daily: [A, B, C].map((code) => ({ stockCode: code, date: DATE, pivots: PIVOTS })),
    minute: [
        { stockCode: A, date: DATE, pivots: PIVOTS, prevClose: 9_500 },   // 멀쩡 — 타점 2개
        { stockCode: B, date: DATE, pivots: PIVOTS, prevClose: undefined }, // 전일 종가 결손 — 타점 2개
        { stockCode: C, date: DATE, pivots: PIVOTS, prevClose: 9_500 },   // 멀쩡 — 타점 1개
    ],
    levels: [{ stockCode: A, date: DATE, levels: [{ price: 9_800, baseline: true }] }],
};

const points: ReviewPointListItem[] = [
    { stockCode: A, date: DATE, time: T2, name: "삼성전자" }, // 일부러 뒤집어 넣는다(정렬 확인)
    { stockCode: A, date: DATE, time: T1, name: "삼성전자" },
    { stockCode: B, date: DATE, time: T1, name: "SK하이닉스" },
    { stockCode: B, date: DATE, time: T2, name: "SK하이닉스" },
    { stockCode: C, date: DATE, time: T1, name: "카카오" },
];

// ── 깔때기 구독만 갈아 끼운다 ────────────────────────────────────────────────
const funnel = {
    isLoading: false,
    isFiltering: false,
    viewedChartKeys: new Set<string>(),
    viewedPointRefs: [] as { stockCode: string; date: string; time: string }[],
};
vi.mock("../../filter/FunnelContext.js", () => ({ useFunnel: () => funnel }));

beforeEach(() => {
    funnel.isLoading = false;
    funnel.isFiltering = false;
    funnel.viewedChartKeys = new Set();
    funnel.viewedPointRefs = [];
});

const wrapper = (seed: Seed) => {
    const client = seededClient(seed);
    return ({ children }: { children: ReactNode }): JSX.Element =>
        <QueryClientProvider client={client}>
            <StockNamesProvider>{children}</StockNamesProvider>
        </QueryClientProvider>;
};
const read = (isDaily: boolean, onlyCharts: ReadonlySet<string> | null = null, seed: Seed = { skeletons: feed, points }): ReturnType<typeof useOverlayData> =>
    renderHook(() => useOverlayData(isDaily, "last", onlyCharts), { wrapper: wrapper(seed) }).result.current;

describe("일봉 — 선은 차트 단위", () => {
    it("차트마다 선 하나, 모집단은 차트 수", () => {
        const d = read(true);
        expect(d.lines.map((l) => l.stockCode)).toEqual([A, B, C]);
        expect(d.population).toBe(3);
        expect(d.lines.every((l) => l.kind === "chart")).toBe(true);
    });

    it("깔때기가 걸리면 그 집합의 차트만 — 조건 평가는 깔때기가 이미 끝냈다", () => {
        funnel.isFiltering = true;
        funnel.viewedChartKeys = new Set([ck(A), ck(C)]);
        const d = read(true);
        expect(d.lines.map((l) => l.stockCode)).toEqual([A, C]);
        expect(d.population).toBe(3); // 분모는 필터 전 그대로
    });

    it("깔때기가 아직 로딩이면 **안 거른다** — 판정이 안 끝난 집합으로 거르면 빈 화면이 '조건에 다 걸렸다'로 읽힌다", () => {
        funnel.isLoading = true;
        funnel.isFiltering = true;
        funnel.viewedChartKeys = new Set(); // 아직 비어 있다
        expect(read(true).lines).toHaveLength(3);
    });

    it("일봉엔 결손 개념이 없다 — %p 분모를 안 쓴다", () => {
        expect(read(true).missingPrevClose).toBe(0);
    });
});

describe("분봉 — 선은 타점 단위", () => {
    it("타점마다 선 하나 — 같은 차트의 타점 둘이 선 둘로 선다", () => {
        const d = read(false);
        expect(d.lines.map((l) => l.key)).toEqual([pk(A, T1), pk(A, T2), pk(C, T1)]);
        expect(d.lines.every((l) => l.kind === "point")).toBe(true);
    });

    it("모집단은 **분봉 골격이 있는 차트 위의 타점 수** — 차트 수가 아니다", () => {
        expect(read(false).population).toBe(5);
    });

    it("전일 종가가 없으면 못 그린다 — 분모를 지어내지 않는다", () => {
        expect(read(false).lines.some((l) => l.stockCode === B)).toBe(false);
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유다 — 헤더의 숫자가 서로 안 맞으면 사용자가 필터를 의심한다.
describe("산수 — M − N = 필터로 빠진 것 + 결손", () => {
    it("결손은 **타점**으로 센다 — 차트로 세면 3개가 빠졌는데 10개 사라지는 식이 된다", () => {
        expect(read(false).missingPrevClose).toBe(2); // B 의 타점 2개(차트 1개가 아니라)
    });

    it("필터가 없을 때 산수가 맞는다", () => {
        const d = read(false);
        expect(d.population - d.lines.length).toBe(0 + d.missingPrevClose);
        expect([d.population, d.lines.length, d.missingPrevClose]).toEqual([5, 3, 2]);
    });

    // ⚠ 결손 세기가 필터보다 **앞**에 오면 여기가 2가 되고, 그러면 같은 타점이 양쪽에 잡혀 두 번 센다.
    it("필터에 걸린 결손 타점은 결손으로 **안** 센다 — 두 번 세지 않는다", () => {
        funnel.isFiltering = true;
        funnel.viewedPointRefs = [{ stockCode: A, date: DATE, time: T1 }, { stockCode: A, date: DATE, time: T2 }];
        const d = read(false);
        expect(d.lines).toHaveLength(2);
        expect(d.missingPrevClose).toBe(0);
        expect(d.population - d.lines.length).toBe(3 + d.missingPrevClose); // 3 = 필터로 빠진 타점
    });

    it("결손 타점만 통과시키면 그때는 결손으로 센다", () => {
        funnel.isFiltering = true;
        funnel.viewedPointRefs = [{ stockCode: B, date: DATE, time: T1 }];
        const d = read(false);
        expect(d.lines).toHaveLength(0);
        expect(d.missingPrevClose).toBe(1);
    });
});

describe("선택만 보기 — 패널 로컬 시야(필터와 별개)", () => {
    it("고른 차트의 타점만 남는다", () => {
        expect(read(false, new Set([ck(C)])).lines.map((l) => l.key)).toEqual([pk(C, T1)]);
    });

    it("모집단은 안 줄어든다 — 시야를 좁힌 것이지 모집단이 바뀐 게 아니다", () => {
        expect(read(false, new Set([ck(C)])).population).toBe(5);
    });
});

describe("곁들이 — 선이 참조하는 것들", () => {
    it("기준선은 **차트 소유** — 타점 단위 선도 제 차트키로 찾는다", () => {
        const d = read(false);
        const line = d.lines[0];
        expect(d.levelsByChart.get(line.chartKey)?.[0].price).toBe(9_800);
    });

    it("차트별 타점은 시각 오름차순 — 넣은 순서가 아니다", () => {
        expect(read(false).pointsByChart.get(ck(A))?.map((p) => p.time)).toEqual([T1, T2]);
    });

    it("타점 목록은 필터와 무관한 전체 — 선은 사실을 그린다", () => {
        funnel.isFiltering = true;
        funnel.viewedPointRefs = [{ stockCode: A, date: DATE, time: T1 }];
        expect(read(false).pointsByChart.get(ck(A))).toHaveLength(2);
    });

    it("이름은 마스터 사전에서 — 없으면 코드 그대로(지어내지 않는다)", () => {
        const d = read(false);
        expect(d.nameOf(A)).toBe("삼성전자");
        expect(d.nameOf("999999")).toBe("999999");
    });

    // ⚠ 이 화면의 어느 피드에도 없는 종목의 이름을 답할 수 있어야 한다 — **머리글 배지가 사는 자리가
    //   정확히 거기다**(필터 밖·타점 없음). 예전엔 이름을 피드에서 모아 이 경우에 코드가 떴다.
    it("이 화면의 피드에 없는 종목도 이름을 안다 — 사전이 전량이라", () => {
        const d = read(true, null, {
            skeletons: feed, points,
            stockNames: [{ stockCode: "999999", name: "없던종목", market: "거래소" }],
        });
        expect(d.lines.some((l) => l.stockCode === "999999")).toBe(false); // 그릴 재료는 없다
        expect(d.nameOf("999999")).toBe("없던종목");                        // 그래도 이름은 안다
    });
});
