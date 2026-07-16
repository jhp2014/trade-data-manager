// 배달 게이트 — 텔레그램으로 **보낼지 말지**의 정책. 순수·framework-free.
// 왜 발화 층이 아니라 여기인가: 쿨다운은 "조건이 안 걸린 것"이 아니라 "알림을 아낀 것"이다.
// 억제된 발화도 워크벤치 로그엔 남아야 PC 앞에서 시장 전체를 파악할 수 있다 —
// 그래서 AlertEngine 은 엣지마다 무조건 발화하고, 억제는 배달 직전에 한다.
//
// **억제 키는 호출자가 정한다**(GatePolicy) — 스코프마다 "중복"의 의미가 다르기 때문:
//  · watchlist(집중 모니터링) = **룰별**. "12,000 돌파"와 "11,000 이탈"은 서로 다른 사건이라
//    하나를 알렸다고 다른 하나를 삼키면 안 된다.
//  · 유니버스(탐지) = **종목별**. 30초 룰·1분 룰이 다 걸려도 "이 종목에 돈이 들어온다"는 같은 사건이라
//    종목당 한 번이면 된다(같은 틱 중복은 buildFiringMessages 가 이미 묶고, 시차 중복을 여기서 막는다).
//
// 기간은 **배달 시점에 함께 기억한다** — 쿨다운은 "방금 이걸 알렸으니 X 분간 조용히"라 새 발화가 아니라
// 배달된 내용의 속성이다. (새 발화에서 기간을 다시 계산하면 짧은 쿨다운이 긴 침묵을 조기에 풀어버린다.)
import type { AlertFiring } from "./types.js";

const PRUNE_MS = 6 * 3_600_000; // 이보다 오래된 기록은 어떤 쿨다운으로도 억제할 수 없다 — 맵 무한증식 방지

export interface GatePolicy {
    /** 억제 단위 — 같은 키끼리 서로를 막는다(watchlist=ruleId / 유니버스=code). */
    key: string;
    /** 이 발화가 배달됐을 때 그 키를 침묵시킬 기간 ms. */
    cooldownMs: number;
}

export interface GateVerdict {
    /** 배달할 발화(쿨다운 통과). */
    passed: AlertFiring[];
    /** 쿨다운에 막힌 발화 — 로그에는 남는다(브릭 2 로그 뷰가 표시). */
    suppressed: AlertFiring[];
}

export class NotifyGate {
    /** key → 마지막 배달 시각 + 그때 실린 발화가 요구한 침묵 기간. */
    private readonly last = new Map<string, { at: number; cooldownMs: number }>();

    /** 키별로 쿨다운을 적용해 배달분/억제분을 가른다. 통과한 키는 배달 시각·기간을 갱신. */
    pass(firings: readonly AlertFiring[], policyOf: (f: AlertFiring) => GatePolicy, now: number): GateVerdict {
        for (const [key, e] of this.last) if (now - e.at > PRUNE_MS) this.last.delete(key);

        // 키별로 모은다 — 같은 키의 같은 틱 발화는 한 배달로 취급(기간은 그중 최대 = 가장 보수적).
        const byKey = new Map<string, { firings: AlertFiring[]; cooldownMs: number }>();
        for (const f of firings) {
            const { key, cooldownMs } = policyOf(f);
            const g = byKey.get(key);
            if (g) {
                g.firings.push(f);
                g.cooldownMs = Math.max(g.cooldownMs, cooldownMs);
            } else {
                byKey.set(key, { firings: [f], cooldownMs });
            }
        }

        const passed: AlertFiring[] = [];
        const suppressed: AlertFiring[] = [];
        for (const [key, g] of byKey) {
            const prev = this.last.get(key);
            if (prev != null && now - prev.at < prev.cooldownMs) {
                suppressed.push(...g.firings);
                continue;
            }
            this.last.set(key, { at: now, cooldownMs: g.cooldownMs });
            passed.push(...g.firings);
        }
        return { passed, suppressed };
    }

    /** 그 키의 마지막 배달 시각(없으면 null) — 로그 뷰·디버깅용. */
    lastNotifiedAt(key: string): number | null {
        return this.last.get(key)?.at ?? null;
    }
}
