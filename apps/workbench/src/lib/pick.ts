// 짚음(pick) — **모집단 안을 좁혀 보는 렌즈**. 조건으로 유도된 부분집합이고, 만드는 패널이 여럿이다
// (그룹 체인 · 시트 밴드 · 필터 칸). 소비 패널은 이걸 **강조**로 그린다(좁히든 흐리게 하든 그 패널의 선택).
//
// ## 항목 스냅샷이 아니라 **집합 참조(SetRef)를 나른다**
// 옛 채널은 만든 순간의 항목 목록을 실었다 — 멤버십이 바뀌면 강조가 낡은 스냅샷이 됐다. 이제 참조만
// 싣고 소비 패널이 리졸버(FunnelView.resolveSet)로 읽는 순간마다 푼다. 정의 저장, 결과 저장 금지.
//
// ## 선택(손)과 다른 물건이다 — 합치면 안 된다
// 선택은 클릭으로 고른 **편집 대상**(골격 무리 → 그룹 붙이기)이고, 짚음은 **렌즈**다. 하나로 합치면
// "그룹 체인으로 41건을 짚어 놓고 그 안에서 셋을 골라 다른 그룹에 붙이기"의 두 번째 걸음이 첫 걸음을
// 덮어쓴다. 그래서 겹이 셋이다: 모집단(분모) → 짚음(렌즈) → 선택(손).
//
// ## 층위 규칙 — 하루 항목은 그 차트의 **모든 타점**에 적용된다
// 깔때기의 "타점으로 펼치기"와 같은 규칙이다: 하루 조건은 그날 타점 전부에 같은 값이라 정직한 반복이다.
// 반대(타점 → 하루 롤업)는 **세는 데는** 규칙이 없어 막혀 있지만, **강조는** 다르다 — 차트 단위 선은
// "이 차트에 짚은 타점이 있다"로 불이 켜진다(수를 만드는 게 아니라 관련을 가리키는 일이라).
import type { SetRef } from "./setRef.js";
import { chartKey, pointKey } from "./pointKey.js";

/** 짚음을 만든 곳 — 강조가 왜 생겼는지 말해 주지 않으면 "왜 이것만 진하지"가 된다. */
export type PickSource = "group" | "sheet" | "skeleton" | "funnel";

/** 짚음의 항목(리졸버가 푼 결과의 낱알) — 하루면 시각이 없다(그 차트 전체). */
export interface PickItem {
    stockCode: string;
    date: string;
    time?: string;
}

export interface PickSet {
    source: PickSource;
    /** 사람이 읽는 이름 — "돌파 & 갭상승" 처럼 무엇으로 좁혔는지. */
    label: string;
    /** 무엇을 짚었나 — 살아있는 참조. 항목은 소비 패널이 읽는 순간 리졸버로 푼다. */
    ref: SetRef;
}

export const PICK_SOURCE_LABEL: Record<PickSource, string> = {
    group: "그룹",
    sheet: "시트",
    skeleton: "골격",
    funnel: "필터",
};

/**
 * 짚음 → 키 집합 셋. 소비자는 자기 층위로 물어보기만 하면 된다.
 *  · `charts`    = 모든 항목의 차트키(차트 단위 선이 켜지는 기준)
 *  · `points`    = 시각 있는 항목의 타점키
 *  · `dayCharts` = **시각 없는** 항목의 차트키 — 그 차트의 타점 전부가 켜진다
 */
export interface PickKeys {
    charts: ReadonlySet<string>;
    points: ReadonlySet<string>;
    dayCharts: ReadonlySet<string>;
}

export function pickKeys(items: readonly PickItem[]): PickKeys {
    const charts = new Set<string>();
    const points = new Set<string>();
    const dayCharts = new Set<string>();
    for (const it of items) {
        const ck = chartKey(it);
        charts.add(ck);
        if (it.time === undefined) dayCharts.add(ck);
        else points.add(pointKey({ stockCode: it.stockCode, date: it.date, time: it.time }));
    }
    return { charts, points, dayCharts };
}

/** 이 항목이 짚음에 드나 — 시각이 있으면 타점키 또는 (하루 항목이면) 그 차트, 없으면 차트키. */
export function inPick(keys: PickKeys, ref: PickItem): boolean {
    const ck = chartKey(ref);
    if (ref.time === undefined) return keys.charts.has(ck);
    return keys.points.has(pointKey({ stockCode: ref.stockCode, date: ref.date, time: ref.time })) || keys.dayCharts.has(ck);
}
