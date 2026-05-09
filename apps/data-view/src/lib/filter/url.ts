/**
 * FilterInstance ↔ URL 직렬화.
 * URL 형식: f=<id>:<kind>:<payload> (콜론 기준 처음 두 개만 분리자)
 * payload 내부는 각 FilterKind.serialize/deserialize가 책임.
 */
import type { FilterInstance, BuildCtx, FilterKind } from "./kinds/types";

export function serializeInstance(
    inst: FilterInstance,
    kinds: Record<string, FilterKind<any>>, // any: 다형 레지스트리
): string {
    const kind = kinds[inst.kind];
    if (!kind) return "";
    return `${inst.id}:${inst.kind}:${kind.serialize(inst.value)}`;
}

export function deserializeInstance(
    raw: string,
    kinds: Record<string, FilterKind<any>>, // any: 다형 레지스트리
    ctx: BuildCtx,
): FilterInstance | null {
    // 처음 두 개의 ':' 기준으로만 분리 — payload 안에는 ':' 포함 가능
    const firstColon = raw.indexOf(":");
    if (firstColon === -1) return null;
    const id = raw.slice(0, firstColon);
    if (!id) return null;

    const rest = raw.slice(firstColon + 1);
    const secondColon = rest.indexOf(":");
    if (secondColon === -1) return null;
    const kindKey = rest.slice(0, secondColon);
    const payload = rest.slice(secondColon + 1);

    const kind = kinds[kindKey];
    if (!kind) return null;
    const value = kind.deserialize(payload, ctx);
    if (value === null) return null;
    return { id, kind: kindKey, value };
}
