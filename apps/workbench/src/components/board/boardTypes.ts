// 보드 카드 공용 타입·상수·포맷 — BoardCard / StockLayout / 패널이 공유.
import type { DeltaHit, RelationKind } from "@trade-data-manager/market/domain";

export const AXIS_LO = -5; // 눕힌 캔들 축 하한
export const AXIS_HI = 30; // 캔들/분포 축 상한

// 카드 종목 표시 단계 — market-eye: 접힘(분포바만) → 주도주만 → 전체.
export type ListMode = "collapsed" | "movers" | "all";

/** 관련 테마 1건(하단 InfoLine 렌더용) — 포함관계 종류 + 그 테마 주도주/전체. */
export interface RelatedInfo {
    theme: string;
    kind: RelationKind;
    movers: number;
    total: number;
}

export interface BoardStock {
    code: string;
    name: string;
    market: string | null;
    themes: string[];
    changeRate: number;
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: number; // 거래대금(원) — EOD=일봉, 복기=누적
    isMover: boolean;
    /** 1분 델타 주목 신호(복기 보드만). EOD 는 없음. */
    signal?: DeltaHit | null;
    /** 필터 조건 불일치(흐림 모드) — 행을 흐릿하게. */
    dim?: boolean;
    /** 거래대금 구간별 EOD 카운트(길이 7) — 이슈 보드만. 거래대금 hover 시 막대그래프. */
    buckets?: number[];
    /** 이 보드 날짜에 복기 타점/가격선 주석이 있는 종목(이름 하이라이트). 타점·가격선 구분 없이 통합. */
    annotated?: boolean;
    /** 배제 필터에 걸린 사유(dim 행에 태그로 표시). 어떤 술어에 걸렸나. */
    excludedBy?: string[];
}

// 보드 등락률 — 소수 1자리(부호 포함). 차트는 2자리(fmtRate) 유지, 보드만 간결하게.
export function fmtRate1(v: number): string {
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
