// 일봉 컨텍스트(트레일링 고가 + 등락률 기준가) — hot 종목 온디맨드 계산·캐시·거래일 변경 자가치유.
//  · trailingHighs = **수정주가** KRX/UN 두 벌(core trailingHighsOf — 복기 파이프라인과 단일진실),
//    과거 완결일만(당일 형성봉 제외 — 클라가 index 0 에 라이브 고가% prepend, 장중 갱신 반영).
//  · basePrice = 등락률 기준가 두 스칼라(core basePricesOf — 원주가 직전 종가 + 감자·액분 조정계수 보정,
//    복기 deriveMinutes 와 단일진실) — 클라 % base(기준가 토글). ka10095 base_pric 의미론
//    (KRX 기준가인지 통합인지 미확인)에 의존하지 않고 자체 일봉에서 배급한다.
// 캐시 키=(code→기준거래일), 거래일 바뀌면 stale → 재계산. hot 종목만(수십) — 종목당 하루 REST 4콜
// (수정 평문+_AL, 원주가 평문+_AL). ka10081 은 시세폴링(ka10095)과 별도 레이트 버킷이라 폴링을 안 굶긴다.
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import { KiwoomDailyAdapter, KiwoomRawDailyCandleAdapter } from "@trade-data-manager/broker";
import { trailingHighsOf, basePricesOf, type ByMarket } from "@trade-data-manager/market";

const LOOKBACK_CAL_DAYS = 200; // 120거래일(TRAILING_DAYS) 확보용 캘린더 창(주말·휴일 여유)
const RAW_LOOKBACK_CAL_DAYS = 14; // 원주가 전일종가 확보용 짧은 창(연휴 여유)

export interface DailyContext {
    trailingHighs: ByMarket<number[]>; // 수정주가, index 0=직전 완결 거래일(당일 제외)
    basePrice: ByMarket<number | null>; // 등락률 기준가(시장별, 당일 원주가 스케일 — 이벤트 보정)
}

export interface DailyContextSource {
    /** 캐시된 일봉 컨텍스트(없거나 아직 미계산이면 undefined). */
    contextOf(code: string): DailyContext | undefined;
    /** hot 종목의 컨텍스트를 today(거래일) 기준으로 보장(백그라운드·멱등). */
    ensure(code: string, today: string): Promise<void>;
}

interface Entry {
    date: string; // 계산 기준 거래일. 이게 바뀌면 stale → 재계산.
    ctx: DailyContext;
}

/** today("YYYY-MM-DD") 로부터 days 일 전 ISO 날짜. 조회 하한이라 넉넉하면 됨. */
function isoDaysAgo(today: string, days: number): string {
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    const t = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export class KiwoomDailyContext implements DailyContextSource {
    private readonly cache = new Map<string, Entry>();
    private readonly inflight = new Set<string>();
    private readonly daily: KiwoomDailyAdapter;
    private readonly rawDaily: KiwoomRawDailyCandleAdapter;

    constructor(kiwoom: Kiwoom) {
        this.daily = new KiwoomDailyAdapter(kiwoom.rest);
        this.rawDaily = new KiwoomRawDailyCandleAdapter(kiwoom.rest);
    }

    contextOf(code: string): DailyContext | undefined {
        return this.cache.get(code)?.ctx;
    }

    async ensure(code: string, today: string): Promise<void> {
        if (this.cache.get(code)?.date === today || this.inflight.has(code)) return; // 이미 최신/진행중
        this.inflight.add(code);
        try {
            const [adj, raw] = await Promise.all([
                this.daily.getDailyCandles(code, { from: isoDaysAgo(today, LOOKBACK_CAL_DAYS), to: today }),
                this.rawDaily.getRawDailyCandles(code, { from: isoDaysAgo(today, RAW_LOOKBACK_CAL_DAYS), to: today }),
            ]);
            // 당일(형성중) 캔들 제외 — 클라가 index 0 에 라이브 고가%를 prepend(이중계산 방지 + 장중 갱신).
            const past = adj.filter((c) => c.date < today);
            // 기준가 — 수정주가는 전체(adj)를 넘긴다(당일 형성봉 포함이 정확: 장중엔 수정=원주 동일이라 보정 중립).
            const bp = basePricesOf(raw, adj, today);
            if (bp.factor.krx !== 1 || bp.factor.un !== 1)
                console.warn(`[daily-ctx] ${code} 기준가 보정 krx×${bp.factor.krx.toFixed(4)} un×${bp.factor.un.toFixed(4)} — 감자·액분 등 이벤트(또는 일봉 불일치)`);
            this.cache.set(code, {
                date: today,
                ctx: {
                    trailingHighs: trailingHighsOf(past, today),
                    basePrice: bp.base,
                },
            });
        } catch {
            // 무해 — 캐시 미기록, 다음 틱에 재시도.
        } finally {
            this.inflight.delete(code);
        }
    }
}
