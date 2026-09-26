import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
// 깔때기 배선 — 조각 넷(유니버스·펼치기·3치 판정·정산)을 실제 데이터로 잇는 단 하나의 자리.
//
// 순수 조각들은 각자 덮여 있고(stage·evaluate·axisLookup·core/funnel), **재료를 꽂는 일**은 아무도
// 안 보고 있었다. 그런데 이 훅의 출력은 패널 다섯이 구독한다 — 여기가 틀리면 다섯 화면이 같이 틀린다.
// (골격 쪽 테스트에서 이 훅을 통째로 mock 했으니, 소비자 쪽 계약은 있고 생산자 쪽이 비어 있었다.)
//
// ⚠ 이 파일이 특히 지키는 것: **사전이 오기 전에는 아무것도 정하지 않는다.** 알갱이 판정이 사전을
//   보는데 로딩 중의 "모름"은 "없음"이 아니라 "곧 옴"이다. 그때 확정하면 사전이 도착하는 순간 화면이
//   통째로 다시 그려지고, 더 나쁘게는 그 사이의 5칸 숫자가 전부 미배치로 부풀어 **사용자가 그걸 사실로
//   읽는다**. 숫자가 틀렸다는 신호가 화면 어디에도 안 뜨는 종류다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exprOfStages } from "../expr.js";
import { renderHook, act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Providers, seedEditing, seededClient, type Seed, type SeedPoint } from "../../../test/renderPanel.js";
import { useFilterFunnel } from "../useFilterFunnel.js";
import type { FilterStage } from "../stage.js";

const A = "005930", B = "000660", C = "035720";
const D1 = "2026-07-08", D2 = "2026-07-09";

/** 후보 하루 셋 — A·B 는 D1, C 는 D2. (시드가 최소 앵커로 세운다 — renderPanel 주석 참고.) */
const candidates: Seed["candidateDays"] = [
    { stockCode: A, date: D1 },
    { stockCode: B, date: D1 },
    { stockCode: C, date: D2 },
];

/** 타점: A 에 둘, B 에 하나, **C 에는 없다**(타점 0인 하루가 어떻게 펼쳐지나가 계약이다). */
const points: SeedPoint[] = [
    { stockCode: A, date: D1, time: "09:30:00", name: "삼성전자" },
    { stockCode: A, date: D1, time: "09:35:00", name: "삼성전자" },
    { stockCode: B, date: D1, time: "10:00:00", name: "SK하이닉스" },
];

const SEED: Seed = { candidateDays: candidates, points };

const wrapper = (seed: Seed) => {
    const client = seededClient(seed);
    return ({ children }: { children: ReactNode }): JSX.Element => <Providers client={client}>{children}</Providers>;
};
const read = (seed: Seed = SEED): ReturnType<typeof useFilterFunnel> =>
    renderHook(() => useFilterFunnel(), { wrapper: wrapper(seed) }).result.current;

/** 하루 알갱이 단계 하나 — 날짜 조건은 사전(그룹·축)을 안 봐서 배선만 재기에 좋다. */
const dateStage = (id: string, from: string, to: string, enabled = true): FilterStage =>
    ({ id, enabled, predicates: [{ kind: "date", ranges: [{ from, to }] }] });

// 조건 한 벌은 하나다 — 소비자는 selectFilterStages 로만 읽는다(저장 모양은 슬라이스의 사정).
const setStages = (stages: FilterStage[]): void => { act(() => { seedEditing(exprOfStages(stages)); }); };

beforeEach(() => {
    seedEditing(exprOfStages([]));
});
afterEach(() => {
    seedEditing(exprOfStages([]));
    localStorage.clear();
    vi.unstubAllGlobals();
});

