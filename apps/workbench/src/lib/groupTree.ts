// 그룹의 조상 사슬(순수) — `parentId` 를 타고 올라가 `더 상위 › 상위 › 현재` 를 만든다.
//
// 왜 필요한가: 그룹 이름은 **부모 밑에서만 뜻이 선다.** `소부장` 이 두 부모 밑에 하나씩 있으면 이름만
// 봐서는 어느 쪽인지 알 수 없고, 팔레트에서 고를 때 그게 그대로 잘못 건 조건이 된다.
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
export function ancestorsOf(groupId: string, groupById: ReadonlyMap<string, Group>): Group[] {
    const chain: Group[] = [];
    const seen = new Set<string>([groupId]);
    let parentId = groupById.get(groupId)?.parentId ?? null;
    while (parentId !== null && chain.length < MAX_DEPTH) {
        if (seen.has(parentId)) break; // 순환 — 더 올라가면 영원히 돈다
        const parent = groupById.get(parentId);
        if (!parent) break; // 끊긴 사슬
        seen.add(parentId);
        chain.push(parent);
        parentId = parent.parentId;
    }
    return chain.reverse();
}

/** 조상 + 자신의 이름을 한 줄로(툴팁·검색용). 좁은 자리에서도 전체 경로는 여기로 준다. */
export function groupPathLabel(groupId: string, groupById: ReadonlyMap<string, Group>, fallback: string): string {
    const self = groupById.get(groupId);
    const names = [...ancestorsOf(groupId, groupById).map((g) => g.name), self?.name ?? fallback];
    return names.join(" › ");
}
