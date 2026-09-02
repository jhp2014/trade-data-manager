// 자동 타점 격자 번들 — GET /point-grids 의 계약.
//
// ## 클라가 드는 건 격자(압축물)뿐 — Point·특징은 전부 클라 읽기 시점 파생
// 격자 = 앵커 차트(종목,날짜)당 ① 2% zigzag 피벗(고점엔 직전 고점의 크로싱 봉) ② floor(20억) 이상 대금의
// 신고가 캔들 목록 ③ 기준선 첫 터치 봉 — 기록 봉마다 세션 누적 대금(cum)을 들고, 대금 창(leg·갱신·돌파)은
// 굽지 않고 클라가 두 봉의 차로 파생한다(core `windows.ts`). Point 판정(게이트·제외 창·축약 병합)은 core `pointsOf` 가 유일한 계산 주체고
// 서버(recon)·클라가 같은 함수를 쓴다. 게이트를 저장물에 안 구워서 번들이 판정 정의에 불변이다
// (decisions.md "자동 타점 격자" — 순위 단면이 N/M 을 모르는 것과 같은 설계).
//
// ## 튜플 인코딩 — 위치가 계약
// 차트당 소형 객체 수십 개의 키 반복을 걷는다(6,016차트 기준 raw 절반 이하). 필드 순서·의미는
// core `domain/grid/codec.ts` 의 타입 주석이 원본이고, 인코더(서버)·디코더(클라)도 그 한 벌을 쓴다 —
// 여기서 타입만 재노출한다(이 패키지는 런타임 코드 0). 대금류는 string(BigInt 무손실).
//
// version 은 검출 규칙 버전(POINT_GRID_CALC_VERSION 동기) — 재료 수리는 자동 감지되지 않으므로
// 이 값 상향(또는 캐시 삭제)이 처방이다(순위 단면과 같은 성질).
import type { WireChartGrid } from "@trade-data-manager/market";

// WirePivot 은 8칸: [kind, min, price, confirmedMin(−1=null), cum, crossMin(−1=null), crossTv("-1"), crossCum("-1")] — 위치 계약은 core codec.ts 한 곳.
export type { WirePivot, WireNewHigh, WireChartGrid, PointGrid, GridPivot, GridNewHigh, GridBarMark, DerivedPoint, PointDefinition } from "@trade-data-manager/market";

/** 날짜 하나의 격자 묶음. */
export interface PointGridDate {
    date: string;
    charts: WireChartGrid[];
}

/** 전체 번들 — 클라가 통째 로드(raw ~수 MB, 회선은 gzip). */
export interface PointGridBundle {
    /** 검출 규칙 버전 — 서버 캐시와 동기(클라는 표시만). */
    version: number;
    dates: PointGridDate[];
}