// ⚠ 이 블록이 이 파일의 존재 이유다.
describe("사전이 오기 전 — 아무것도 정하지 않는다", () => {
    /**
     * 재료가 **영영 안 오는** 상태 — 캐시를 하나도 안 심고(seededClient 는 빈 값이라도 심는다),
     * fetch 는 영원히 pending 인 약속을 준다. setup 의 네트워크 그물은 fetch 를 통째로 갈아 끼우면
     * 안 걸린다(그게 명시적인 탈출구다) — 여기서는 일부러 로딩을 재현하는 게 목적이라 그 문을 쓴다.
     */
    const readPending = (): ReturnType<typeof useFilterFunnel> => {
        vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
        const w = ({ children }: { children: ReactNode }): JSX.Element => <Providers client={client}>{children}</Providers>;
        return renderHook(() => useFilterFunnel(), { wrapper: w }).result.current;
    };

    it("픽스처 자신 — 정말 로딩 상태다(아니면 아래가 전부 헛돈다)", () => {
        expect(readPending().isLoading).toBe(true);
    });

    it("유니버스를 0으로 둔다 — 세어 놓고 나중에 고치면 그 숫자가 사실로 읽힌다", () => {
        const v = readPending();
        expect(v.universe).toBe(0);
        expect(v.result).toBeNull();
    });

    // resolveAutoGrain 은 "남은 모름 = 죽은 참조"라는 전제로 하루로 접는 함수라, 로딩 중에 부르면
    // 아직 안 온 사전을 죽은 것으로 단정한다. 그래서 로딩 중엔 **아예 안 부르고** 하루로 둔다 —
    // 타점 알갱이가 자명한 단계(시각 조건)가 걸려 있어도 마찬가지다.
    it("해상도를 확정하지 않는다 — 타점이 자명한 조건이 걸려 있어도 하루로 둔다", () => {
        setStages([{ id: "s1", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:00" }] }] }]);
        expect(readPending().grain).toBe("day");
    });

    it("사전이 오면 그때 정한다 — 같은 단계가 타점으로 확정된다", () => {
        setStages([{ id: "s1", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:00" }] }] }]);
        expect(read().grain).toBe("point");
    });

    it("죽은 참조로 몰지 않는다 — 아직 안 온 그룹·축을 '지워졌다'로 오인하면 안 된다", () => {
        setStages([{ id: "s1", enabled: true, predicates: [{ kind: "axisBand", axisId: "아직안온축", band: { lo: "s" } }] }]);
        expect(readPending().deadStageIds).toEqual([]);
    });

    it("보는 집합이 빈다 — 구독자는 isLoading 을 같이 봐야 한다(빈 집합 ≠ 전부 탈락)", () => {
        setStages([dateStage("s1", D1, D1)]);
        const v = readPending();
        expect(v.view.viewedItems).toEqual([]);
        expect(v.view.viewedChartKeys.size).toBe(0);
    });
});

describe("유니버스 — 분모는 편집에 따라 조용히 변한다", () => {
    it("후보 하루 수가 곧 분모(하루 해상도)", () => {
        expect(read().universe).toBe(3);
    });

    it("걸린 게 없으면 안 거른다 — 구독자에게 '제한 없음'이라고 말한다", () => {
        const v = read();
        expect(v.view.isFiltering).toBe(false);
        expect(v.view.viewedItems).toHaveLength(3);
    });

    it("해상도가 타점이면 분모도 타점 수 — 타점 0인 하루는 항목 하나로 남는다", () => {
        // 손잡이("타점으로")는 폐지됐다 — 해상도는 걸린 조건이 정한다(시각 조건 = 타점 층위).
        setStages([{ id: "s1", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:00" }] }] }]);
        // A 2 + B 1 + C(타점 없음) 1 = 4
        expect(read().universe).toBe(4);
    });
});

describe("정산 — 표시와 정산이 같은 순서를 본다", () => {
    it("켠 단계만 평가에 든다", () => {
        setStages([dateStage("s1", D1, D1), dateStage("s2", D2, D2, false)]);
        const v = read();
        expect(v.active.map((s) => s.id)).toEqual(["s1"]);
        expect(v.stagesOrdered.map((e) => e.stage.id)).toEqual(["s1", "s2"]); // 표시엔 꺼진 것도 남는다
    });

    it("조건이 생존을 좁힌다", () => {
        setStages([dateStage("s1", D1, D1)]);
        const v = read();
        expect(v.view.isFiltering).toBe(true);
        expect(v.view.viewedItems.map((i) => i.stockCode).sort()).toEqual([B, A].sort());
    });

    it("빈 술어는 평가에서 빠진다 — '무제한'이 '전부 탈락'으로 뒤집히지 않게", () => {
        setStages([{ id: "s1", enabled: true, predicates: [{ kind: "date", ranges: [] }] }]);
        expect(read().active).toEqual([]);
    });
});

describe("그룹 계층 상속 — '테마'를 걸면 '테마 ▸ 2차전지' 소속도 잡힌다", () => {
    const grp = (name: string, parentName: string | null = null) =>
        ({ name, parentName });
    const HIER: Seed = {
        ...SEED,
        groups: [grp("테마"), grp("2차전지", "테마")],
        memberships: [{ stockCode: A, date: D1, groupNames: ["2차전지"] }], // A 는 자식에만 직접 부착
    };
    const groupStage = (groupId: string): FilterStage =>
        ({ id: "sg", enabled: true, predicates: [{ kind: "group", expr: { groups: [{ literals: [{ groupId, neg: false }] }] }, scope: "day" }] });

    it("부모 그룹 필터가 자식 소속을 통과시킨다", () => {
        setStages([groupStage("테마")]);
        expect(read(HIER).view.viewedItems.map((i) => i.stockCode)).toEqual([A]);
    });

    it("자식 그룹 필터는 여전히 자식 소속만 — 상속은 위로만 흐른다", () => {
        setStages([groupStage("2차전지")]);
        expect(read(HIER).view.viewedItems.map((i) => i.stockCode)).toEqual([A]);
    });

    it("부모 부정(!테마)은 자식 소속도 떨군다 — 적용 집합 기준의 대칭", () => {
        setStages([{ id: "sg", enabled: true, predicates: [{ kind: "group", expr: { groups: [{ literals: [{ groupId: "테마", neg: true }] }] }, scope: "day" }] }]);
        expect(read(HIER).view.viewedItems.map((i) => i.stockCode).sort()).toEqual([B, C].sort());
    });
});

describe("그룹의 층위 상속 — 하루 그룹이 그날 타점 전부에 적용된다", () => {
    // 2026-09-01 타점 층위 폐지 뒤 이게 **유일한** 상속 경로다: 그룹은 차트에만 붙고, 이 훅의 조회기가
    // 타점 항목에서 시각을 벗겨 그날 차트로 묻는다(day→point ∀ 전개). 그 배선이 끊기면 해상도가
    // 타점인 순간 모든 그룹 조건이 조용히 거짓이 된다 — 화면엔 "0건"만 뜨고 이유가 안 보인다.
    const DAY_GROUP: Seed = {
        ...SEED,
        groups: [{ name: "테마", parentName: null }],
        memberships: [{ stockCode: A, date: D1, groupNames: ["테마"] }], // 차트에만 붙는다(타점 아님)
    };
    const groupStage = (groupId: string): FilterStage =>
        ({ id: "sg", enabled: true, predicates: [{ kind: "group", expr: { groups: [{ literals: [{ groupId, neg: false }] }] }, scope: "day" }] });
    /** 해상도를 타점으로 끌어내리는 단계 — 시각 조건은 사전을 안 봐서 배선만 재기에 좋다. */
    const timeStage: FilterStage =
        { id: "st", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }] };

    it("해상도가 타점이어도 하루 그룹 조건이 그날 타점들을 통과시킨다", () => {
        setStages([groupStage("테마"), timeStage]);
        const v = read(DAY_GROUP);
        expect(v.grain).toBe("point");
        expect(v.view.viewedItems.map((i) => `${i.stockCode}@${i.time}`))
            .toEqual([`${A}@09:30:00`, `${A}@09:35:00`]); // B 의 타점은 그 그룹이 아니다
    });

    it("부정도 같은 잣대 — 그 하루가 아닌 타점만 남는다", () => {
        setStages([
            { id: "sg", enabled: true, predicates: [{ kind: "group", expr: { groups: [{ literals: [{ groupId: "테마", neg: true }] }] }, scope: "day" }] },
            timeStage,
        ]);
        expect(read(DAY_GROUP).view.viewedItems.map((i) => i.stockCode)).toEqual([B]);
    });
});

// 2026-09-16 술어 scope 명시화의 수용 기준 — day scope 는 ∃ 상향(옛 행동 그대로), point scope 는
// 좌표 라벨이 행을 고른다(전엔 grain 이 늘 day 로 접혀 이 화면 자체가 없었다).
// ⚠ day scope + point 그룹 조합은 팔레트 1:1(B안)로 **새로 못 만든다** — 아래 day scope 테스트들은
// 승계 저장물(scope 부재=day)의 평가 계약을 재는 것이다. 입구가 닫혔다고 이 계약을 걷으면 옛 저장물의
// 뜻이 바뀐다(evaluate.ts 주석).
describe("그룹 술어 scope — 같은 좌표 라벨을 두 층위로 묻는다", () => {
    const LABELED: Seed = {
        ...SEED,
        groups: [{ name: "눌림", parentName: null }],
        // A 의 09:30 타점 하나에만 라벨 — A 의 09:35, B 의 10:00 은 무라벨.
        pointMemberships: [{ stockCode: A, date: D1, time: "09:30:00", groupNames: ["눌림"] }],
    };
    const labelStage = (scope: "day" | "point"): FilterStage =>
        ({ id: "sg", enabled: true, predicates: [{ kind: "group", expr: { groups: [{ literals: [{ groupId: "눌림", neg: false }] }] }, scope }] });

    it("day scope + 타점 그룹 = ∃ 상향 — 라벨 타점을 하나라도 가진 **날**이 행으로 남는다", () => {
        setStages([labelStage("day")]);
        const v = read(LABELED);
        expect(v.grain).toBe("day");
        expect(v.view.viewedItems.map((i) => i.stockCode)).toEqual([A]);
    });

    it("point scope = 라벨 붙은 **타점만** 행이 된다 — 해상도가 그룹 조건 하나로 타점까지 내려간다", () => {
        setStages([labelStage("point")]);
        const v = read(LABELED);
        expect(v.grain).toBe("point");
        expect(v.view.viewedItems.map((i) => `${i.stockCode}@${i.time}`)).toEqual([`${A}@09:30:00`]);
    });

    // ⚠ 리뷰 F1 — scope 는 행 낟알만이 아니라 **평가의 층위**다. 다른 point 조건이 해상도를 타점으로
    // 끌어내려도 day scope 조건은 여전히 하루에 묻는다(시각 벗김) — 안 그러면 "∃ 로 잰다"는 메뉴의
    // 약속이 깔때기 구성에 따라 조용히 깨진다(라벨 시각 밖의 타점이 전부 탈락).
    it("day scope 는 해상도가 타점이어도 하루에 묻는다 — 라벨된 날의 타점 **전부**가 통과한다", () => {
        setStages([
            labelStage("day"),
            { id: "st", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }] },
        ]);
        const v = read(LABELED);
        expect(v.grain).toBe("point");
        // 라벨은 09:30 하나지만 ∃ 는 하루 질문 — A 의 09:35 도 산다. B 는 라벨 없는 날이라 탈락.
        expect(v.view.viewedItems.map((i) => `${i.stockCode}@${i.time}`))
            .toEqual([`${A}@09:30:00`, `${A}@09:35:00`]);
    });

    // ⚠ 리뷰 F2 개정(2026-09-18 B) — 라벨이 곧 행이라 "라벨은 있는데 행이 없다"는 상태가 소멸했다:
    // C 에 라벨을 주면 그 좌표가 행이 되어 point 질문에 답한다(생존). 결손이 남는 자리는 **라벨 0인
    // 후보 하루**(앵커만 그은 날) — point 해상도에서 시각 없는 항목으로 남고, point 질문은 거기 답할
    // 수 없다(탈락이 아니라 미배치 — 확답을 주면 시각 없는 하루 행이 집합에 섞인다).
    it("point scope — 라벨 좌표는 행이 되어 생존하고, 라벨 0인 후보 하루는 결손(미배치)이다", () => {
        const NOLABEL = "111111"; // 앵커만 그은 날(라벨 0) — 시각 없는 항목으로 남는다
        const withOrphanDay: Seed = {
            ...LABELED,
            candidateDays: [...(SEED.candidateDays ?? []), { stockCode: NOLABEL, date: D2 }],
            pointMemberships: [
                ...(LABELED.pointMemberships ?? []),
                { stockCode: C, date: D2, time: "10:00:00", groupNames: ["눌림"] },
            ],
        };
        setStages([labelStage("point")]);
        const v = read(withOrphanDay);
        // C 의 라벨 좌표가 행이 되어 생존한다(후보 정렬 = 날짜 내림 → D2 의 C 가 앞).
        expect(v.view.viewedItems.map((i) => `${i.stockCode}@${i.time}`))
            .toEqual([`${C}@10:00:00`, `${A}@09:30:00`]);
    });
});

describe("보는 집합 — 최종 생존", () => {
    it("조건이 걸리면 생존만 남는다", () => {
        setStages([dateStage("s1", D1, D1)]);
        const v = read();
        expect(v.view.isFiltering).toBe(true);
        expect(v.view.viewedItems).toHaveLength(2);
    });
});

// ⚠ 이 계약을 골격 분봉·시트·분석이 구독한다 — 여기가 틀리면 세 화면이 같이 틀린다.
describe("구독자용 펼치기 — 같은 집합을 두 알갱이로 낸다", () => {
    it("차트 열쇠 — 타점 항목은 제 차트로 접힌다", () => {
        expect([...read().view.viewedChartKeys].sort()).toEqual([`${A}|${D1}`, `${B}|${D1}`, `${C}|${D2}`].sort());
    });

    it("**하루 항목은 그날 타점 전부로 펼쳐진다** — 하루 조건은 전 타점에 같은 값(정직한 반복)", () => {
        const refs = read().view.viewedPointRefs;
        expect(refs.filter((r) => r.stockCode === A).map((r) => r.time).sort()).toEqual(["09:30:00", "09:35:00"]);
    });

    it("**타점 없는 하루는 0개** — 지어내지 않는다", () => {
        expect(read().view.viewedPointRefs.some((r) => r.stockCode === C)).toBe(false);
    });

    it("펼친 결과가 타점 총수와 맞는다", () => {
        expect(read().view.viewedPointRefs).toHaveLength(points.length);
    });

    it("걸러진 뒤에도 두 알갱이가 같은 집합을 가리킨다", () => {
        setStages([dateStage("s1", D1, D1)]);
        const v = read();
        expect([...v.view.viewedChartKeys].sort()).toEqual([`${A}|${D1}`, `${B}|${D1}`].sort());
        expect(v.view.viewedPointRefs).toHaveLength(3); // A 2 + B 1
    });
});

describe("죽은 참조 — 화면이 표시하고 정리는 사용자가 정한다", () => {
    it("지워진 축을 든 단계를 짚어 준다(조용히 안 지운다)", () => {
        setStages([{ id: "s1", enabled: true, predicates: [{ kind: "axisBand", axisId: "지워진축", band: { lo: "slot" } }] }]);
        expect(read().deadStageIds).toEqual(["s1"]);
    });

    it("멀쩡한 단계는 안 짚는다", () => {
        setStages([dateStage("s1", D1, D1)]);
        expect(read().deadStageIds).toEqual([]);
    });
});

describe("theme 술어 — 종단 깔때기에선 결손(하루 판정기의 몫)", () => {
    const themeStage: FilterStage = {
        id: "th1", enabled: true,
        predicates: [{ kind: "theme", ...DEFAULT_THEME_ZONE }],
    };

    it("grain 은 타점으로 내려가되 전부 미배치 — 결손이 탈락으로 새지 않는다", () => {
        setStages([themeStage]);
        const v = read();
        expect(v.grain).toBe("point");
        const t = v.result!;
        expect(t.survivors).toHaveLength(0);
        expect(t.pendingCount).toBe(v.universe);
    });
});

