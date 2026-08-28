// 스크럽 단면 어댑터 — /day-replay(ReplayStock[])에서 임의 분의 순위 단면을 **core rankSectionOf 로**
// 재계산한다. 자체 계산 로직 0 — 여기에 정렬·동점 규칙을 다시 쓰면 그 순간 서수 출처가 둘이 된다
// (구운 번들과 "타점 분에서만 미묘하게 다른 값"이라는 최악의 버그 모양).
//
// 화면(산점)은 **항상 이 재계산 단면**을 그린다 — 번들(/rank-sections)에는 타점 분의 단면만 있어
// 스크럽하는 순간 어차피 이 경로로 넘어가고, 두 경로를 섞으면 위 사고 모양이 된다. 번들은 모수 전체를
// 도는 카운트(useThemeStrengthStats) 전용. 두 재료가 같다는 근거: dayBoards.replayBoard 와 RankSections
// 가 같은 derived.snapshot(date).stocks[].minutes 를 쓴다.
import { rankSectionOf, type RankSection } from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import type { SectionRanks } from "../../lib/themeStrength.js";

/** 재계산 단면 + O(1) 조회 — themeStrength 의 SectionRanks 를 충족(번들 단면과 같은 함수에 들어간다). */
export interface ScrubSection extends SectionRanks {
    section: RankSection;
    /** 종목 → 배열 인덱스(산점이 점을 그릴 때 서수를 직접 꺼내는 용도). */
    indexOf(code: string): number | null;
    codes: readonly string[];
}

/** "HH:MM[:SS]" → 자정 기준 분. */
const hmOf = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * 스크럽의 기본 분 — 빈 화면을 만들지 않는 사다리(사용자 확정):
 * 타점 시각 → (하루 선택이면) 그날 첫 타점 → (타점도 없으면) 스냅샷 마지막 봉.
 */
export function defaultMinuteOf(
    subjectTime: string | null,
    pointTimes: readonly string[],
    lastSnapshotMinute: number | null,
): number | null {
    if (subjectTime) return hmOf(subjectTime);
    if (pointTimes.length > 0) return hmOf(pointTimes[0]);
    return lastSnapshotMinute;
}

/** (스냅샷, 날짜, "HH:MM"[:SS 허용]) → 단면. 비용 ≈ 이진탐색 ~500회 + 정렬 2회 ≈ 0.5ms — 분 단위 memo 로 충분. */
export function scrubSectionOf(stocks: readonly ReplayStock[], date: string, time: string): ScrubSection {
    const section = rankSectionOf(stocks, date, time);
    const codes = stocks.map((s) => s.code);
    const idx = new Map(codes.map((c, i) => [c, i] as const));
    const indexOf = (code: string): number | null => idx.get(code) ?? null;
    return {
        section,
        codes,
        indexOf,
        ranksOf: (code) => {
            const i = idx.get(code);
            if (i === undefined) return null;
            return { rate: section.rate[i], amount: section.amount[i] };
        },
    };
}
