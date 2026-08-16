/**
 * 큐레이션 저장소 배선 규칙 — **읽기는 로컬 미러, 쓰기는 Supabase 먼저 + 로컬 재생.**
 *
 * 왜: 읽기가 Supabase 로 직행하던 시절, 화면을 한 번 새로 그릴 때마다 curation 전량(앵커만 7천 행)이
 * 회선을 건넜다. 하루 2.7GB — 실데이터가 2.4MB 인 걸 감안하면 같은 것을 천 번 끌어온 셈이다.
 * 미러는 이미 매일 밤 만들어지고 있었으므로, 읽기만 그쪽으로 돌리면 그 트래픽이 통째로 사라진다.
 *
 * 쓰기가 두 곳으로 가는 이유: 로컬만 쓰면 협업자가 못 보고, 원격만 쓰면 **내가 방금 쓴 것이 내 화면에
 * 안 보인다**(읽기가 로컬이므로). 순서는 반드시 **Supabase 먼저** — 반대로 하면 미러 전체교체 때
 * "로컬엔 있었는데 원격엔 없던" 편집이 조용히 사라진다.
 *
 * 로컬 재생이 실패하면 **요청은 성공으로 둔다.** 권위 있는 쓰기는 이미 끝났고, 여기서 실패를 올리면
 * "원격엔 들어갔는데 실패했다고 뜨는" 더 나쁜 상태가 된다. 로컬은 다음 동기화(전체교체)가 치유한다.
 * 대신 크게 로그를 남긴다 — 이게 잦으면 배선이 잘못된 것이지 정상 상태가 아니다.
 *
 * **재생이 성립하는 전제**: 계약이 자연키뿐이라는 것. 인자에 id 가 없으니 같은 호출을 양쪽에 그대로
 * 흘리면 각자 자기 id 공간에서 같은 뜻의 행을 만든다. id 가 하나라도 끼면 이 함수는 성립하지 않는다.
 */
type AnyFn = (...args: never[]) => unknown;

export function localReadDualWrite<T extends object>(
    local: T,
    remote: T,
    /** 쓰기 메서드 이름 — 여기 없는 건 전부 읽기로 보고 로컬로 보낸다. 명시적인 게 요점이다. */
    writes: readonly (keyof T & string)[],
    label: string,
): T {
    const writeSet = new Set<string>(writes);
    return new Proxy(local, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver) as unknown;
            if (typeof prop !== "string" || !writeSet.has(prop) || typeof value !== "function") return value;
            return async (...args: never[]): Promise<unknown> => {
                const result = await (remote[prop as keyof T] as AnyFn).apply(remote, args);
                try {
                    await (value as AnyFn).apply(target, args);
                } catch (e) {
                    // 원격은 이미 성공했다 — 로컬만 뒤처진다. 다음 전체교체가 치유한다.
                    console.error(`[mirror] ${label}.${prop} 로컬 재생 실패(원격은 반영됨, 다음 동기화가 치유)`, e);
                }
                return result;
            };
        },
    });
}
