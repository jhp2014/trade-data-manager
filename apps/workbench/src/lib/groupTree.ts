// 그룹의 조상 사슬(순수) — `parentName` 을 타고 올라가 `더 상위 › 상위 › 현재` 를 만든다.
//
// 왜 필요한가: 그룹 이름은 **부모 밑에서만 뜻이 선다.** `소부장` 이 두 부모 밑에 하나씩 있으면 이름만
// 봐서는 어느 쪽인지 알 수 없고, 팔레트에서 고를 때 그게 그대로 잘못 건 조건이 된다.
// (이름은 전역 유일이라 실제로 둘이 공존하진 않지만, 사람이 읽을 때 헷갈리는 건 같다.)
//
// ⚠ **끊긴 사슬과 순환을 여기서 막는다.** 저장 경로가 순환을 거부하고 삭제 시 자식의 부모를 풀지만,
// 사전은 화면이 들고 있는 스냅숏이라 늘 그 규칙과 같은 시점이라는 보장이 없다(그룹을 지운 직후,
// 다른 화면의 오래된 캐시). 방어가 없으면 무한 루프가 되어 화면이 통째로 멈춘다 — 값이 조금 틀린 것과
// 화면이 멈추는 것은 대가가 다르다.
import type { Group } from "../api/groups.js";

/** 사슬 깊이 상한 — 이보다 깊으면 그리기도 전에 읽을 수 없다(그리고 대개 데이터가 잘못된 것이다). */
const MAX_DEPTH = 8;

/**
 * 이 그룹의 조상들 — **먼 조상이 앞**(`[더 상위, 상위]`). 최상위면 빈 배열.
 * 사전에 없는 부모(지워짐·아직 안 온 캐시)를 만나면 거기서 멈춘다 — 지어내지 않는다.
 */
export function ancestorsOf(groupName: string, groupByName: ReadonlyMap<string, Group>): Group[] {
    const chain: Group[] = [];
    const seen = new Set<string>([groupName]);
    let parentName = groupByName.get(groupName)?.parentName ?? null;
    while (parentName !== null && chain.length < MAX_DEPTH) {
        if (seen.has(parentName)) break; // 순환 — 더 올라가면 영원히 돈다
        const parent = groupByName.get(parentName);
        if (!parent) break; // 끊긴 사슬
        seen.add(parentName);
        chain.push(parent);
        parentName = parent.parentName;
    }
    return chain.reverse();
}

/** 조상 + 자신의 이름을 한 줄로(툴팁·검색용). 좁은 자리에서도 전체 경로는 여기로 준다. */
export function groupPathLabel(groupName: string, groupByName: ReadonlyMap<string, Group>, fallback: string): string {
    const self = groupByName.get(groupName);
    const names = [...ancestorsOf(groupName, groupByName).map((g) => g.name), self?.name ?? fallback];
    return names.join(" › ");
}

/**
 * 직접 소속 ∪ **모든 조상**(계층 상속) — 조회·필터가 보는 "적용" 집합.
 * 멤버는 자기 그룹만 알고, 상위 포함은 그룹 관계에서 매번 유도한다(저장하면 부모를 바꿀 때마다
 * 멤버십 마이그레이션이 필요해지고, "하위엔 있는데 상위에서 뺀" 모순 상태가 생길 수 있다).
 * 직접이 앞(편집 대상이 먼저 보이게), 조상은 발견 순. 중복은 거른다.
 */
export function expandWithAncestors(names: readonly string[], groupByName: ReadonlyMap<string, Group>): string[] {
    if (names.length === 0) return [];
    const out = new Set<string>(names);
    for (const n of names) for (const a of ancestorsOf(n, groupByName)) out.add(a.name);
    return out.size === names.length ? [...names] : [...out];
}

/**
 * 조상 이름 → 그 상속을 가져온 **직접 그룹**(여럿이면 처음 만난 것) — 팝오버의 "하위 ○○ 경유" 라벨.
 * 직접 소속인 이름은 키에 없다(상속이 아니라 소유).
 */
export function inheritanceSources(directNames: readonly string[], groupByName: ReadonlyMap<string, Group>): Map<string, Group> {
    const direct = new Set(directNames);
    const via = new Map<string, Group>();
    for (const n of directNames) {
        const self = groupByName.get(n);
        if (!self) continue;
        for (const a of ancestorsOf(n, groupByName)) if (!direct.has(a.name) && !via.has(a.name)) via.set(a.name, self);
    }
    return via;
}

/** a 가 b 의 조상인가(자기 자신은 아니다). 겹침(징검다리) 계산에서 조상–자손 쌍을 걸러낼 때 쓴다. */
export function isAncestorOf(a: string, b: string, groupByName: ReadonlyMap<string, Group>): boolean {
    return ancestorsOf(b, groupByName).some((g) => g.name === a);
}
