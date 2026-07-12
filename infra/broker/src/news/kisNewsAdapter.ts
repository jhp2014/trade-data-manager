// infra/broker/news/kisNewsAdapter — KIS 단독 NewsSource.
// FHKST01011800(종합 시황/공시 제목)을 시각 앵커로 호출해 한 페이지(≤40, 내림차순)를 도메인 헤드라인으로.
// 앵커는 도메인 형식(YYYY-MM-DD / HH:MM:SS) → KIS compact(00YYYYMMDD / 0000HHMMSS)로 변환(recon 확정 포맷).
import type { NewsHeadline, NewsSource } from "@trade-data-manager/market";
import { KisError, type KisApiResponse, type KisNewsResponse } from "@trade-data-manager/kis";

/** 어댑터가 KIS에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). KisRest 가 구조적으로 만족한다. */
export interface KisNewsSource {
    getNewsTitles(params: {
        date?: string;
        time?: string;
        stockCode?: string;
        titleKeyword?: string;
    }): Promise<KisApiResponse<KisNewsResponse>>;
}

/** 페이지 필터 — KIS 가 서버사이드로 거른다(FID_INPUT_ISCD / FID_TITL_CNTT). 백필(전체 시황)은 안 쓴다. */
export interface KisNewsFilter {
    /** 종목코드(6자리) — 그 종목 태깅 뉴스만. */
    stockCode?: string;
    /** 제목 키워드 — 부분일치. */
    titleKeyword?: string;
}

/** 장시간 백필 회복력 — 유량초과(클라 재시도 소진) 시 백오프 후 재시도하는 옵션. */
export interface KisNewsAdapterOptions {
    /** 유량초과 백오프 최대 재시도 수(기본 6 ≈ 누적 ~3분 인내). */
    maxRateLimitRetries?: number;
    /** attempt(1부터)당 대기 ms(기본 지수: min(60s, 2s·2^attempt)). */
    backoffMs?: (attempt: number) => number;
    /** 대기 구현(테스트 주입용, 기본 setTimeout). */
    sleep?: (ms: number) => Promise<void>;
    /** 재시도 알림(기본 console.warn). */
    onRetry?: (attempt: number, waitMs: number) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const defaultBackoff = (attempt: number): number => Math.min(60_000, 2_000 * 2 ** attempt);
/** 클라이언트가 모든 재시도를 소진하고 던진 유량초과인지. */
const isRateLimit = (e: unknown): boolean => e instanceof KisError && e.message.includes("유량초과");

/** "YYYY-MM-DD" → "YYYYMMDD". */
const compactDate = (d: string): string => d.replace(/-/g, "");
/** "HH:MM:SS" → "HHMMSS". */
const compactTime = (t: string): string => t.replace(/:/g, "");

/** KIS output 한 건 → 도메인 헤드라인. iscd1~10 중 비지 않은 것만 종목으로. */
function toHeadline(it: Record<string, string>): NewsHeadline {
    const dt = it.data_dt ?? "";
    const tm = (it.data_tm ?? "").padStart(6, "0");
    const stockCodes: string[] = [];
    for (let i = 1; i <= 10; i++) {
        const c = (it[`iscd${i}`] ?? "").trim();
        if (c) stockCodes.push(c);
    }
    return {
        srno: it.cntt_usiq_srno ?? "",
        date: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
        time: `${tm.slice(0, 2)}:${tm.slice(2, 4)}:${tm.slice(4, 6)}`,
        title: it.hts_pbnt_titl_cntt ?? "",
        sourceCode: it.news_ofer_entp_code ?? "",
        sourceName: it.dorg ?? "",
        categoryCode: it.news_lrdv_code ?? "",
        stockCodes,
    };
}

export class KisNewsAdapter implements NewsSource {
    private readonly maxRetries: number;
    private readonly backoffMs: (attempt: number) => number;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly onRetry: (attempt: number, waitMs: number) => void;

    constructor(
        private readonly source: KisNewsSource,
        opts: KisNewsAdapterOptions = {},
    ) {
        this.maxRetries = opts.maxRateLimitRetries ?? 6;
        this.backoffMs = opts.backoffMs ?? defaultBackoff;
        this.sleep = opts.sleep ?? defaultSleep;
        this.onRetry =
            opts.onRetry ??
            ((attempt, waitMs) =>
                console.warn(`[news] 유량초과 — ${attempt}/${this.maxRetries} 재시도, ${waitMs}ms 대기`));
    }

    async fetchBefore(anchor?: { date: string; time: string }, filter?: KisNewsFilter): Promise<NewsHeadline[]> {
        const params = {
            ...(anchor
                ? { date: `00${compactDate(anchor.date)}`, time: `0000${compactTime(anchor.time)}` }
                : { date: "", time: "" }),
            ...(filter?.stockCode ? { stockCode: filter.stockCode } : {}),
            ...(filter?.titleKeyword ? { titleKeyword: filter.titleKeyword } : {}),
        };
        // 유량초과(클라 재시도 소진) → 백오프 후 재시도. 장시간 백필이 일시 throttle 로 abort 되지 않게.
        let res: KisApiResponse<KisNewsResponse>;
        for (let attempt = 0; ; attempt++) {
            try {
                res = await this.source.getNewsTitles(params);
                break;
            } catch (e) {
                if (!isRateLimit(e) || attempt >= this.maxRetries) throw e;
                const waitMs = this.backoffMs(attempt + 1);
                this.onRetry(attempt + 1, waitMs);
                await this.sleep(waitMs);
            }
        }
        const out = (res.data.output ?? []) as Array<Record<string, string>>;
        let page = out.map(toHeadline);
        // 벤더 quirk 차단(recon 확정): 한 페이지를 못 채우면 API 가 같은 날 "뒤쪽(더 최신)" 항목으로
        // wrap 해 채운다 → 앵커보다 최신인 항목이 섞여 들어옴. 포트 계약(≤anchor 내림차순)을 어댑터가
        // 강제: 앵커보다 최신인 wrap 항목을 버리고 내림차순 정렬해 돌려준다. (앵커 없으면 최신 페이지 그대로.)
        if (anchor) {
            page = page.filter((h) => h.date < anchor.date || (h.date === anchor.date && h.time <= anchor.time));
        }
        page.sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)));
        return page;
    }
}
