import type { CandidateDay } from "#domain";

// 후보 하루 조회 포트 — 분석의 모수를 내는 단일 출처. 읽기 전용(쓰기가 없다: 후보는 저장되는 게 아니라
// 다른 편집물들에서 **파생**된다. 별도 테이블을 두면 흔적이 늘고 줄 때마다 동기화 사고가 난다).
// 규칙과 대가는 domain/review/candidateDay.ts 에.

/** 후보 하루 조회. */
export interface CandidateDayReader {
    /**
     * 후보 하루 **전체**를 한 번에(근거 traces 포함).
     * 날짜 범위 인자를 두지 않는 이유는 group 의 listAllMemberships·rank 의 listAllLines 와 같다: 소비자
     * (깔때기 분모·시트 커버리지·골격 필터)가 모두 전체를 보므로, 왕복 1회·캐시 1개로 두면 화면마다
     * 분모가 어긋날 여지가 없다. 손이 만든 데이터라 규모도 그 전제를 지킨다.
     */
    listCandidateDays(): Promise<CandidateDay[]>;
}
