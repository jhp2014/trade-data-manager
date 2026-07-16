// 유니버스 조건검색 알람 평가기 — framework-free 순수 상태기계. 종목을 안 고르고 유니버스 전체에
// 규칙(술어 AND, 규칙끼리 OR)을 건다. 술어·근거 문구는 core 레지스트리(BOARD_PREDICATES)가 소유.
// 의미론(AlertEngine 과 동일 철학):
//  · 엣지 발화: (규칙×종목) 식이 false→true 로 진입할 때만. 첫 관찰(신규 편입·규칙 생성·재기동)은
//    "초기화"(현재값으로 무장만) — 이미 조건 안이어도 발화 폭풍이 없다.
//  · 종목이 유니버스에서 빠지면 상태 소멸 → 재편입 시 초기화(조용). 잦은 hot 이탈·재편입이
//    가짜 엣지를 만들지 않는 쪽(보수적 — 억제 방향)을 택한다.
//  · 데이터 결손 필드는 술어가 false(3치 아님) — 결손→도착 전이가 엣지가 될 수 있으나, 그건
//    "이제 알게 된 돌파"라 발화가 맞다(매물대 컨텍스트 도착 등).
//  · 쿨다운·블랙리스트는 여기 없다 — 배달 정책(런타임·게이트)이 소유. 여긴 매칭 엣지만.
import { boardPredicateDef, predicateEvidence, type BoardMetrics } from "@trade-data-manager/market/domain";
import type { Quote } from "../engine/types.js";
import type { AlertFiring, UniverseRule } from "./types.js";

export class UniverseAlertEngine {
    /** `${ruleId}|${code}` → 직전 틱 식 값(무장 상태). 영속 안 함 — 재기동 시 재무장. */
    private state = new Map<string, boolean>();

    /**
     * 한 틱 평가 — quotes 는 이번 틱 유니버스의 신선한 시세만. metricsOf 는 종목별 BoardMetrics
     * (호출자가 메모이즈). 반환 = 이번 틱 상승 엣지 발화들(배달 판정 전 — 로그·게이트가 이어받는다).
     */
    evaluate(rules: readonly UniverseRule[], quotes: readonly Quote[], metricsOf: (code: string) => BoardMetrics, now: number): AlertFiring[] {
        const firings: AlertFiring[] = [];
        const alive = new Set<string>();

        for (const rule of rules) {
            if (rule.predicates.length === 0) continue; // 빈 식은 전 종목 매칭이 아니라 무효
            for (const q of quotes) {
                const key = `${rule.id}|${q.code}`;
                alive.add(key);
                const m = metricsOf(q.code);
                const hold = rule.predicates.every((pi) => boardPredicateDef(pi.kind)?.test(m, pi.params) ?? false);

                const prev = this.state.get(key);
                if (prev === undefined) {
                    this.state.set(key, hold); // 초기화 — 무장만
                    continue;
                }
                if (hold && !prev) {
                    firings.push({
                        ruleId: rule.id,
                        code: q.code,
                        name: q.name,
                        at: now,
                        features: { price: q.price, changeRate: q.changeRate },
                        // 근거 = 매칭된 술어들의 자기 설명(core predicateEvidence — label+실측값)
                        evidence: rule.predicates.map((pi) => {
                            const def = boardPredicateDef(pi.kind);
                            return { kind: "pred" as const, text: def ? predicateEvidence(def, m, pi.params) : pi.kind };
                        }),
                        note: rule.name,
                    });
                }
                this.state.set(key, hold);
            }
        }

        // 죽은 상태 청소 — 규칙 삭제·종목 유니버스 이탈. 재등장은 초기화(발화 없음).
        for (const key of [...this.state.keys()]) if (!alive.has(key)) this.state.delete(key);
        return firings;
    }
}
