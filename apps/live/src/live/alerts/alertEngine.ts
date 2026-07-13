// 알람 룰 평가기 — framework-free 순수 상태기계. 틱마다 evaluate(rules, ctx, now) → 발화 목록.
// 의미론(설계 확정):
//  · 술어 = band(밴드 안) AND rank(도달/변동) — 룰에 있는 조건만 참여.
//  · 엣지 발화: 술어 false→true 전이에만. 신규 룰/재기동 첫 평가는 "초기화"(현재값으로 무장만, 발화 없음)
//    → 이미 조건 안에서 룰을 만들거나 재기동해도 발화 폭풍이 없다. 재무장 = 하강 엣지(false 복귀).
//  · 쿨다운: 마지막 발화에서 cooldownMs 안이면 상승 엣지여도 억제(그 진입은 버림 — 진동 억제가 목적).
//  · 데이터 결손(시세/순위 이력 없음) = 그 틱은 평가 스킵(상태 불변) — 결손이 가짜 엣지를 만들지 않게.
import type { Quote } from "../engine/types.js";
import { DEFAULT_COOLDOWN_MS, type AlertFiring, type AlertRule, type RuleRuntimeState } from "./types.js";

export interface AlertEvalContext {
    quoteOf(code: string): Quote | undefined;
    /** 이번 틱 themeRank(code→theme→rank). */
    ranks: Map<string, Map<string, number>>;
    /** ~60초 전 순위(없으면 undefined — delta 룰 평가 불가). */
    rankAgo(code: string, theme: string): number | undefined;
}

/** 밴드 경계 — null 은 무제한. baseline 대비 %. */
function bandBounds(baseline: number, lowerPct: number | null, upperPct: number | null): [number, number] {
    const lo = lowerPct == null ? -Infinity : baseline * (1 + lowerPct / 100);
    const hi = upperPct == null ? Infinity : baseline * (1 + upperPct / 100);
    return [lo, hi];
}

export class AlertEngine {
    private state = new Map<string, RuleRuntimeState>();

    /** 룰 전체를 한 틱 평가. 삭제된 룰의 상태는 청소. */
    evaluate(rules: readonly AlertRule[], ctx: AlertEvalContext, now: number): AlertFiring[] {
        const firings: AlertFiring[] = [];
        const alive = new Set(rules.map((r) => r.id));
        for (const id of [...this.state.keys()]) if (!alive.has(id)) this.state.delete(id);

        for (const rule of rules) {
            const verdict = this.judge(rule, ctx);
            if (verdict == null) continue; // 데이터 결손 — 상태 불변

            const prev = this.state.get(rule.id);
            if (!prev) {
                // 초기화 틱 — 현재값으로 무장만(발화 없음). 신규 룰·재기동 공통.
                this.state.set(rule.id, { inZone: verdict.hold, lastFiredAt: null });
                continue;
            }

            const cooldown = rule.cooldownMs ?? DEFAULT_COOLDOWN_MS;
            const risingEdge = verdict.hold && !prev.inZone;
            const cooled = prev.lastFiredAt == null || now - prev.lastFiredAt >= cooldown;
            if (risingEdge && cooled) {
                prev.lastFiredAt = now;
                firings.push({
                    ruleId: rule.id,
                    code: rule.code,
                    name: verdict.quote.name,
                    at: now,
                    features: verdict.features,
                    note: rule.note,
                });
            }
            prev.inZone = verdict.hold;
        }
        return firings;
    }

    /** 룰 상태 노출(스냅샷용) — 없으면 아직 초기화 전. */
    stateOf(ruleId: string): RuleRuntimeState | undefined {
        return this.state.get(ruleId);
    }

    /**
     * 술어 판정 + 발화 피처. null = 필요한 데이터가 없어 이 틱은 판단 불가(스킵).
     * band 와 rank 는 룰에 있는 것만 AND 로 묶인다(최소 1개는 REST 검증이 보장).
     */
    private judge(
        rule: AlertRule,
        ctx: AlertEvalContext,
    ): { hold: boolean; quote: Quote; features: AlertFiring["features"] } | null {
        const quote = ctx.quoteOf(rule.code);
        if (!quote) return null; // 시세 없으면 밴드·피처 모두 불가

        let hold = true;
        let baselinePct: number | null = null;
        let themeRank: number | null = null;
        let themeRankDelta: number | null = null;

        if (rule.band) {
            const { baseline, lowerPct, upperPct } = rule.band;
            if (!(baseline > 0)) return null; // 방어 — 생성 경계에서 걸러지지만 파일 편집 등 오염 대비
            const [lo, hi] = bandBounds(baseline, lowerPct, upperPct);
            baselinePct = (quote.price / baseline - 1) * 100;
            hold &&= quote.price >= lo && quote.price <= hi;
        }

        if (rule.rank) {
            const rank = ctx.ranks.get(rule.code)?.get(rule.rank.theme);
            if (rank == null) return null; // 테마 미배정/멤버십 미로드 — 판단 불가
            themeRank = rank;
            if (rule.rank.mode === "reach") {
                hold &&= rank <= rule.rank.threshold;
            } else {
                const past = ctx.rankAgo(rule.code, rule.rank.theme);
                if (past == null) return null; // 60초 이력 미적립 — 판단 불가
                themeRankDelta = past - rank; // 양수 = 순위 상승
                hold &&= themeRankDelta >= rule.rank.threshold;
            }
        }

        return {
            hold,
            quote,
            features: { price: quote.price, changeRate: quote.changeRate, baselinePct, themeRank, themeRankDelta },
        };
    }
}
