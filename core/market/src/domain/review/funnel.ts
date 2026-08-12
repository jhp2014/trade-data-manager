// core/market/domain/review — 필터 깔때기의 **정산**. 조건이 무엇인지는 모르고, 판정 결과만 집계한다.
//
// 깔때기는 **실행이 아니라 설명**이다. 각 단계를 "앞 단계 생존자"가 아니라 **전체 유니버스에 독립 평가**한다.
// 생존자만 평가하면 "뒷 단계는 통과했는데 앞에서 죽은 것"이 원리적으로 계산되지 않는데, 그 집합이야말로
// 앞 단계가 과했는지 알려주는 유일한 재료다(= 근접 탈락). 순차 깔때기가 못 주는 게 정확히 이것.
//
// **술어를 평가하지 않는다.** 단계마다 재료가 다르고(그룹 멤버십·축 배치줄·날짜…) 그걸 다 알면 이 모듈이
// 앱 전체에 묶인다. 그래서 입력은 이미 3치로 판정된 `verdictOf` 뿐이고, 여기서 하는 일은 상류 AND ·
// 5칸 분류 · 한계 기여도다. 판정 규칙은 각 술어의 지식, 정산 규칙은 여기 지식.
//
// ⚠ **상류 = 이 단계보다 앞선 단계들**(전부가 아니라). 최종 생존 집합은 전 단계 AND 라 순서와 무관하지만,
// "어느 단계가 무엇을 죽였나"라는 **이야기**는 순서가 만든다. 그래서 재계산 없이 단계를 재배열해 다르게
// 읽을 수 있다 — 순서가 바꾸는 건 서술이지 결과가 아니다.
import type { ChartRef } from "./group.js";

/**
 * 3치 판정 — `undefined` 는 "재료가 없어 판단 불가"(미배치). 알람·보드 필터의 `evalPredicate` 와 같은 규칙이다.
 * ⚠ **"안 맞았다"(false)와 "아직 안 했다"(undefined)를 절대 섞지 않는다.** 섞으면 근접 탈락 집합이
 * "배치가 밀린 것"으로 오염돼 "앞 단계가 과했나"를 물을 수 없게 된다.
 */
export type Verdict = boolean | undefined;

/**
 * 판정 알갱이. 그룹 scope·축 scope 와 같은 어휘다("day" | "point").
 * 결과 해상도는 **걸린 단계 중 가장 가는 것**으로 자동 결정된다(토글 아님) — 아래 finestGrain.
 */
export type Grain = "day" | "point";

/**
 * 깔때기가 세는 항목 하나. day 알갱이면 (종목·날짜), point 알갱이면 거기에 시각까지.
 * ⚠ point 알갱이인데 `time` 이 없는 항목이 **정상적으로 존재한다** — 타점을 아직 안 찍은 후보 하루다.
 * 조용히 빼면 분봉 조건이 붙는 순간 그 하루가 분모에서 사라져 비율이 거짓말을 한다. 미배치로 남아야 한다.
 */
export interface FunnelItem extends ChartRef {
    time?: string;
}

/** 항목의 동일성 키. 시각 유무가 곧 알갱이라 그대로 키에 실린다. */
export const funnelKey = (i: FunnelItem): string => `${i.stockCode}|${i.date}|${i.time ?? ""}`;

/**
 * 3치 AND — 하나라도 탈락이면 탈락, 아니면 미배치가 있으면 미배치, 아니면 통과.
 * 빈 목록은 통과(공허참) — 첫 단계의 상류가 이것이라 "앞이 없으면 막힌 적도 없다"가 된다.
 * ⚠ 미배치는 통과가 아니다. `(그룹 A) AND (깊이 상위)` 에서 A 소속이지만 축 미배치인 항목을 통과로 세면
 * 결과 숫자는 멀쩡한데 실제로는 **배치 진도를 측정**한 게 된다.
 */
export function and3(verdicts: Iterable<Verdict>): Verdict {
    let pending = false;
    for (const v of verdicts) {
        if (v === false) return false;
        if (v === undefined) pending = true;
    }
    return pending ? undefined : true;
}

/** 결과 해상도 — 하나라도 타점 알갱이가 걸리면 타점, 아니면 하루. 아무 단계도 없으면 하루. */
export function finestGrain(grains: Iterable<Grain>): Grain {
    for (const g of grains) if (g === "point") return "point";
    return "day";
}

/**
 * 유니버스를 표시 알갱이로 펼친다. 후보는 언제나 (종목·날짜)이고 — 후보 판정은 축·맵과 무관하게 하나여야
 * 단계별 숫자를 서로 비교할 수 있다 — 타점 알갱이에서만 그 하루의 타점들로 갈라진다.
 * **타점이 하나도 없는 후보 하루는 시각 없는 항목 하나로 남는다**(사라지지 않고 미배치 칸에 뜬다).
 */
