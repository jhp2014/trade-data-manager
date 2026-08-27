// 순위 단면 번들 — GET /rank-sections 의 계약.
//
// ## 서버는 서수 원료만 굽는다 — N/M·테마·임계값은 전부 클라 읽기 시점 파생
// 단면 = 타점이 존재하는 (날짜, 분)마다 그날 유니버스 전 종목의 등락률·거래대금 **서수 전체**
// (UN 기준 · 내림차순 · 경쟁 순위(동점 1,1,3) · carry-forward 참가/결손 제외 — core rankSectionOf 가
// 유일한 계산 주체고 클라가 /day-replay 로 즉석 계산할 때도 같은 함수를 쓴다). top-N 컷이 저장물에
// 없어서 캐시가 N/M 에 불변이고, 시트 테마 멤버십(가변)도 여기 안 굽는다 — 그게 이 설계의 존재 이유다
// (decisions.md "테마 강도·순위 단면").
//
// ## 크기 절약의 핵심 = 날짜당 코드 테이블 1벌
// 단면(sections[i])의 rate/amount 는 codes 와 **같은 길이·같은 순서**의 서수 배열이다 — 단면마다
// 코드를 반복하면 페이로드가 3~4배가 된다. null = 그 분 결손(아직 미개장), n = 분모(non-null 수).
//
// ## sealed / pending — 분모(M)가 틀린 값을 조용히 주지 않는다
// sealed=false: 그 날짜 스냅샷이 아직 파일로 굳지 않아(수집 미완료) 서수가 부분 유니버스 위에서
// 계산됐을 수 있다 — 서버도 파일로 남기지 않고, 클라는 배지로 드러낼 수 있다.
// pending: 오늘(KST) 이후 날짜의 타점 — 굽지도 서빙하지도 않는다(잠정 M 으로 필터를 판정하지 않는다).
//
// version 은 계산 규칙 버전(수동 무효화 손잡이) — 재료(분봉 원주가·기준가) 수리는 자동 감지되지 않으므로
// 이 값 상향(또는 캐시 삭제)이 처방이다(앵커 무관 계산 축과 같은 성질).
import type { RankSection } from "@trade-data-manager/market";

export type { RankSection } from "@trade-data-manager/market";

/** 날짜 하나의 단면 묶음. codes = 그날 유니버스(스냅샷 순서). */
export interface RankSectionDate {
    date: string;
    /** 스냅샷이 굳은(수집 완료) 날짜인가 — false 면 서수가 부분 유니버스 위일 수 있다. */
    sealed: boolean;
    codes: string[];
    sections: RankSection[];
}

/** 전체 번들 — 클라가 통째 로드(수백 KB raw, 회선은 gzip). */
export interface RankSectionBundle {
    /** 계산 규칙 버전 — 서버 캐시와 동기(클라는 표시만). */
    version: number;
    dates: RankSectionDate[];
    /** 굽지 않은 날짜(오늘 이후의 타점) — "결손은 결손"으로 드러낸다. */
    pending: string[];
}
