// /day-flow 메모리 캐시 — **과거 날짜만**(오늘 = KST 기준, 수집 중일 수 있어 매 요청 직계산), LRU 상한 4.
// 내용물은 파싱된 객체가 아니라 **직렬화된 JSON 문자열**이다 — 날짜당 ~15MB 라 객체 보관은 과하고(결정 로그:
// 8벌 ≈ ~200MB), 문자열이면 히트 때 재직렬화도 생략된다(라우트가 문자열을 그대로 body 로).
// 미스: 직계산 → stringify 한 번 → 응답을 먼저 보내고, 백그라운드로 **앞뒤 거래일 각 1개**를 선계산해 올린다
// (오늘·이미 캐시/계산 중인 날짜는 생략, 선계산은 연쇄하지 않고 실패는 조용히 버린다 — 다음 실요청이 다시 계산).
// in-flight dedup: 같은 날짜의 실요청·선계산이 겹치면 같은 promise 를 공유(이중 계산 금지).
// 기동 warm 없음(사용자 기각) · 날짜별 파일 물화 기각(물화 기준: 내용이 바뀔 수 있는 파생은 메모리).
import { kstToday } from "@trade-data-manager/market";
import type { DayFlowByDate } from "./dayFlow.js";

export interface CachedDayFlowDeps {
    /** 직계산(market/dayFlow.ts). */
    compute: DayFlowByDate;
    /** 이웃 거래일 판정 재료 — dates 물화(오름차순 거래일 목록, market/dataDates.ts). */
    tradingDays: () => Promise<string[]>;
    /** 오늘(KST) 공급자 — 테스트 주입용. */
    today?: () => string;
    /** LRU 상한(기본 4 — 날짜당 ~15MB 문자열이라 ~62MB). */
    limit?: number;
}

/** GET /day-flow 의 포트 — 날짜 → JSON 문자열(라우트가 그대로 body 로 보낸다). */
export type DayFlowBody = (date: string) => Promise<string>;

export function makeCachedDayFlowBody({ compute, tradingDays, today = kstToday, limit = 4 }: CachedDayFlowDeps): DayFlowBody {
    const cache = new Map<string, string>(); // 삽입 순서 = 최근 사용 순(히트 때 재삽입) — Map 이 곧 LRU
    const inFlight = new Map<string, Promise<string>>();

    /** 직계산 + stringify — 같은 날짜가 겹치면(실요청·선계산) 같은 promise 공유. 캐시엔 안 넣는다(호출자 몫). */
    const computeBody = (date: string): Promise<string> => {
        const existing = inFlight.get(date);
        if (existing) return existing;
        const p = compute(date)
            .then((flow) => JSON.stringify(flow))
            .finally(() => inFlight.delete(date));
        inFlight.set(date, p);
        return p;
    };

    /** 과거 날짜 로드 — 히트 즉시, 미스면 계산 후 LRU 에 올린다. 선계산 연쇄 없음. */
    const load = async (date: string): Promise<string> => {
        const hit = cache.get(date);
        if (hit !== undefined) {
            cache.delete(date);
            cache.set(date, hit);
            return hit;
        }
        const body = await computeBody(date);
        cache.delete(date);
        cache.set(date, body);
        while (cache.size > limit) cache.delete(cache.keys().next().value as string);
        return body;
    };

    /** 응답 뒤 백그라운드 — 앞뒤 거래일 각 1개 선계산(오늘·캐시·계산 중 제외). */
    const prefetchNeighbors = async (date: string): Promise<void> => {
        const days = await tradingDays();
        const i = days.indexOf(date);
        if (i < 0) return;
        const t = today();
        for (const n of [days[i - 1], days[i + 1]]) {
            if (!n || n >= t || cache.has(n) || inFlight.has(n)) continue;
            void load(n).catch(() => undefined);
        }
    };

    return async (date) => {
        if (date >= today()) return computeBody(date); // 오늘(이후)은 캐시 없이 직계산 — 동시 요청만 공유
        const body = await load(date);
        void prefetchNeighbors(date).catch(() => undefined);
        return body;
    };
}
