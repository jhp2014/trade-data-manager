// 레일 펼침 분포(순수) — 틱 자리들을 균등 칸으로 세어 막대 높이로 바꾼다.
//
// 왜 따로 세나(capTickSpans 가 이미 접는데): 저건 **표식 층**이라 빈 칸을 버리고 자리를 평균으로
// 옮긴다. 분포는 모수와 멤버가 **같은 칸에서 맞물려야** 두 겹으로 읽히므로, 칸 색인이 구조적으로
// 같은 배열이 필요하다. 그래서 접기와 세기는 다른 함수다.
//
// 왜 로그인가: 밀도를 알파로만 그리면 `1-(1-a)^n` 이 천장을 친다(a=0.35 면 n=10 에서 0.99).
// 모수가 수천이면 모든 칸이 천장이라 그림이 아무 말도 안 한다. 높이는 천장이 없고, 로그는 봉우리
// 하나가 꼬리 전체를 눌러버리는 걸 막는다 — **표시 전용**이고 술어는 여전히 값 경계다.
import { clamp01 } from "../../../lib/num.js";

/** 칸 수 — 트랙 폭(≈430px)에서 칸당 4px 남짓. 이 수가 곧 DOM 노드 수라 상한이기도 하다. */
export const HIST_BINS = 100;

/** 칸 하나 — 모수 건수와 그중 멤버 건수(멤버 ⊆ 모수). */
export interface HistBin {
    count: number;
    member: number;
}

export interface Histogram {
    bins: HistBin[];
    /** 모수 최댓값 — 두 층이 **같은 척도**로 서게 하는 기준(각자 정규화하면 멤버가 거짓말을 한다). */
    max: number;
}

/** 프랙션 → 칸 색인. 오른쪽 끝(1.0)은 마지막 칸에 넣는다(안 그러면 칸이 하나 넘친다). */
const binOf = (frac: number, bins: number): number =>
    Math.min(bins - 1, Math.max(0, Math.floor(clamp01(frac) * bins)));

/** 틱 자리들 → 칸별 건수. member 는 ticks 의 부분집합이라 같은 칸 색인에 얹힌다. */
export function histogramOf(
    ticks: readonly number[],
    member: readonly number[] | undefined,
    bins = HIST_BINS,
): Histogram {
    const out: HistBin[] = Array.from({ length: bins }, () => ({ count: 0, member: 0 }));
    for (const f of ticks) out[binOf(f, bins)]!.count += 1;
    if (member) for (const f of member) out[binOf(f, bins)]!.member += 1;
    let max = 0;
    for (const b of out) if (b.count > max) max = b.count;
    return { bins: out, max };
}

/**
 * 건수 → 0..1 높이(로그). 0 건은 0 — 빈 칸에 최소 높이를 주면 "여기 하나도 없다"가 사라진다.
 * max 를 밖에서 받는 이유는 멤버 층이 **모수의 최댓값**으로 정규화돼야 해서다.
 */
export const logHeight = (n: number, max: number): number =>
    n <= 0 || max <= 0 ? 0 : Math.log1p(n) / Math.log1p(max);

/** 칸의 가운데 자리(0..1) — 툴팁이 말할 값을 고르는 기준(칸 하나를 대표하는 자리). */
export const binCenter = (i: number, bins = HIST_BINS): number => (i + 0.5) / bins;

/**
 * 칸 i 가 컷 구간 [lo,hi] 와 겹치나 — 칸을 **점이 아니라 구간**으로 본다.
 * 가운데로 판정하면 한 칸(도메인 1%)보다 좁은 컷이 어떤 칸 가운데도 못 물어 통과 막대가 **하나도**
 * 안 생긴다(조건이 걸려 있는데 스트립 전체가 제외 색). 상위 몇 건만 남기는 좁은 컷은 이 레일에서
 * 흔한 조작이라 그 자리가 곧 사고다. 경계 칸이 부분 통과로 물드는 건 비닝의 본질이라 감수한다.
 */
export const binOverlaps = (i: number, lo: number, hi: number, bins = HIST_BINS): boolean =>
    hi >= i / bins && lo <= (i + 1) / bins;
