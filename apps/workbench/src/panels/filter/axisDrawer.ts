// 집합 편성 보드의 **서랍**(순수) — 층위 칸마다 축을 치워 두는 자리. 조건이 아니라 보기 상태라
// 로컬에만 산다(axisOrder 와 같은 결).
//
// **숨김은 조건을 안 건드린다.** 서랍에 든 축의 조건도 살아서 계속 걸린다 — 그래서 서랍 머리가
// "조건 N"을 세어 말한다. 안 보이는데 깔때기 숫자가 달라지는 상태가 이 설계에서 유일하게 위험한
// 지점이고, 그걸 배지 하나로 막는다(조건까지 같이 지우는 안은 기각 — 자리만 치우고 싶은 쓰임이 있다).
//
// 저장은 **id 목록 하나**다(층위별로 안 가른다): 층위는 축 정의(scope)가 이미 말하고, 보드가 그 층위
// 칸으로 걸러 그린다 — axisOrder 와 같은 이유.
//
// ⚠ 말 겹침 주의: 같은 패널의 주석에서 **걸린 필터 막대 목록**(FilterBars)도 "아래에서 올라오는 서랍"이라
// 부른다. 화면 글자로 "서랍"이라 적히는 건 여기(축 서랍)뿐이지만, 글로 얘기할 땐 둘을 갈라 부를 것.
import type { Grain } from "./stage.js";

/** 서랍 pref 파싱(localStorage) — 문자열 배열이 아니면 통째로 버린다(기본 = 전부 보임). */
export const parseDrawerIds = (o: unknown): string[] | null =>
    Array.isArray(o) && o.every((k) => typeof k === "string") ? (o as string[]) : null;

/** 층위별 펼침 상태 파싱. 값이 boolean 이 아닌 키는 통째로 버린다(기본 = 전부 접힘). */
export const parseDrawerOpen = (o: unknown): Partial<Record<Grain, boolean>> | null =>
    o !== null && typeof o === "object" && !Array.isArray(o) && Object.values(o).every((v) => typeof v === "boolean")
        ? (o as Partial<Record<Grain, boolean>>)
        : null;

/**
 * 죽은 축 id 청소 — 축이 지워지면 서랍에 유령 키가 남는다. 바뀔 게 없으면 **같은 배열을 그대로** 돌려준다
 * (setState 가 새 참조를 받으면 영속 쓰기가 무의미하게 돈다).
 * ⚠ 호출부는 축 목록이 **다 온 뒤에만** 부른다 — 로딩 중에 부르면 아직 안 온 축을 유령으로 오인해 지운다.
 * `protectedKeys` = 지금 목록엔 없지만 **죽은 게 아니라 잠깐 숨은** 축(렌즈로 빠진 고점·다리 축) —
 * 이걸 안 넘기면 렌즈를 한 번 되돌릴 때마다 서랍 멤버십이 영구 삭제된다.
 */
export function pruneDrawer(ids: string[], liveAxisIds: readonly string[], protectedKeys: readonly string[] = []): string[] {
    const live = new Set([...liveAxisIds, ...protectedKeys]);
    return ids.every((k) => live.has(k)) ? ids : ids.filter((k) => live.has(k));
}

/** 서랍 안/밖 가르기 — 들어온 순서(= 레일 순서)를 양쪽 다 그대로 지킨다. */
export function splitByDrawer<T extends { key: string }>(axes: readonly T[], drawer: ReadonlySet<string>): { outside: T[]; inside: T[] } {
    const outside: T[] = [];
    const inside: T[] = [];
    for (const a of axes) (drawer.has(a.key) ? inside : outside).push(a);
    return { outside, inside };
}

/** 서랍 머리가 말하는 두 수 — 든 축 수와 그중 조건이 걸린 수. */
export interface DrawerCounts {
    total: number;
    conditioned: number;
}

export function drawerCountsOf<T extends { key: string }>(inside: readonly T[], hasCondition: (axisKey: string) => boolean): DrawerCounts {
    return { total: inside.length, conditioned: inside.filter((a) => hasCondition(a.key)).length };
}

/**
 * 서랍 줄을 그릴까 — "걸린 것만 보기"가 켜져 있으면 **조건 걸린 축이 있을 때만**. 그 모드에서 조건 없는
 * 축은 어디에도 안 그리는데(보드 규칙), 서랍만 "4개 들었음"이라 말하면 그 4개를 찾을 방법이 없다.
 */
export const drawerVisible = (c: DrawerCounts, onlyActive: boolean): boolean =>
    onlyActive ? c.conditioned > 0 : c.total > 0;
