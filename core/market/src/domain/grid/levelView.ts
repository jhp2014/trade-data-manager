// core/market/domain/grid/levelView — 경로 뷰(pivots)에서 마디 뷰(레벨 쌍)를 파생한다(읽기 층, 순수).
// 규칙: .claude/specs/2026-09-05-grid-swings-v9.md §2.5 · decisions.md "자동 타점 격자" 절.
//
// **레벨** = 확정(confirmedMin ≠ null) 고점 중 가격이 그 이전 모든 고점 피벗(확정·미확정 불문)보다
// 큰 것(strict) — 굽기의 cross 판정(grid.ts)과 같은 규칙이다. 정리: 첫 스윙 이후의 확정 고점은
// "세션 최고가 갱신 봉 ⟺ 이전 고점 전부보다 큼"(예외는 선행 국면 동가 클래스 §2.6 ① 뿐).
// 미확정 꼬리 고점은 레벨이 아니다(아직 넘을 대상이 아님 — v8 유지).
//
// **레벨 저점** = (레벨.min, 다음 레벨.cross.min) 열린 구간(마지막 레벨은 세션 끝까지) 안 저점 피벗의
// 최솟값(동가 tie 는 이른 봉 — 배열이 시간 오름차순이라 strict < 비교가 그 규칙). 보통 항상 존재한다:
// 레벨은 터치 봉에서 확정되고 그 봉이 runLow 로 추적되어 확정되거나 꼬리로 남으며, 크로싱 봉에서는
// renew 규칙이 저점 확정을 강제한다(§2.2 dir=down 의 "항상 참").
// ⚠ **퇴화 예외(2026-09-05 전량 재굽기 실측 3/6,016)**: 선행 국면(클래스 ①)의 세션 최고가 아래
// 레벨은 확정 봉(저가 우선 — 자기 고가를 버린 그 봉)이 **곧 이 레벨의 크로싱 봉**일 수 있어 열린
// 구간이 빈다. 그때의 저점 = **이 레벨 바로 다음 저점 피벗**(pivots[hi+1] — 확정이 시작한 하락
// 스윙의 극값, 교대 불변식상 항상 존재·깊이 ≥ 2% 보장). 이 폴백 쌍은 "저점 봉 < 다음 크로싱" 전제
// 밖이라 파생 창 불변식(0 < renewal ≤ leg) 검사에서 제외된다(invariants.ts). 그 밖의 결손은 throw.
//
// 이 헬퍼가 v8 pivots 의 (high, low) 쌍 열을 **재현**한다(§2.6 의 두 tie 클래스만 제외, 가격 차 0.04% 안).
// 레벨 구조를 묻는 코드(levelsOf·legHighOf·legStartOf·walkOutcome)는 pivots 를 직접 순회하지 않고
// 여기를 거친다 — 경로 뷰를 직접 읽는 소비자는 결과 걷기의 밴드 Point 눌림(§10.4)뿐이다.
//
// grid.ts 만 의존하는 잎(leaf)으로 둔다 — points/windows/outcome 셋이 모두 소비자라 points.ts 에 두면
// 의존 간선이 뒤엉킨다.
import type { GridPivot, PointGrid } from "./grid.js";

/** 마디 뷰 한 칸 — 레벨 고점과 그 저점 구간의 최저 저점 피벗. index 는 grid.pivots 배열 색인. */
export interface LevelPair {
    high: GridPivot;
    low: GridPivot;
    highIndex: number;
    lowIndex: number;
    /** 저점 구간의 끝(다음 레벨의 크로싱 봉 시각, 마지막 레벨은 Infinity) — 구간 경계 규칙의 단일 출처.
     *  소비처(walkOutcome 의 품는 쌍 판정)가 여길 봐야 §2.5 경계가 바뀔 때 함께 움직인다. */
    endMin: number;
}

/** 경로 뷰 → 마디 뷰(레벨 쌍, 시간 오름차순 — 레벨 가격은 강한 단조 증가). */
export function levelViewOf(grid: PointGrid): LevelPair[] {
    const pivots = grid.pivots;
    const levelIdxs: number[] = [];
    let maxHigh = -Infinity;
    for (let i = 0; i < pivots.length; i++) {
        const p = pivots[i];
        if (p.kind !== "high") continue;
        if (p.confirmedMin !== null && p.price > maxHigh) levelIdxs.push(i);
        if (p.price > maxHigh) maxHigh = p.price;
    }
    const pairs: LevelPair[] = [];
    for (let k = 0; k < levelIdxs.length; k++) {
        const hi = levelIdxs[k];
        const high = pivots[hi];
        // 저점 구간 끝 = 다음 레벨의 크로싱 봉(열린 구간) — 마지막 레벨은 세션 끝까지.
        // 다음 레벨은 첫 레벨이 아니므로 cross 가 항상 있다(불변식 ④) — 없으면 격자 오염, 즉사.
        let endMin = Infinity;
        if (k + 1 < levelIdxs.length) {
            const nextCross = pivots[levelIdxs[k + 1]].cross;
            if (nextCross === null) throw new Error(`levelViewOf: 레벨(min=${pivots[levelIdxs[k + 1]].min})에 cross 결손 — 불변식 ④ 위반`);
            endMin = nextCross.min;
        }
        let lowIdx = -1;
        for (let j = hi + 1; j < pivots.length; j++) {
            const q = pivots[j];
            if (q.min >= endMin) break;
            if (q.kind === "low" && (lowIdx < 0 || q.price < pivots[lowIdx].price)) lowIdx = j;
        }
        if (lowIdx < 0) {
            // 퇴화 예외(머리 주석) — 확정 봉 = 크로싱 봉이라 구간이 빈 경우: 바로 다음 저점 피벗이 그 쌍의 저점.
            const next = pivots[hi + 1];
            if (next === undefined || next.kind !== "low") {
                throw new Error(`levelViewOf: 레벨(min=${high.min}) 저점 결손(구간 끝 ${endMin}) — §2.5 불변식 위반`);
            }
            lowIdx = hi + 1;
        }
        pairs.push({ high, low: pivots[lowIdx], highIndex: hi, lowIndex: lowIdx, endMin });
    }
    return pairs;
}
