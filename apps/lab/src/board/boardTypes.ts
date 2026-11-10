// 테마 보드 공용 타입·상수·포맷.
import type { DeltaHit, RelationKind } from "./domain.js";
import { fmtPct } from "../lib/format.js";

/** 카드 종목 표시 — 접힘(머리·관련 테마만) / 펼침(주도주 · 나머지 전부). */
export type ListMode = "collapsed" | "open";

/** 관련 테마 1건(카드 아래 줄) — 관계 종류 + 이 카드에 함께 든 종목 수 / 그 테마 종목 수(유니버스 기준). */
export interface RelatedInfo {
    theme: string;
    kind: RelationKind;
    /** 이 카드 종목 중 그 테마에도 속한 수. */
    common: number;
    /** 그 테마의 종목 수. */
    total: number;
}

/** 보드의 종목 한 줄 — 그 시각의 값. 이름은 마스터 조인(useStockNameOf), 테마는 소속(membership)이 입힌 것. */
export interface BoardStock {
    code: string;
    name: string;
    themes: string[];
    /** 줄 툴팁(title) 글 — 소속 공급원이 줄 때만(복기 분류 「사후 보기」의 이유). */
    note?: string;
    changeRate: number;
    openPct: number;
    highPct: number;
    lowPct: number;
    /** 그 시각까지 누적 거래대금(원) */
    amount: number;
    isMover: boolean;
    /** 1분 신호(직전 1분 급등 + 거래대금). */
    signal: DeltaHit | null;
}

/** 보드 등락률 — 소수 1자리(부호 포함). */
export const fmtRate1 = (v: number): string => fmtPct(v, 1);
