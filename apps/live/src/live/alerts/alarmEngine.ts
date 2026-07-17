// 알람 평가기 한 벌 — framework-free 순수 상태기계. 옛 AlertEngine(watchlist leaf)과
// UniverseAlertEngine(조건검색)을 통합: 규칙 = 술어(AND) + 스코프(code?=집중감시 / 없음=유니버스 탐지).
// 술어·근거 문구는 core 레지스트리(BOARD_PREDICATES · evalPredicate · predicateEvidence)가 소유.
//
// 의미론:
//  · 엣지 발화: (규칙×종목) 식이 false→true 로 진입할 때만. 첫 관찰(신규 편입·규칙 생성·재기동)은
//    "초기화"(현재값으로 무장만) — 이미 조건 안이어도 발화 폭풍이 없다.
//  · **결손(3치) 정책은 스코프별** — 도메인이 실제로 다르다:
//    - code 스코프(집중 감시): 식 미결(undefined)이면 그 틱 스킵(상태 불변) — 결손→도착 전이가
//      가짜 엣지를 만들지 않게(옛 AlertEngine 의 Kleene 의미 보존). 종목이 이번 틱에 없어도 상태 유지
//      (watchlist 는 상시 폴링이라 결측은 일시적 — 무장이 풀리지 않게).
//    - 유니버스(탐지): 미결=false 취급 — "이제 알게 된 돌파"(컨텍스트 도착)도 발화가 맞다.
//      유니버스 이탈→재편입은 상태 소멸→초기화(hot churn 이 가짜 엣지를 안 만듦, 보수적).
//  · 쿨다운·블랙리스트는 여기 없다 — 배달 정책(런타임·게이트)이 소유. 여긴 매칭 엣지만.
import { boardPredicateDef, evalPredicate, predicateEvidence, type BoardMetrics } from "@trade-data-manager/market/domain";
import type { Quote } from "../engine/types.js";
import type { AlarmPredicateInstance, AlarmRule, AlertFiring } from "./types.js";

/** 규칙 런타임 상태(영속 안 함 — 재기동 시 재무장). lastFiredAt = 마지막 발화(배달 아님). */
export interface RuleState {
    inZone: boolean;
    lastFiredAt: number | null;
}

/** 식(AND) 3치 — false 하나면 false, 미결 있으면 미결, 전부 true 면 true. */
function evalExpr(predicates: readonly AlarmPredicateInstance[], m: BoardMetrics): boolean | undefined {
    let anyUndef = false;
    for (const pi of predicates) {
        const def = boardPredicateDef(pi.kind);
        const v = def ? evalPredicate(def, m, pi) : false; // 미등록 술어 = 불성립(false)
        if (v === false) return false;
        if (v === undefined) anyUndef = true;
    }
    return anyUndef ? undefined : true;
}

export class AlarmEngine {
    /** `${ruleId}|${code}` → 무장 상태. */
    private state = new Map<string, RuleState>();

    /**
     * 한 틱 평가 — quotes 는 이번 틱 유니버스(hot∪watchlist)의 신선한 시세만. metricsOf 는 종목별
     * BoardMetrics(호출자가 메모이즈). 반환 = 이번 틱 상승 엣지 발화들(배달 판정 전 — 로그·게이트가 이어받는다).
     */
    evaluate(rules: readonly AlarmRule[], quotes: readonly Quote[], metricsOf: (code: string) => BoardMetrics, now: number): AlertFiring[] {
        const firings: AlertFiring[] = [];
        const byCode = new Map(quotes.map((q) => [q.code, q] as const));
        const alive = new Set<string>();

        for (const rule of rules) {
            if (rule.predicates.length === 0) continue; // 빈 식은 전 종목 매칭이 아니라 무효
            const scoped = rule.code != null;
            // 스코프 규칙은 종목이 이번 틱에 없어도 상태 유지(일시 결측이 무장 해제하지 않게).
            if (scoped) alive.add(`${rule.id}|${rule.code}`);
            const targets = scoped ? (byCode.has(rule.code!) ? [byCode.get(rule.code!)!] : []) : quotes;

            for (const q of targets) {
                const key = `${rule.id}|${q.code}`;
                if (!scoped) alive.add(key);
                const m = metricsOf(q.code);
                const v = evalExpr(rule.predicates, m);

                let hold: boolean;
                if (v === undefined) {
                    if (scoped) continue; // 집중 감시 — 미결이면 틱 스킵(상태 불변, 가짜 엣지 방지)
                    hold = false; // 탐지 — 결손=false("이제 알게 된" 전이는 발화)
                } else {
                    hold = v;
                }

                const prev = this.state.get(key);
                if (!prev) {
                    this.state.set(key, { inZone: hold, lastFiredAt: null }); // 초기화 — 무장만
                    continue;
                }
                if (hold && !prev.inZone) {
                    prev.lastFiredAt = now;
                    firings.push({
                        ruleId: rule.id,
                        code: q.code,
                        name: q.name,
                        at: now,
                        features: { price: q.price, changeRate: q.changeRate },
                        // 근거 = 술어들의 자기 설명(core predicateEvidence — label+실측값). 발화 시점엔 전부 참.
                        evidence: rule.predicates.map((pi) => {
                            const def = boardPredicateDef(pi.kind);
                            return { kind: "pred" as const, text: def ? predicateEvidence(def, m, pi) : pi.kind };
                        }),
                        note: rule.name,
                    });
                }
                prev.inZone = hold;
            }
        }

        // 죽은 상태 청소 — 규칙 삭제·(유니버스) 종목 이탈. 재등장은 초기화(발화 없음).
        for (const key of [...this.state.keys()]) if (!alive.has(key)) this.state.delete(key);
        return firings;
    }

    /** 규칙×종목 무장 상태(모니터링 뷰용) — 없으면 아직 초기화 전. */
    stateOf(ruleId: string, code: string): RuleState | undefined {
        return this.state.get(`${ruleId}|${code}`);
    }
}
