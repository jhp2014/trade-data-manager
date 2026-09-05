// 게이트 분포(순수) — 정의층 스트립의 재료: 레벨당 최대 자격 대금(core levelMaxTvOf)의 게이트별 모음.
//
// 이것이 정의층에서 **정직하게 성립하는 유일한 분포**다: 레벨이 완전히 소멸하는 조건(max tv < gate)이
// 게이트에 대해 단조라, 컷을 옮기기 전에 "여기까지 조이면 레벨 N개 소멸"이 보인다. 봉 이동 수는
// 비단조라 세지 않는다(decisions.md 「깔때기 조건 UI」 2026-09-06). 슬롯 2 는 모수가 아니다 —
// 그 후보 집합 자체가 게이트의 함수라 드래그 중 그림이 흔들린다(core LevelGateStat 주석).
//
// def 가 `PointCandidateDef`(게이트를 타입상 못 봄)인 것이 계약의 몸통 — 게이트 드래그 중 분포 불변.
import { levelMaxTvOf, type PointCandidateDef, type PointGrid } from "@trade-data-manager/market/domain";

const EOK = 100_000_000;

export interface GateDistribution {
    /** 돌파(레벨 0)의 최대 자격 대금(억원) — 낟알 = **레벨 0**(차트당 ≤1). "차트"가 아니다:
     *  레벨 0 소멸 = 그 차트의 돌파 시그널 소멸이지 차트 소멸이 아니다(재돌파 시그널은 남을 수 있다). */
    baseline: number[];
    /** 재돌파(레벨 ≥1) — 낟알 = **레벨**(차트당 여럿일 수 있다). 위아래 줄이 다른 자다 — 라벨이 말한다. */
    renewal: number[];
    /** 로그 x 도메인(억원) — 두 줄이 **같은 자**를 쓴다(줄끼리 견줘 읽히게). 값이 하나도 없으면 null. */
    domain: { min: number; max: number } | null;
}

export function buildGateDistribution(
    byDate: ReadonlyMap<string, ReadonlyMap<string, PointGrid>>,
    def: PointCandidateDef,
): GateDistribution {
    const baseline: number[] = [];
    const renewal: number[] = [];
    for (const byCode of byDate.values()) {
        for (const grid of byCode.values()) {
            for (const s of levelMaxTvOf(grid, def)) (s.gate === "baseline" ? baseline : renewal).push(s.maxTv / EOK);
        }
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of baseline) { if (v < min) min = v; if (v > max) max = v; }
    for (const v of renewal) { if (v < min) min = v; if (v > max) max = v; }
    // 접기 없는 로그 [min, max] — 실측(recon:gate-dist) max ~6,600억은 floor 20억에서 2.5디케이드라
    // 로그만으로 읽힌다(p99 접기는 선형 척도의 처방 — 여기선 불필요한 기교).
    return { baseline, renewal, domain: min <= max && min > 0 ? { min, max } : null };
}

/**
 * 로그 프랙션 → 값(억원) — `valueToFrac(…, "higher", "log")` 의 역함수. 스트립 칸 클릭이 커밋할
 * 게이트 값을 계산한다(왕복 정합은 테스트가 못 박는다 — 갈리면 클릭 커밋 뒤 컷선이 딴 칸에 선다).
 * span 0(단일값 도메인)이면 그 값 — 역함수가 정의되는 유일한 답.
 */
export function gateValueAt(frac: number, domain: { min: number; max: number }): number {
    const lo = Math.log10(domain.min);
    const span = Math.log10(domain.max) - lo;
    if (span <= 0) return domain.min;
    return 10 ** (lo + Math.max(0, Math.min(1, frac)) * span);
}
