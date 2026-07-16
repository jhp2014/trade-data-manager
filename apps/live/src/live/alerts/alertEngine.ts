// 알람 조건 평가기 — framework-free 순수 상태기계. 틱마다 evaluate(rules, ctx, now) → 발화 목록.
// 조건 = leaf(AND) 리스트. 발화는 식(모든 leaf AND) 술어의 false→true 진입 엣지에만.
// 의미론(설계 확정):
//  · 3치 논리(Kleene): leaf 는 true/false/미결(데이터 결손). AND=하나라도 false 면 false·미결 있으면 미결.
//    **식이 미결이면 그 틱 스킵**(상태 불변) — 결손이 가짜 엣지를 만들지 않게.
//  · 엣지 발화: 신규 조건/재기동 첫 평가는 "초기화"(현재값으로 무장만, 발화 없음) → 이미 조건 안에서
//    만들거나 재기동해도 발화 폭풍이 없다. 재무장 = 하강 엣지(false 복귀).
//  · **쿨다운은 여기 없다** — 엣지면 무조건 발화한다. 알림을 아끼는 건 배달 정책(NotifyGate)이고,
//    억제된 발화도 워크벤치 로그엔 남아야 하기 때문(엔진이 버리면 남길 것 자체가 없다).
//  · OR = 조건을 여러 개 다는 것으로 대체(엔진은 조건 하나당 AND 만 안다).
import type { Quote } from "../engine/types.js";
import { priceEvidence, rankEvidence } from "./format.js";
import type { AlertFiring, AlertLeaf, AlertMarket, AlertRule, LeafEvidence, RuleRuntimeState } from "./types.js";

export interface AlertEvalContext {
    quoteOf(code: string): Quote | undefined;
    /** market 전일종가(원). 없으면 undefined → 순위 leaf 미결. */
    prevCloseOf(code: string, market: AlertMarket): number | undefined;
    /** 이번 틱 테마 등락률 순위(code,theme,market). 없으면 undefined. */
    rankOf(code: string, theme: string, market: AlertMarket): number | undefined;
    /** ~60초 전 순위(delta leaf 용). 없으면 undefined. */
    rankAgoOf(code: string, theme: string, market: AlertMarket): number | undefined;
}

/** leaf 판정 + 근거. ok=true/false/undefined(데이터 결손). 근거는 판정에 **쓴 그 실측값**으로 만든다. */
interface LeafResult {
    ok: boolean | undefined;
    evidence?: LeafEvidence;
}

/** leaf 3치 평가 — quote 는 이미 존재 보장. */
function evalLeaf(leaf: AlertLeaf, quote: Quote, ctx: AlertEvalContext): LeafResult {
    switch (leaf.kind) {
        case "price":
            return {
                ok: leaf.op === "gte" ? quote.price >= leaf.value : quote.price <= leaf.value,
                evidence: priceEvidence(leaf, quote.price),
            };
        case "rank": {
            const rank = ctx.rankOf(quote.code, leaf.theme, leaf.market);
            if (rank == null) return { ok: undefined }; // 테마 미배정/멤버십 미로드/전일종가 미도착
            const past = ctx.rankAgoOf(quote.code, leaf.theme, leaf.market);
            if (leaf.mode === "reach") {
                // past 는 표시용(없으면 근거에서 생략) — reach 판정 자체는 현재 순위만 본다.
                return { ok: rank <= leaf.threshold, evidence: rankEvidence(leaf, rank, past) };
            }
            if (past == null) return { ok: undefined }; // 60초 이력 미적립
            return { ok: past - rank >= leaf.threshold, evidence: rankEvidence(leaf, rank, past) }; // 양수 = 순위 상승
        }
    }
}

/** 식(AND) 3치 — false 하나면 false, 미결 있으면 미결, 전부 true 면 true. 참일 때만 근거를 모은다. */
function evalLeaves(leaves: readonly AlertLeaf[], quote: Quote, ctx: AlertEvalContext): { ok: boolean | undefined; evidence: LeafEvidence[] } {
    let anyUndef = false;
    const evidence: LeafEvidence[] = [];
    for (const leaf of leaves) {
        const r = evalLeaf(leaf, quote, ctx);
        if (r.ok === false) return { ok: false, evidence: [] }; // 발화 안 함 — 근거 불필요
        if (r.ok === undefined) anyUndef = true;
        else if (r.evidence) evidence.push(r.evidence);
    }
    return { ok: anyUndef ? undefined : true, evidence };
}

export class AlertEngine {
    private state = new Map<string, RuleRuntimeState>();

    /** 조건 전체를 한 틱 평가. 삭제된 조건의 상태는 청소. */
    evaluate(rules: readonly AlertRule[], ctx: AlertEvalContext, now: number): AlertFiring[] {
        const firings: AlertFiring[] = [];
        const alive = new Set(rules.map((r) => r.id));
        for (const id of [...this.state.keys()]) if (!alive.has(id)) this.state.delete(id);

        for (const rule of rules) {
            const verdict = this.judge(rule, ctx);
            if (verdict == null) continue; // 데이터 결손(식 미결) — 상태 불변

            const prev = this.state.get(rule.id);
            if (!prev) {
                // 초기화 틱 — 현재값으로 무장만(발화 없음). 신규 조건·재기동 공통.
                this.state.set(rule.id, { inZone: verdict.hold, lastFiredAt: null });
                continue;
            }

            if (verdict.hold && !prev.inZone) {
                // 상승 엣지 — 무조건 발화(배달 여부는 NotifyGate 가 정한다).
                prev.lastFiredAt = now;
                firings.push({
                    ruleId: rule.id,
                    code: rule.code,
                    name: verdict.quote.name,
                    at: now,
                    features: verdict.features,
                    evidence: verdict.evidence,
                    note: rule.note,
                });
            }
            prev.inZone = verdict.hold;
        }
        return firings;
    }

    /** 조건 상태 노출(스냅샷용) — 없으면 아직 초기화 전. */
    stateOf(ruleId: string): RuleRuntimeState | undefined {
        return this.state.get(ruleId);
    }

    /**
     * 식 판정 + 발화 피처 + leaf 근거. null = 시세 없음 또는 식 미결 → 이 틱 판단 불가(스킵, 상태 불변).
     */
    private judge(
        rule: AlertRule,
        ctx: AlertEvalContext,
    ): { hold: boolean; quote: Quote; features: AlertFiring["features"]; evidence: LeafEvidence[] } | null {
        const quote = ctx.quoteOf(rule.code);
        if (!quote) return null; // 시세 없으면 가격 leaf·피처 모두 불가
        const { ok, evidence } = evalLeaves(rule.leaves, quote, ctx);
        if (ok === undefined) return null; // 데이터 결손 — 상태 불변
        return { hold: ok, quote, features: { price: quote.price, changeRate: quote.changeRate }, evidence };
    }
}
