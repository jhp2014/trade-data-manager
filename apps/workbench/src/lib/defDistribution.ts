// 정의 레일의 분포 모수(순수) — 게이트 밖 노브(자격 시각·근접)의 막대 재료.
//
// **규칙 하나: 각 레일의 모수는 그 노브를 최대 개방한 정의로 굽는다.** 안 그러면 컷을 끄는 동안
// 막대가 같이 움직여 "드래그 전에 보인다"는 스트립의 존재 이유가 무너진다(게이트 분포가
// `PointCandidateDef` 로 게이트를 타입상 못 보게 한 계약의 노브별 일반화 — gateDistribution.ts).
//
// ⚠ 게이트와 달리 **등가 정리가 없다**: 컷을 좁히면 그 레벨의 시그널이 사라지는 게 아니라 뒤 캔들로
// 이동할 수 있다(pointsOf 머리 주석). 그래서 화면 문구는 "소멸"이 아니라 "컷 밖 N"이고, 그 N 은
// 소멸의 하한도 상한도 아닌 **현재 그 자리에 선 시그널 수**다.
import { bandDepthsOf, pointsOf, type PointGrid, type PointJudgeDef, type QualifyWindowDef } from "@trade-data-manager/market/domain";

type ByDate = ReadonlyMap<string, ReadonlyMap<string, PointGrid>>;

/**
 * 자격 시각 레일의 모수 — **창을 통째로 연** 정의로 판정한 시그널들의 시각(분).
 * 창만 열고 나머지 노브(게이트·병합·양봉·근접)는 현재값 그대로 — 레일이 말하는 건 "지금 정의에서
 * 시각 창만 넓히면 시그널이 어디에 서는가"다.
 */
export function buildSignalMinuteDist(byDate: ByDate, def: PointJudgeDef): number[] {
    const open: PointJudgeDef = { ...def, qualifyWindows: [] }; // 빈 목록 = 전부 통과(이 필드의 어휘)
    const out: number[] = [];
    for (const byCode of byDate.values()) for (const grid of byCode.values()) for (const p of pointsOf(grid, open)) out.push(p.min);
    return out;
}

/**
 * 근접 컷의 **열린 끝** — 후보 조건이 `high > M×(1−m'/100)` ⟺ `d < m'` 라, 깊이가 컷과 같은 봉은
 * 후보가 아니다. 가격이 정수 원이라 d 동률(특히 d=0 = 전고점과 같은 고가)이 흔해서, 닫힌 끝으로 세면
 * "근접 0% 인데 후보 +수백"이라는 거짓 정산이 나온다. 레일 정산이 이 함수를 그대로 쓴다.
 */
export const approachInside = (v: number, _lo: number, hi: number): boolean => v < hi;

/** 근접 레일의 모수 — 밴드 **진입** 봉의 깊이(%)와, 깊이와 무관하게 늘 후보인 정확 돌파 수. */
export function buildApproachDist(byDate: ByDate, def: QualifyWindowDef): { depths: number[]; strict: number } {
    const depths: number[] = [];
    let strict = 0;
    for (const byCode of byDate.values()) {
        for (const grid of byCode.values()) {
            const d = bandDepthsOf(grid, def);
            for (const v of d.depths) depths.push(v);
            strict += d.strict;
        }
    }
    return { depths, strict };
}
