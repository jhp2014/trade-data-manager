// core/market/domain/review — 필터 깔때기의 **정산**. 조건이 무엇인지는 모르고, 판정 결과만 집계한다.
//
// **술어를 평가하지 않는다.** 단계마다 재료가 다르고(그룹 멤버십·축 배치줄·날짜…) 그걸 다 알면 이 모듈이
// 앱 전체에 묶인다. 그래서 입력은 이미 3치로 판정된 `verdictOf` 뿐이고, 여기서 하는 일은 전 단계 3치
// AND 하나다. 판정 규칙은 각 술어의 지식, 정산 규칙은 여기 지식.
//
// ⚠ **2026-09-19 로 5칸 진단이 은퇴했다**(decisions.md 「집합 편성 재설계」). 단계별 칸 분류(생존/근접
// 탈락/상류 보류/탈락/미배치)·한계 기여도(`newlyKilled`)·`blockedBy` 가 전부 사라졌고, 남은 산출물은
// **생존자 · 미배치 수 · 유니버스 크기** 셋뿐이다. 그래서 **단계 순서가 결과에 아무 영향이 없다**(3치
// AND 는 교환법칙이 성립한다) — 순서로 이야기를 만들던 층이 통째로 없어졌기 때문이다.
//
// 대수 자체(`and3`/`or3`/`not3`)는 남는다 — 다음 판의 식 트리(AND/OR/NOT)가 그대로 딛는 바닥이다.
import type { ChartRef } from "./group.js";

/**
 * 3치 판정 — `undefined` 는 "재료가 없어 판단 불가"(미배치). 알람·보드 필터의 `evalPredicate` 와 같은 규칙이다.
 * ⚠ **"안 맞았다"(false)와 "아직 안 했다"(undefined)를 절대 섞지 않는다.** 섞으면 결손이 탈락으로
 * 새어 "조건에 안 맞은 것"과 "아직 재료가 없는 것"을 화면이 구분할 수 없게 된다.
 */
export type Verdict = boolean | undefined;

// 판정 알갱이는 도메인 공용 어휘(grain.ts) — 결과 해상도는 걸린 단계 중 가장 가는 것(finestGrain).
import type { Grain } from "../grain.js";
export type { Grain };

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

/**
 * 3치 AND 한 걸음 — `and3` 를 **접어 나갈 때**의 단위(둘의 AND). 규칙은 같다: 탈락이 흡수, 미배치가 점착.
 * `and3` 를 그대로 두는 이유는 탈락에서 즉시 끊는 짧은 회로가 목록 판정엔 그대로 쓸모 있어서다.
 */
export const andStep = (a: Verdict, b: Verdict): Verdict =>
    a === false || b === false ? false : a === undefined || b === undefined ? undefined : true;

/**
 * 3치 OR — Kleene. 하나라도 참이면 참(모름이 섞여 있어도), 아니면 모름이 있으면 모름, 아니면 거짓.
 * 빈 목록은 거짓(공허거짓) — `and3([])` 가 참인 것과 짝을 이룬다.
 *
 * AND 만 여기 있고 OR·NOT 은 소비자 쪽에 있었다. 셋은 한 대수(代數)라 반쪽만 도메인에 두면
 * "모름을 어떻게 다루나"라는 같은 규칙이 두 곳에서 각자 자란다 — 실제로 DNF 판정(절끼리 OR,
 * 리터럴마다 NOT)이 이 셋을 한 식에서 같이 쓴다.
 */
export function or3(verdicts: Iterable<Verdict>): Verdict {
    let unknown = false;
    for (const v of verdicts) {
        if (v === true) return true;
        if (v === undefined) unknown = true;
    }
    return unknown ? undefined : false;
}

/** 3치 NOT — 모름의 부정은 모름이다("아닌지 아닌 게 아닌지"를 모르는 것). */
export const not3 = (v: Verdict): Verdict => (v === undefined ? undefined : !v);

/** 결과 해상도 — 하나라도 타점 알갱이가 걸리면 타점, 아니면 하루. 아무 단계도 없으면 하루. */
export function finestGrain(grains: Iterable<Grain>): Grain {
    for (const g of grains) if (g === "point") return "point";
    return "day";
}

/**
 * 유니버스를 표시 알갱이로 펼친다. 후보는 언제나 (종목·날짜)이고 — 후보 판정은 축·맵과 무관하게 하나여야
 * 단계별 숫자를 서로 비교할 수 있다 — 타점 알갱이에서만 그 하루의 타점들로 갈라진다.
 * **타점이 하나도 없는 후보 하루는 시각 없는 항목 하나로 남는다**(사라지지 않고 미배치로 뜬다).
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

export interface FunnelResult {
    universe: number;
    /** 전 단계 3치 AND 통과 — **순서와 무관**. 미배치는 여기 못 든다. */
    survivors: FunnelItem[];
    /** 전 단계 AND 가 미배치(undefined)로 남은 항목 수 — 생존도 탈락도 아닌 결손의 총량(조용히 사라지면 안 된다). */
    pendingCount: number;
}

/**
 * 정산 본체 — 항목마다 전 단계 3치 AND 를 접어 생존/미배치를 가른다.
 * 판정은 항목×단계로 한 번씩만 부른다(verdictOf 가 비쌀 수 있다).
 *
 * ⚠ **탈락(false)에서 즉시 접지 않는다.** `andStep` 이 false 를 흡수하므로 결과는 같지만, 남은 단계의
 * `verdictOf` 를 계속 부르는 건 낭비다 — 그런데 여기서 단락을 넣으면 "판정은 항목×단계 한 번씩"이라는
 * 호출 계약이 깨져 판정기 쪽 메모(같은 항목을 여러 단계가 공유하는 캐시)의 적중 패턴이 바뀐다.
 * 단락은 하루 엔진(cellset)의 일이고 여기는 종단 유니버스(수천 규모)라 그대로 둔다.
 */
export function tallyFunnel(items: readonly FunnelItem[], stages: readonly FunnelStage[]): FunnelResult {
    const survivors: FunnelItem[] = [];
    let pendingCount = 0;
    for (const item of items) {
        let upstream: Verdict = true; // 앞이 없으면 막힌 적도 없다(공허참 — and3([]) 와 같은 값)
        for (let s = 0; s < stages.length; s++) {
            upstream = andStep(upstream, stages[s]!.verdictOf(item));
        }
        // 다 접은 upstream = 전 단계 AND(순서와 무관한 값).
        if (upstream === true) survivors.push(item);
        else if (upstream === undefined) pendingCount++;
    }
    return { universe: items.length, survivors, pendingCount };
}
