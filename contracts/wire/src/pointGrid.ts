// 자동 타점 격자 번들 — GET /point-grids 의 계약.
//
// ## 클라가 드는 건 격자(압축물)뿐 — Point·특징은 전부 클라 읽기 시점 파생
// 격자 = 앵커 차트(종목,날짜)당 ① 2% zigzag 피벗 ② floor(20억) 이상 대금의 신고가 캔들 목록
// ③ 기준선 첫 터치. Point 판정(게이트·제외 창·축약 병합)은 core `pointsOf` 가 유일한 계산 주체고
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

export type { WirePivot, WireNewHigh, WireChartGrid, PointGrid, GridPivot, GridNewHigh, DerivedPoint, PointDefinition } from "@trade-data-manager/market";

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
