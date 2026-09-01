// 순위 단면 — **읽기 포트**(번들 통째 + 조회 인덱스). 테마 강도·N/M 존 판정 같은 파생은 소비자
// (테마 순위 패널·깔때기)의 몫이다 — 여긴 "어느 (날짜,분)의 단면"과 "그 단면에서 이 종목의 서수"를
// O(1)로 꺼내는 데까지만. 재료는 rank-sections 키 하나(테이블 키와 같은 결).
//
// ⚠ 와이어는 **접힌 행**이다(그 분의 후보 종목 ∪ 그 동료) — 행이 없는 종목은 "그 분의 관심 대상이
//   아님"이고, 행이 있는데 −1 이면 **결손**(미개장·데이터 없음)이다. 둘을 섞지 않으려고 `ranksOf` 는
//   전자를 null, 후자를 `{rate: null, ...}` 로 돌려준다(옛 "유니버스 밖 = null" 과 같은 자리).
//
// ⚠ 접기 뒤에도 행이 **100만 개**다(실측 34,202단면 × 평균 29행). 단면마다 Map 을 만들면 그만큼의
//   객체가 힙에 남으므로, 평탄 배열을 **날짜당 Int32Array 한 벌**로 옮겨 담고 조회는 이진탐색으로 한다
//   (행이 codeIdx 오름차순이라는 와이어 계약이 그 전제다). 객체 수 0, 힙은 12MB 남짓.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RankSectionBundle, WireRankSection } from "../api/rankSections.js";
import { rankSectionsQuery } from "../api/queries.js";

/** 단면 조회기 — 코드 인덱스까지 접어 둔 한 날짜·한 분. */
export interface SectionView {
    date: string;
    sealed: boolean;
    section: WireRankSection;
    /** 종목 → codes 배열 인덱스. 없으면 그 단면의 접힌 행에 없다(후보도 동료도 아님). */
    indexOf(code: string): number | null;
    /** 종목의 (등락률 서수, 거래대금 서수). 행이 없으면 null, 행이 있고 −1 이면 그 값만 null(결손). */
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
        const byKey = new Map<string, { date: string; sealed: boolean; codeIdx: Map<string, number>; data: Int32Array; from: number; to: number; section: WireRankSection }>();
        if (bundle) {
            for (const d of bundle.dates) {
                const codeIdx = new Map(d.codes.map((c, i) => [c, i] as const));
                // 날짜 한 벌로 이어 붙인다 — 단면마다 배열/Map 을 만들면 그 객체 수가 곧 힙이다.
                let total = 0;
                for (const s of d.sections) total += s.rows.length;
                const data = new Int32Array(total);
                let at = 0;
                for (const s of d.sections) {
                    const from = at;
                    for (const v of s.rows) data[at++] = v;
                    byKey.set(`${d.date}|${s.time}`, { date: d.date, sealed: d.sealed, codeIdx, data, from, to: at, section: s });
                }
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
                    // 행은 codeIdx 오름차순(와이어 계약) — stride 3 이진탐색. 없으면 그 분의 관심 밖.
                    let lo = 0;
                    let hi = (hit.to - hit.from) / 3 - 1;
                    while (lo <= hi) {
                        const mid = (lo + hi) >> 1;
                        const at = hit.from + mid * 3;
                        const k = hit.data[at];
                        if (k === i) return { rate: hit.data[at + 1] < 0 ? null : hit.data[at + 1], amount: hit.data[at + 2] < 0 ? null : hit.data[at + 2] };
                        if (k < i) lo = mid + 1;
                        else hi = mid - 1;
                    }
                    return null;
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
