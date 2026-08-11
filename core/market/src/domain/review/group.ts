// core/market/domain/review — 그룹(named set). **이름 붙인 집합** — 한 항목에 여럿 붙는다.
// 축(domain/rank)과 짝이자 대비: 축 = "상하 순서를 매길 수 있는 하나", 그룹 = "순서 없는 종류".
//
// 옛 태그가 이것이고, 여기에 **관계와 위치**가 붙어 그룹이 됐다. 태그로는 그룹 안 그룹도, 두 그룹이
// 얼마나 겹치는지(징검다리)도 볼 수 없었다 — 관계를 담을 자리가 없었기 때문이다.
//   · parent  : 그룹 안 그룹. 연속성을 좌표가 아니라 **계층의 깊이**로 표현한다(임의로 잘게 쪼갠다).
//   · map·x·y : 어느 평면에 어디쯤. **시각화용이지 데이터가 아니다** — 붙여 놓은 둘은 "닮았다"는 주장이지만,
//               멀리 있는 둘은 "안 닮았다"가 아니라 **아직 아무 말도 안 한 것**이다.
//   · 징검다리 : 저장하지 않는다. 두 그룹의 **멤버 겹침으로 계산**된다(A·B 를 둘 다 가진 항목).
//
// 이름은 손잡이지 주장이 아니다 — "미정1" 로 지어도 된다. 이름 짓는 비용이 낮아야 잘게 쪼갤 수 있고,
// 그래야 "하나의 이름으로 디테일을 계속 구분할 수 없다"는 원래 문제를 피한다.

/** 차트 참조 — (종목, 날짜). 하루 단위 소유물(골격·차트 앵커·하루 그룹)의 키. */
export interface ChartRef {
    stockCode: string;
    date: string; // YYYY-MM-DD
}

/**
 * 그룹의 멤버가 무엇이냐 — 하루냐 타점이냐.
 * ⚠ **맵이 아니라 그룹이 든다**: 그룹은 한 층위에 대한 판단이지 맵에 올려야 비로소 그렇게 되는 게 아니다.
 * 맵에서 내려받게 하면 아직 안 올린 그룹(정상 상태)의 층위가 없어 첫 부착이 암묵적으로 정하게 된다.
 */
export type GroupScope = "day" | "point";

/** 그룹 하나(저장됨 → id 필수). name 은 전역 유일. */
export interface Group {
    id: string;
    name: string;
    scope: GroupScope;
    /** 그룹 안 그룹. null = 최상위. 부모는 같은 맵이어야 하고 순환하면 안 된다(저장 경로가 본다). */
    parentId: string | null;
    /** 어느 평면에 올렸나. null = 아직 안 올림(정상 상태 — 만들기와 올리기는 별개). */
    mapId: string | null;
    x: number | null;
    y: number | null;
}

/** 그룹에 든 항목의 키 — scope=day 면 시각이 없다. */
export interface GroupItemRef extends ChartRef {
    time?: string; // HH:MM:SS
}

/**
 * 한 항목에 붙은 그룹들(멤버십 피드 항목). 전 항목을 한 번에 받아 화면이 키로 접는다.
 * 하루 소속과 타점 소속이 **한 피드**에 온다(시각 유무로 갈린다) — 옛날엔 정션이 둘이라 피드도 둘이었다.
 */
export interface GroupMembership extends GroupItemRef {
    groupIds: string[];
}

/** 맵 위에서 그룹을 옮긴 결과. 이동은 언제나 배열 — 여럿을 한 번에 끌면 낱개 요청은 부분 실패를 낳는다. */
export interface GroupMove {
    id: string;
    x: number;
    y: number;
}

/** 그룹을 평면에 올리기(값) / 내리기(null). 올릴 때 좌표를 함께 정한다. */
export type GroupPlacement = { mapId: string; x: number; y: number } | null;

/**
 * 두 그룹이 멤버를 얼마나 공유하나 — **징검다리**. 저장하지 않고 멤버십에서 계산한다.
 * count 가 굵기가 되고, 굵을수록 두 그룹이 실은 한 덩어리에 가깝다는 뜻이다.
 */
export interface GroupOverlap {
    aId: string;
    bId: string;
    count: number;
}

/** 항목 키 문자열 — 하루 소속은 시각이 없다. 멤버십을 접고 겹침을 세는 기준. */
export const groupItemKey = (item: GroupItemRef): string =>
    `${item.stockCode}|${item.date}${item.time ? `|${item.time}` : ""}`;

/**
 * 멤버십 피드에서 그룹 쌍의 겹침을 센다(같은 항목이 A·B 둘 다에 들면 1).
 * 한 항목의 그룹이 k 개면 쌍은 k(k-1)/2 개 — 손으로 붙이는 수라 k 는 작고, 전체는 항목 수에 선형이다.
 */
export function overlapsOf(memberships: readonly GroupMembership[]): GroupOverlap[] {
    const byPair = new Map<string, number>();
    for (const m of memberships) {
        const ids = [...new Set(m.groupIds)].sort();
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const k = `${ids[i]}|${ids[j]}`;
                byPair.set(k, (byPair.get(k) ?? 0) + 1);
            }
        }
    }
    return [...byPair].map(([k, count]) => {
        const [aId, bId] = k.split("|");
        return { aId: aId!, bId: bId!, count };
    });
}
