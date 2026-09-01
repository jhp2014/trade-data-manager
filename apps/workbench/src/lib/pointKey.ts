// 복기 타점 자연키 — (종목, 거래일, 분봉시각) 삼중키의 문자열 표현.
// 이 문자열은 그때그때 만드는 파생값이 아니라 **실제로 저장·전달되는 식별자**다:
//   · store  — pinned[](작업셋 순서) · hoveredPoint(배치↔시트 링크)
//   · dnd    — draggable id 의 네임스페이스 뒤 본체("chip:{key}" · "cur:{key}")
//   · 조인 키 — 시트 행 ↔ 축 배치 셀(AxisIndex) ↔ 경로 통계(Excursion.key)
// **형식의 정의는 도메인**(pointKeyOf — 서버 캐시 지문·리졸버와 같은 문자열)이고, 이 파일은 그 위의
// 클라 편의(필드명 다른 값·파싱·비교)만 소유한다. 구분자 "|" 계약이 두 곳에 있으면 한쪽만 바뀌는 사고가 난다.
import { pointKeyOf as domainPointKey, chartKeyOf as domainChartKey } from "@trade-data-manager/market/domain";

/** 타점을 가리키는 값(자연키의 구조화 형태). api/rank 의 RankPoint 와 구조 동일 — 구조적 타이핑으로 상호 통용. */
export interface PointRef {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
}

/** `${stockCode}|${date}|${time}`. 별도 타입이 아니라 별명 — DOM data-* 속성·dnd id 로도 그대로 나간다. */
export type PointKey = string;

const SEP = "|";

/** 필드 3개로 직접 — subject({code,date,time}) 처럼 필드명이 다른 값에서 만들 때. */
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

// ── 차트 키(`stockCode|date`) — 골격·차트 그룹·기준선의 소유 단위. 타점 키와 같은 사정:
// 형식의 정의는 도메인(chartKeyOf)이고, 손조립이 흩어지면 구분자 계약이 여러 곳이 된다.

/** 차트(종목,날짜)를 가리키는 값. 골격 피드 항목·차트 그룹 부착과 구조 통용. */
export interface ChartRef {
    stockCode: string;
    date: string; // YYYY-MM-DD
}

/** ChartRef(또는 구조가 같은 값) → 차트 키. */
export const chartKey = (c: ChartRef): string => domainChartKey(c);

/** 필드 2개로 직접 — Focus/subject({code,date}) 처럼 필드명이 다른 값에서 만들 때. */
export const chartKeyOf = (stockCode: string, date: string): string => domainChartKey({ stockCode, date });

// ── 행 키 — grain 이 행의 정체성을 가른 뒤(2026-08-25)의 공용 어휘.
// point 축 행 = 타점(시각 있음, 3조각 키) / day 축 행 = 차트(시각 없음, 2조각 키).
// 두 키 공간이 구분자 수로 갈려 **한 맵에 섞여도 충돌하지 않는다** — 폴백 조회(rowLookup)의 전제.

/** 줄·값 행의 키 — time 유무가 곧 grain 이라 분기 없이 양쪽을 다 만든다. */
export const rowKey = (p: { stockCode: string; date: string; time?: string }): string =>
    p.time !== undefined ? domainPointKey(p as PointRef) : domainChartKey(p);

/**
 * 행 참조로 값을 찾는 폴백 조회 — 제 행 키로 묻고(타점이면 타점 키), 없으면 차트 키로
 * (day 축: 그 하루의 행). point 축 맵엔 차트 키가 없고 day 축 맵엔 타점 키가 없어, 폴백이 잘못 맞을 수 없다.
 */
export const rowLookup = <V>(m: ReadonlyMap<string, V> | undefined, ref: { stockCode: string; date: string; time?: string }): V | undefined =>
    m === undefined ? undefined : (m.get(rowKey(ref)) ?? m.get(chartKey(ref)));

/**
 * 행 키에서 시각을 벗겨 차트 키로 — 저장된 옛 경계(day 축인데 타점 키로 저장된 것)를 읽기에서 흡수한다.
 * 이미 차트 키면 그대로.
 */
export const rowKeyToChartKey = (key: string): string => {
    const parts = key.split(SEP);
    return parts.length === 3 ? `${parts[0]}${SEP}${parts[1]}` : key;
};
