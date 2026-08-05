// 복기 타점 자연키 — (종목, 거래일, 분봉시각) 삼중키의 문자열 표현.
// 이 문자열은 그때그때 만드는 파생값이 아니라 **실제로 저장·전달되는 식별자**다:
//   · store  — pinned[](작업셋 순서) · hoveredPoint(배치↔시트 링크)
//   · dnd    — draggable id 의 네임스페이스 뒤 본체("chip:{key}" · "cur:{key}")
//   · 조인 키 — 시트 행 ↔ 축 배치 셀(AxisIndex) ↔ 경로 통계(Excursion.key)
// **형식의 정의는 도메인**(pointKeyOf — 서버 캐시 지문·리졸버와 같은 문자열)이고, 이 파일은 그 위의
// 클라 편의(필드명 다른 값·파싱·비교)만 소유한다. 구분자 "|" 계약이 두 곳에 있으면 한쪽만 바뀌는 사고가 난다.
import { pointKeyOf as domainPointKey } from "@trade-data-manager/market/domain";

/** 타점을 가리키는 값(자연키의 구조화 형태). api/rank 의 RankPoint 와 구조 동일 — 구조적 타이핑으로 상호 통용. */
export interface PointRef {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
}

/** `${stockCode}|${date}|${time}`. 별도 타입이 아니라 별명 — DOM data-* 속성·dnd id 로도 그대로 나간다. */
export type PointKey = string;

const SEP = "|";

/** 필드 3개로 직접 — ActivePoint({code,date,time}) 처럼 필드명이 다른 값에서 만들 때. */
export const pointKeyOf = (stockCode: string, date: string, time: string): PointKey => domainPointKey({ stockCode, date, time });

/** PointRef(또는 그와 구조가 같은 값) → 키. */
export const pointKey = (p: PointRef): PointKey => domainPointKey(p);

/**
 * 키 → PointRef. 형태가 안 맞으면 null — 키의 출처가 사용자 조작(dnd id·영속된 pinned)이라
 * 깨진 값이 들어올 수 있고, 그때 필드가 undefined 인 타점을 만들어 조용히 퍼뜨리면 안 된다.
 */
export function parsePointKey(key: PointKey): PointRef | null {
    const parts = key.split(SEP);
    if (parts.length !== 3) return null;
    const [stockCode, date, time] = parts;
    return stockCode && date && time ? { stockCode, date, time } : null;
}

/** 두 타점이 같은가(키 비교). 필드 3개를 손으로 &&로 잇는 자리를 대체. */
export const samePoint = (a: PointRef, b: PointRef): boolean => pointKey(a) === pointKey(b);
