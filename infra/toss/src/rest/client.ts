// 토스 Open API 원시 REST 클라이언트 — 포트를 모른다(도메인 미인지). 한 페이지를 그대로 돌려준다.
// 토큰은 클라이언트당 하나만 유효하다: 첫 요청에서 받아 메모리에 쥐고, 401 이면 한 번만 새로 받아 재시도한다.
// (같은 키로 두 프로세스를 돌리면 서로의 토큰을 죽인다 — 재발급을 반복하지 않고 실패로 드러낸다.)
// ⚠ client_secret·토큰은 message·meta 에 넣지 않는다.
import { TossError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { TossTuning } from "../config.js";
import type { TossHttpResponse, TossTransport } from "../transport.js";
import { kstOf } from "./kst.js";
import type {
    TossCandlePage,
    TossCandlePageBody,
    TossCandleQuery,
    TossDayCandle,
    TossDayMinutes,
    TossDayMinutesOptions,
    TossErrorBody,
    TossTokenInfo,
} from "./types.js";

export interface TossRestDeps {
    transport: TossTransport;
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    tuning: TossTuning;
    logger: Logger;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const MAX_DAY_PAGES = 20; // 하루 최대 720봉(08:01~20:00)이면 4쪽 — 이보다 많으면 커서가 이상하다

/**
 * nextBefore 가 전진하는지 검사한다. 멈춘 커서를 그대로 따라가면 끝나지 않거나, 걷기 상한에 걸려 "더 깊다"로 오독된다.
 * 틀린 결론을 내느니 멈춘다.
 */
export function assertAdvances(before: string | undefined, next: string): void {
    if (before !== undefined && !(Date.parse(next) < Date.parse(before))) {
        throw new TossError(`nextBefore 가 전진하지 않는다: before=${before} next=${next}`, { before, next });
    }
}

export class TossRest {
    private token: string | null = null;
    private issuing: Promise<unknown> | null = null;
    /** 다음 요청이 나갈 수 있는 가장 이른 시각(ms). 동시 호출이 와도 슬롯을 겹치지 않게 예약제로 준다. */
    private nextSlotAt = 0;

    constructor(private readonly deps: TossRestDeps) {}

    /** [GET /api/v1/candles] 캔들 한 페이지(최대 200봉, 최신순). 없는 종목은 meta.code=stock-not-found 로 던진다. */
    async getCandles(q: TossCandleQuery): Promise<TossCandlePage> {
        const params: Record<string, string> = { symbol: q.symbol, interval: q.interval };
        if (q.count !== undefined) params.count = String(q.count);
        if (q.before !== undefined) params.before = q.before;
        if (q.adjusted !== undefined) params.adjusted = String(q.adjusted);
        const res = await this.authedGet<{ result: TossCandlePageBody }>("/api/v1/candles", params);
        if (!Array.isArray(res.data?.result?.candles)) throw this.toError("/api/v1/candles", res, params);
        return {
            ...res.data.result,
            rateLimit: {
                limit: res.headers["x-ratelimit-limit"] ?? null,
                remaining: res.headers["x-ratelimit-remaining"] ?? null,
                reset: res.headers["x-ratelimit-reset"] ?? null,
            },
        };
    }

    /**
     * 하루치 1분봉. before 로 그날로 바로 건너뛰고, 그날(또는 window.from)보다 앞선 봉이 보이거나 커서가 끝날 때까지 페이지를 넘긴다.
     * 기계적 수집만 한다 — 채움 봉 제거·시각 변환은 소비자 몫. 페이지 경계의 겹침은 시각으로 합친다.
     * 빈 페이지라도 nextBefore 가 있으면 끝으로 보지 않는다(그날 봉을 자른 채 돌려주지 않기 위해).
     */
    async getMinuteCandlesForDate(symbol: string, date: string, options: TossDayMinutesOptions = {}): Promise<TossDayMinutes> {
        const { window, adjusted = false } = options;
        const byTimestamp = new Map<string, TossDayCandle>();
        let duplicates = 0;
        let pages = 0;
        let before = `${date}T${window?.to ?? "23:59:59"}+09:00`;
        for (;;) {
            if (pages >= MAX_DAY_PAGES) {
                throw new TossError(`${symbol} ${date}: ${MAX_DAY_PAGES}쪽을 넘겼다 — 커서 이상`, { symbol, date });
            }
            const page = await this.getCandles({ symbol, interval: "1m", count: 200, before, adjusted });
            pages++;
            let passed = false;
            for (const c of page.candles) {
                const k = kstOf(c.timestamp);
                if (k.date < date || (k.date === date && window && k.time < window.from)) {
                    passed = true;
                    continue;
                }
                if (k.date !== date) continue;
                if (byTimestamp.has(c.timestamp)) duplicates++;
                else byTimestamp.set(c.timestamp, { ...c, kstTime: k.time });
            }
            if (passed || !page.nextBefore) break;
            assertAdvances(before, page.nextBefore);
            before = page.nextBefore;
        }
        const candles = [...byTimestamp.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
        return { candles, pages, duplicates };
    }

    /**
     * 토큰 발급 — 호출 뒤 먼저 받은 토큰은 죽는다. 돌려주는 값은 응답의 칸 이름과 비밀이 아닌 칸만이다(토큰 수명 확인용).
     * 응답 모양이 문서에 없어 허용 목록으로 고른다 — refresh_token 같은 칸이 있어도 값이 로그로 새지 않게.
     */
    async issueToken(): Promise<TossTokenInfo> {
        const { transport, baseUrl, clientId, clientSecret } = this.deps;
        await this.gate();
        const res = await transport.postForm<Record<string, unknown>>(`${baseUrl}/oauth2/token`, {
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
        });
        if (res.status !== 200 || typeof res.data?.access_token !== "string") {
            throw this.toError("oauth2/token", res, {});
        }
        this.token = res.data.access_token;
        return {
            fieldNames: Object.keys(res.data),
            expires_in: res.data.expires_in,
            token_type: res.data.token_type,
            scope: res.data.scope,
        };
    }

    private async authedGet<T>(path: string, params: Record<string, string>): Promise<TossHttpResponse<T>> {
        const { transport, baseUrl, tuning, logger } = this.deps;
        await this.ensureToken();
        let reissued = false;
        for (let attempt = 0; ; attempt++) {
            await this.gate();
            const used = this.token;
            const res = await transport.get<T>(`${baseUrl}${path}`, params, { Authorization: `Bearer ${used}` });
            if (res.status === 200) return res;
            if (res.status === 401 && !reissued) {
                reissued = true;
                logger.warn(`${path} 401 — 토큰을 한 번 새로 받는다`);
                await this.ensureToken(used);
                continue;
            }
            if (res.status === 429 && attempt < tuning.maxRetries) {
                const wait = this.retryDelayMs(res.headers["retry-after"], attempt);
                logger.warn(`${path} 429 — ${wait}ms 대기`);
                await sleep(wait);
                continue;
            }
            throw this.toError(path, res, params);
        }
    }

    /**
     * 토큰을 하나로 모은다. 발급이 진행 중이면 그것을 기다리고, stale 과 다른 토큰이 이미 있으면 발급하지 않는다 —
     * 동시 요청이 저마다 발급하면 서로의 토큰을 죽인다.
     */
    private async ensureToken(stale?: string | null): Promise<void> {
        if (this.token && this.token !== stale) return;
        this.issuing ??= this.issueToken().finally(() => {
            this.issuing = null;
        });
        await this.issuing;
    }

    /** Retry-After(초) 우선, 없으면 지수 백오프. 지터를 더해 재시도가 한 시점에 몰리지 않게 한다. */
    private retryDelayMs(retryAfter: string | undefined, attempt: number): number {
        const seconds = Number(retryAfter);
        const base = retryAfter !== undefined && Number.isFinite(seconds) ? seconds * 1000 : 2 ** attempt * 500;
        return base + Math.floor(Math.random() * 250);
    }

    private toError(apiId: string, res: TossHttpResponse<unknown>, params: Record<string, string>): TossError {
        const body = res.data as TossErrorBody | undefined;
        // 공통 오류는 error 가 객체, 토큰 경로는 OAuth 표준(error 문자열 + error_description)일 수 있다.
        const e = typeof body?.error === "object" ? body.error : undefined;
        const code = e?.code ?? (typeof body?.error === "string" ? body.error : undefined);
        const message = e?.message ?? body?.error_description;
        return new TossError(`토스 요청 실패 [${apiId}] http=${res.status} ${code ?? ""}: ${message ?? ""}`, {
            apiId,
            params,
            http: res.status,
            code,
            message,
            data: e?.data,
            requestId: e?.requestId,
        });
    }

    /** 최소 간격 예약. 지금이 슬롯보다 이르면 그만큼 재운다. */
    private async gate(): Promise<void> {
        const now = Date.now();
        const at = Math.max(now, this.nextSlotAt);
        this.nextSlotAt = at + this.deps.tuning.rateLimitMs;
        if (at > now) await sleep(at - now);
    }
}
