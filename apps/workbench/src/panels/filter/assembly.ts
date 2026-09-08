// 조립 합집합(순수) — 부품(저장 집합)의 리졸브 결과들을 **평평한 OR** 로 합친다.
//
// 규칙(.claude/decisions.md 「집합 조립 (OR)」):
//   · 층위 = 부품 중 가장 가는 것(finest 와 같은 방향): 하나라도 point 면 point, 전부 day 면 day.
//   · point 로 내릴 때 day 부품의 전개(∀)는 **그 부품 자신의 timesOf** 로 한다 — 부품은 처음부터
//     끝까지 자기 정의로 평가한다("전개를 누구 정의로 하나"가 원리적으로 안 생긴다).
//   · 중복은 funnelKey 로 접는다(expandToPointItems 와 같은 자).
//
// 깔때기 계약(5칸·한계기여도)은 여기 없다 — 조립의 진단은 부품별 **고유 기여**(uniqueCounts)다.
import { funnelKey, type FunnelItem, type Grain } from "@trade-data-manager/market/domain";
import { expandToPointItems } from "../../lib/grainView.js";

/** 합집합에 들어가는 부품 하나 — 리졸브 결과 + 그 부품 정의의 타점 시각(전개용). */
export interface UnionPart {
    grain: Grain;
    items: readonly FunnelItem[];
    timesOf: (item: { stockCode: string; date: string }) => readonly string[];
}

/** 조립의 층위 — 부품 중 가장 가는 것. 부품 0개(전부 죽었거나 껐거나 빈 조립)는 day(빈 집합의 표시 기본). */
export const unionGrain = (parts: readonly Pick<UnionPart, "grain">[]): Grain =>
    parts.some((p) => p.grain === "point") ? "point" : "day";

/** 합집합 — 층위를 맞춘 뒤 funnelKey 로 접는다. day 조립은 전개 없이 그대로 합친다. */
export function unionOf(parts: readonly UnionPart[]): { grain: Grain; items: FunnelItem[] } {
    const grain = unionGrain(parts);
    const seen = new Set<string>();
    const items: FunnelItem[] = [];
    for (const p of parts) {
        const leveled = grain === "point" ? expandToPointItems(p.items, p.timesOf) : p.items;
        for (const it of leveled) {
            const k = funnelKey(it);
            if (seen.has(k)) continue;
            seen.add(k);
            items.push(it);
        }
    }
    return { grain, items };
}

/**
 * 부품별 고유 기여 — "이 부품을 빼면 합집합이 얼마나 주나". 겹치는 항목은 어느 부품의 고유도 아니다
 * (두 부품이 같이 든 항목은 하나를 빼도 남는다). 키 집합은 **합집합과 같은 층위**로 만들어 넘길 것 —
 * 층위가 갈리면 같은 항목이 다른 키가 되어 전부 고유로 부풀어 보인다.
 */
export function uniqueCounts(keySets: readonly ReadonlySet<string>[]): number[] {
    const owner = new Map<string, number>(); // key → 유일 소유 부품 idx, 둘 이상이면 -1
    keySets.forEach((set, i) => {
        for (const k of set) {
            const cur = owner.get(k);
            if (cur === undefined) owner.set(k, i);
            else if (cur !== i) owner.set(k, -1);
        }
    });
    const out = keySets.map(() => 0);
    for (const i of owner.values()) if (i >= 0) out[i]! += 1;
    return out;
}
