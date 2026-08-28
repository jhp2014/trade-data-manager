// 시선 종목의 분당 서수 트랙 + 존 재적 구간(순수) — 타임라인 바의 재료.
//
// **N/M 무관 트랙과 컷 필터를 가른다**: 트랙(분당 rankSectionOf — 하루 ~390분 × 정렬)은 시선/날짜가
// 바뀔 때 한 번이고, 컷 드래그 중에는 bandSegmentsOf(O(분))만 다시 돈다 — 드래그가 정렬을 못 건드린다.
//
// 계산 주체는 core `rankSectionOf` 하나여야 한다(decisions.md 서수 출처 단일화) — 자체 "나보다 좋은
// 개수 세기"를 새로 쓰지 않고 scrubSectionOf(core 위임 어댑터)를 분마다 부른다.
//
// ⚠ 존은 교집합(등락 ≤ N ∧ 대금 ≤ M) — norm 테마 골격의 재적(dayResidencyOf, 합집합 hot)과 뜻이
// 정반대다. 재사용 금지(themeStrength.ts 머리 주석과 같은 경고).
import type { ReplayStock } from "../../api/dayReplay.js";
import { scrubSectionOf } from "./scrubSection.js";

const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 분 → 시선 종목의 (등락, 대금) 서수. 결손·미참가 분은 키가 없다(지어내지 않는다). */
export type OrdinalTrack = ReadonlyMap<number, { rate: number; amount: number }>;

export function subjectOrdinalTrack(
    stocks: readonly ReplayStock[],
    date: string,
    code: string,
    range: { lo: number; hi: number },
): OrdinalTrack {
    const out = new Map<number, { rate: number; amount: number }>();
    for (let m = range.lo; m <= range.hi; m++) {
        const r = scrubSectionOf(stocks, date, fmtMin(m)).ranksOf(code);
        if (r !== null && r.rate !== null && r.amount !== null) out.set(m, { rate: r.rate, amount: r.amount });
    }
    return out;
}

/** 재적 구간(분, 양끝 포함). 끊김 = 이탈 또는 결손 — 띠가 안 그려지는 것으로 말한다(테이프 어휘). */
export interface BandSegment {
    from: number;
    to: number;
}

export function bandSegmentsOf(track: OrdinalTrack, lo: number, hi: number, rateN: number, amountN: number): BandSegment[] {
    const out: BandSegment[] = [];
    let start: number | null = null;
    for (let m = lo; m <= hi + 1; m++) {
        const r = m <= hi ? track.get(m) : undefined;
        const inZone = r !== undefined && r.rate <= rateN && r.amount <= amountN;
        if (inZone && start === null) start = m;
        if (!inZone && start !== null) {
            out.push({ from: start, to: m - 1 });
            start = null;
        }
    }
    return out;
}
