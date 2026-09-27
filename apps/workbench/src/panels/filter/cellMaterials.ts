// 셀 재료 어댑터 — core 엔진(`evaluateCells`)이 요구하는 콜백 둘을 **기존 단일 출처**에 잇는다.
// 계산 규칙은 여기 없다(core 소유). 재계산기를 새로 쓰면 그 순간 "같은 화면에서 숫자가 둘"이 된다:
//  · 서수/존 순위 = `sectionAtMinute`(시장 단면 판과 같은 stocks 배열 참조 → WeakMap 단면 캐시 공유)
//    + core `themeZone.themeAnswerAt`(존 판정식은 타점 정보 패널과 같은 벌 — enter 의 min−1 비교까지 여기).
//  · 돌파 사슬의 기준선 = `/point-grids` 의 `grid.base`(서버 리졸버 산출 — 기준선 편집 시 이미 무효화된다).
//
// 순수 함수인 이유: 훅이 아니어야 dom 테스트 없이 잠글 수 있고, 호출부(useCellSet)의 memo 신원이
// 재료 한 벌로 모인다(어댑터가 훅이면 의존 배열이 갈려 매 렌더 새 참조가 된다).
import { hmsToMinute, themeAnswerAt, type CellMaterials } from "@trade-data-manager/market/domain";
import type { Group, GroupMembership, PointGroupMembership } from "../../api/groups.js";
import { expandWithAncestors } from "../../lib/groupTree.js";
import type { ReplayStock } from "../../api/dayReplay.js";
import type { ThemeProjection } from "@trade-data-manager/market/domain";
import { themeSectionAt } from "../themeRank/sectionSeries.js";

/**
 * 하루 재료 한 벌. `themeAt` 은 **비싼 쪽**이라 엔진의 단락 뒤에서만 불린다 — 분 단면은
 * sectionSeries 공용 캐시(표시와 같은 물건), 파라미터는 술어 payload 로 온다(옛 공용 노브 사다리 폐지).
 */
export function cellMaterialsOf(
    stocks: readonly ReplayStock[],
    date: string,
    proj: ThemeProjection,
    /** 돌파 사슬의 기준선(원주가) — 안 쓰면 생략(부재 = 기준선 없음 → 이름표가 전부 「고가 돌파」). */
    baselineOf?: (code: string) => number | null,
    /** 라벨 색인(그날) — 안 쓰면 생략(부재 = 라벨 재료 없음 → 라벨 술어는 거짓). */
    labels?: LabelIndex,
): CellMaterials {
    return {
        ...(baselineOf ? { baselineOf } : {}),
        ...(labels ? { labelAt: labelAtOf(labels) } : {}),
        // 테마 술어 — 판정은 core themeAnswerAt 하나(계산 규칙을 여기 두지 않는다 — enter 의 min−1 비교 포함).
        // 단면은 sectionSeries 공용 캐시라 표시(시장 단면 판)와 같은 물건을 보고, min−1 단면도 분당 캐시에 얹힌다.
        themeAt: (code, min, p) => themeAnswerAt(code, (m) => themeSectionAt(stocks, date, m, p.window), min, p, proj),
    };
}

/**
 * 그날의 라벨 색인 — 셀 판정이 O(1) 이 되게 **적용 이름(직접 ∪ 조상)** 으로 미리 편다. 계층 상속
 * 규칙은 groupTree 한 벌(배정 팝오버·차트 칩과 같은 자 — 조건판만 다른 상속을 쓰면 화면끼리 어긋난다).
 *  · day   : 종목 → 그 차트(종목·날짜)에 적용되는 그룹 이름들
 *  · point : `종목|분` → 그 좌표에 적용되는 그룹 이름들(분 = 자정기준, 엔진 셀과 같은 자)
 */
export interface LabelIndex {
    day: ReadonlyMap<string, ReadonlySet<string>>;
    point: ReadonlyMap<string, ReadonlySet<string>>;
}

export function labelIndexOf(
    date: string,
    memberships: readonly GroupMembership[],
    pointMemberships: readonly PointGroupMembership[],
    groupByName: ReadonlyMap<string, Group>,
): LabelIndex {
    const add = (m: Map<string, Set<string>>, key: string, names: readonly string[]): void => {
        let s = m.get(key);
        if (!s) m.set(key, (s = new Set()));
        for (const n of expandWithAncestors(names, groupByName)) s.add(n);
    };
    const day = new Map<string, Set<string>>();
    for (const m of memberships) if (m.date === date) add(day, m.stockCode, m.groupNames);
    const point = new Map<string, Set<string>>();
    for (const m of pointMemberships) if (m.date === date) add(point, `${m.stockCode}|${hmsToMinute(m.time)}`, m.groupNames);
    return { day, point };
}

/**
 * **공유** 색인 — (멤버십 참조 × 좌표 멤버십 참조 × 사전 참조 × 날짜)로 메모한다. 소비자(보는 집합·차트·
 * 탐색판·조건 그룹 열)마다 따로 세우면 색인 객체가 갈려 평가 메모 키(세대)가 갈리고, 같은 식이 소비자 수만큼
 * 다시 평가된다(2026-09-27 리뷰 M1 — 테마 투영·격자처럼 재료 객체는 한 벌이어야 캐시가 모인다).
 * 참조가 바뀌면(라벨 토글·재조회) WeakMap 이 옛 색인을 놓는다.
 */
const SHARED = new WeakMap<object, WeakMap<object, WeakMap<object, Map<string, LabelIndex>>>>();
export function sharedLabelIndex(
    date: string,
    memberships: readonly GroupMembership[],
    pointMemberships: readonly PointGroupMembership[],
    groupByName: ReadonlyMap<string, Group>,
): LabelIndex {
    let a = SHARED.get(memberships);
    if (!a) SHARED.set(memberships, (a = new WeakMap()));
    let b = a.get(pointMemberships);
    if (!b) a.set(pointMemberships, (b = new WeakMap()));
    let byDate = b.get(groupByName);
    if (!byDate) b.set(groupByName, (byDate = new Map()));
    let ix = byDate.get(date);
    if (!ix) {
        ix = labelIndexOf(date, memberships, pointMemberships, groupByName);
        byDate.set(date, ix);
        // 날짜 축은 걷기로 계속 는다 — 한 참조 세대 안에서 최근 몇 날만 쥔다.
        if (byDate.size > 8) byDate.delete(byDate.keys().next().value!);
    }
    return ix;
}

/** 색인 → 엔진 콜백. groups 는 OR — 하나라도 적용 이름에 있으면 참. */
export const labelAtOf = (ix: LabelIndex): NonNullable<CellMaterials["labelAt"]> =>
    (code, min, scope, groups) => {
        const applied = scope === "day" ? ix.day.get(code) : ix.point.get(`${code}|${min}`);
        return applied !== undefined && groups.some((g) => applied.has(g));
    };
