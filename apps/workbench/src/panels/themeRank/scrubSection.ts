// 스크럽 단면 어댑터 — /day-replay(ReplayStock[])에서 임의 분의 순위 단면을 **core rankSectionOf 로**
// 재계산한다. 자체 계산 로직 0 — 여기에 정렬·동점 규칙을 다시 쓰면 그 순간 서수 출처가 둘이 된다
// ("타점 분에서만 미묘하게 다른 값"이라는 최악의 버그 모양. 옛 서버 구운 번들 /rank-sections 은
// 2026-09-26 은퇴 — 이제 모든 단면이 이 즉석 계산 한 경로다).
import type { RankSection } from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { sectionAtMinute } from "./sectionSeries.js";

/** 산점 좌표용 단면 모양 — 이 파일의 산출물 계약(소비자 = ThemePlaneView 산점). */
interface SectionRanks {
    ranksOf(code: string): { rate: number | null; amount: number | null } | null;
}

/** 재계산 단면 + O(1) 조회 — 산점·툴팁이 같은 물건을 본다. */
export interface ScrubSection extends SectionRanks {
    section: RankSection;
    /** 종목 → 배열 인덱스(산점이 점을 그릴 때 서수를 직접 꺼내는 용도). */
    indexOf(code: string): number | null;
    codes: readonly string[];
}

/** "HH:MM[:SS]" → 자정 기준 분. */
const hmOf = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * 표시 분 — 빈 화면을 만들지 않는 사다리(사용자 확정):
 * 전역 시각(focus.time) → (하루 선택이면) 그날 첫 타점 → (타점도 없으면) 스냅샷 마지막 봉.
 */
export function defaultMinuteOf(
    focusTime: string | null,
    pointTimes: readonly string[],
    lastSnapshotMinute: number | null,
): number | null {
    if (focusTime) return hmOf(focusTime);
    if (pointTimes.length > 0) return hmOf(pointTimes[0]);
    return lastSnapshotMinute;
}

/** (스냅샷, 날짜, "HH:MM"[:SS 허용 — 분 절단]) → 단면. 계산은 sectionSeries 공용 캐시를 거친다(같은 분은 한 번만). */
export function scrubSectionOf(stocks: readonly ReplayStock[], date: string, time: string): ScrubSection {
    const section = sectionAtMinute(stocks, date, hmOf(time));
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
