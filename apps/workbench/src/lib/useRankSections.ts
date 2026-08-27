// 순위 단면 — **읽기 포트**(번들 통째 + 조회 인덱스). 테마 강도·N/M 존 판정 같은 파생은 소비자
// (테마 순위 패널·깔때기)의 몫이다 — 여긴 "어느 (날짜,분)의 단면"과 "그 단면에서 이 종목의 서수"를
// O(1)로 꺼내는 데까지만. 재료는 rank-sections 키 하나(useAllPoints 와 같은 결).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RankSection, RankSectionBundle } from "../api/rankSections.js";
import { rankSectionsQuery } from "../api/queries.js";

/** 단면 조회기 — 코드 인덱스까지 접어 둔 한 날짜·한 분. */
export interface SectionView {
    date: string;
    sealed: boolean;
    section: RankSection;
    /** 종목 → codes 배열 인덱스(서수 배열의 자리). 없으면 그날 유니버스 밖. */
    indexOf(code: string): number | null;
    /** 종목의 (등락률 서수, 거래대금 서수). 유니버스 밖·결손은 null. */
    ranksOf(code: string): { rate: number | null; amount: number | null } | null;
}

export interface RankSectionsView {
    bundle: RankSectionBundle | null;
    isLoading: boolean;
    /** 첫 로드 실패 — 빈 번들을 "단면 없음"으로 오독하지 않게 겉으로 낸다. */
    error: Error | null;
    /** (날짜, "HH:MM"[:SS 허용 — 분으로 절단]) → 단면. 없으면 null(pending·모수 밖). */
    sectionAt(date: string, time: string): SectionView | null;
    /** 굽지 않은 날짜(오늘 이후 타점) — 배지 재료. */
    pending: readonly string[];
}

const EMPTY_PENDING: string[] = [];

export function useRankSections(): RankSectionsView {
    const q = useQuery(rankSectionsQuery());
    return useMemo<RankSectionsView>(() => {
        const bundle = q.data ?? null;
        // 날짜|분 → 단면, 날짜 → 코드 인덱스. 번들이 바뀔 때 한 번 접는다(조회는 전부 O(1)).
        const byKey = new Map<string, { date: string; sealed: boolean; codeIdx: Map<string, number>; section: RankSection }>();
        if (bundle) {
            for (const d of bundle.dates) {
                const codeIdx = new Map(d.codes.map((c, i) => [c, i] as const));
                for (const s of d.sections) byKey.set(`${d.date}|${s.time}`, { date: d.date, sealed: d.sealed, codeIdx, section: s });
            }
        }
        const sectionAt = (date: string, time: string): SectionView | null => {
            const hit = byKey.get(`${date}|${time.slice(0, 5)}`);
            if (!hit) return null;
            const indexOf = (code: string): number | null => hit.codeIdx.get(code) ?? null;
            return {
                date: hit.date,
                sealed: hit.sealed,
                section: hit.section,
                indexOf,
                ranksOf: (code) => {
                    const i = indexOf(code);
                    if (i === null) return null;
                    return { rate: hit.section.rate[i], amount: hit.section.amount[i] };
                },
            };
        };
        return {
            bundle,
            isLoading: q.isLoading,
            error: (q.error as Error | null) ?? null,
            sectionAt,
            pending: bundle?.pending ?? EMPTY_PENDING,
        };
    }, [q.data, q.isLoading, q.error]);
}
