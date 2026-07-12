// 트레일링 고가(신고가 근접 필터 원자재) — hot 종목의 과거 일봉 고가%를 kiwoom ka10081 로 온디맨드 계산·캐시.
// self-heal: 캐시 키=(code→기준거래일). 거래일이 바뀌면 stale → 재계산(다음날 자동). DB 무의존 — live 가
// 이미 가진 kiwoom.rest 만 쓴다. ka10081 은 시세폴링(ka10095)과 별도 레이트 버킷((키×TR)5/sec)이라 폴링을 안 굶긴다.
// 흐리게는 보드에 뜬 hot 종목에만 필요 → 전종목 아님(수십). 값%는 라이브 Quote.base(전일종가) 대비라 index 0(당일)과 같은 base.
import type { Kiwoom } from "@trade-data-manager/kiwoom";

const TRAILING_DAYS = 120; // 클라가 20/40/…/120 창으로 슬라이스하는 최대 길이.
const LOOKBACK_CAL_DAYS = 200; // 120거래일 확보용 캘린더 창(주말·휴일 여유).

interface Entry {
    date: string; // 계산 기준 거래일(kstToday). 이게 바뀌면 stale → 재계산.
    highsPct: number[]; // 과거 완결일 고가%(전일종가 base 대비), 최신→과거. index 0(당일=라이브 highPct)은 클라가 prepend.
}

export interface TrailingHighsSource {
    /** 캐시된 과거 고가%(없거나 아직 미계산이면 undefined). */
    highsOf(code: string): number[] | undefined;
    /** hot 종목의 트레일링 고가를 base(전일종가)·today(거래일) 기준으로 보장(백그라운드·멱등). */
    ensure(code: string, base: number, today: string): Promise<void>;
}

/** today 로부터 days 일 전 YYYYMMDD(로컬=KST 박스). 조회 하한이라 넉넉하면 됨. */
function ymdDaysAgo(days: number): string {
    const d = new Date(Date.now() - days * 86_400_000);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export class KiwoomTrailingHighs implements TrailingHighsSource {
    private readonly cache = new Map<string, Entry>();
    private readonly inflight = new Set<string>();

    constructor(private readonly kiwoom: Kiwoom) {}

    highsOf(code: string): number[] | undefined {
        return this.cache.get(code)?.highsPct;
    }

    async ensure(code: string, base: number, today: string): Promise<void> {
        if (base <= 0 || this.cache.get(code)?.date === today || this.inflight.has(code)) return; // 이미 최신/진행중/base없음
        this.inflight.add(code);
        try {
            const candles = await this.kiwoom.rest.getRawDailyChartsForRange(code, ymdDaysAgo(LOOKBACK_CAL_DAYS), today);
            const highsPct = candles
                .filter((c) => c.dt < today) // 오늘(형성중) 캔들 제외 — index 0 은 라이브 highPct(클라가 prepend)
                .slice(0, TRAILING_DAYS) // kiwoom 일봉은 최신→과거 정렬
                .map((c) => Math.round(((Math.abs(Number(c.high_pric)) - base) / base) * 10_000) / 100); // 고가%(2dp), 부호접두 방어
            this.cache.set(code, { date: today, highsPct });
        } catch {
            // 무해 — 캐시 미기록, 다음 틱에 재시도.
        } finally {
            this.inflight.delete(code);
        }
    }
}