export function expandUniverse(
    candidates: readonly ChartRef[],
    grain: Grain,
    timesOf: (c: ChartRef) => readonly string[],
): FunnelItem[] {
    if (grain === "day") return candidates.map((c) => ({ stockCode: c.stockCode, date: c.date }));
    const out: FunnelItem[] = [];
    for (const c of candidates) {
        const times = timesOf(c);
        if (times.length === 0) out.push({ stockCode: c.stockCode, date: c.date });
        else for (const t of times) out.push({ stockCode: c.stockCode, date: c.date, time: t });
    }
    return out;
}

/** 단계 하나 — 판정만 준다(무슨 조건인지는 이 모듈의 관심이 아니다). 꺼진 단계는 호출부가 미리 걸러 넣는다. */
export interface FunnelStage {
    id: string;
    verdictOf: (item: FunnelItem) => Verdict;
}

/**
 * 한 단계에서 항목이 앉는 칸. 앞 셋은 전부 "이번 통과"이고 **상류 상태로만** 갈린다 —
 * 그래서 근접 탈락(상류 탈락)과 상류 보류(상류 미배치)가 반드시 나뉜다.
 */
export type FunnelCell = "survive" | "nearMiss" | "upstreamPending" | "fail" | "pending";

/** 이 항목이 이 단계의 어느 칸인가. upstream = 앞선 단계들의 3치 AND. */
export function cellOf(own: Verdict, upstream: Verdict): FunnelCell {
    if (own === false) return "fail";
    if (own === undefined) return "pending";
    if (upstream === true) return "survive";
    if (upstream === false) return "nearMiss";
    return "upstreamPending";
}

export interface StageTally {
    stageId: string;
    /** 칸별 항목(클릭하면 목록에 뿌릴 것). 유니버스가 수천 규모라 참조 배열로 들고 있어도 싸다. */
    cells: Record<FunnelCell, FunnelItem[]>;
    counts: Record<FunnelCell, number>;
    /**
     * 한계 기여도 — **이번에 새로 죽인 수**(상류 전부 통과였는데 이번에 탈락). `fail` 의 부분집합이다.
     * 0 에 가까우면 그 단계는 장식이다. 겉보기 선택도(탈락 총수)와 전혀 다를 수 있고, 바로 그 차이가
     * "이 조건이 실제로 일을 하고 있나"를 답한다.
     */
    newlyKilled: number;
}

export interface FunnelResult {
    universe: number;
    stages: StageTally[];
    /** 전 단계 3치 AND 통과 — **순서와 무관**. 미배치는 여기 못 든다. */
    survivors: FunnelItem[];
}

const emptyCells = (): Record<FunnelCell, FunnelItem[]> =>
    ({ survive: [], nearMiss: [], upstreamPending: [], fail: [], pending: [] });

/**
 * 정산 본체. 단계마다 유니버스 전체를 돌며 칸을 매기고, 마지막에 전 단계 AND 로 생존자를 낸다.
 * 판정은 항목×단계로 한 번씩만 부른다(verdictOf 가 비쌀 수 있다).
 */
export function tallyFunnel(items: readonly FunnelItem[], stages: readonly FunnelStage[]): FunnelResult {
    // 항목별 전 단계 판정을 먼저 한 벌 — 상류 AND 가 앞선 단계들을 매번 다시 묻지 않게.
    const verdicts: Verdict[][] = items.map((it) => stages.map((s) => s.verdictOf(it)));

    const tallies: StageTally[] = stages.map((s) => ({
        stageId: s.id,
        cells: emptyCells(),
        counts: { survive: 0, nearMiss: 0, upstreamPending: 0, fail: 0, pending: 0 },
        newlyKilled: 0,
    }));

    const survivors: FunnelItem[] = [];
    for (let i = 0; i < items.length; i++) {
        const row = verdicts[i]!;
        const item = items[i]!;
        for (let s = 0; s < stages.length; s++) {
            const own = row[s];
            const upstream = and3(row.slice(0, s)); // 상류 = 앞선 단계들만(순서가 서술을 만든다)
            const cell = cellOf(own, upstream);
            const t = tallies[s]!;
            t.cells[cell].push(item);
            t.counts[cell]++;
            if (own === false && upstream === true) t.newlyKilled++;
        }
        if (and3(row) === true) survivors.push(item);
    }
    return { universe: items.length, stages: tallies, survivors };
}

/**
 * 이 항목을 앞선 단계 중 **어디가 막았나**(탈락시킨 단계 id들). 근접 탈락 목록의 "막힌 단계" 열이 이걸 쓴다 —
 * "2차는 통과인데 1차 그룹에서 죽었다"를 행마다 말해줘야 앞 단계가 과했는지 판단할 재료가 된다.
 * 미배치(보류)는 여기 안 든다 — 막은 게 아니라 아직 안 본 것이다.
 */
export function blockedBy(stages: readonly FunnelStage[], upToIndex: number, item: FunnelItem): string[] {
    const out: string[] = [];
    for (let s = 0; s < upToIndex && s < stages.length; s++) {
        if (stages[s]!.verdictOf(item) === false) out.push(stages[s]!.id);
    }
    return out;
}
