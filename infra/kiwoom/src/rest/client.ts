import type { CredentialPool, CredentialLease } from "../credentialPool.js";
import type { KiwoomTransport } from "../transport.js";
import type { KiwoomTuning } from "../config.js";
import type { Logger } from "../logger.js";
import { KiwoomError } from "../errors.js";
import { sleep, backoffDelay } from "../util.js";
import type {
    KiwoomApiResponse,
    KiwoomKa10099Entry,
    KiwoomKa10100Response,
    KiwoomKa10001Response,
    KiwoomKa10080Response,
    KiwoomKa10081Response,
    KiwoomDailyCandle,
    KiwoomMinuteCandle,
} from "./types.js";

export interface KiwoomRestDeps {
    pool: CredentialPool;
    transport: KiwoomTransport;
    baseUrl: string;
    tuning: KiwoomTuning;
    logger: Logger;
}

export interface RequestOptions {
    /** 지정 시 해당 자격증명에 핀 고정(페이지네이션 시퀀스용). 미지정이면 풀에서 라운드로빈. */
    lease?: CredentialLease;
    contYn?: string;
    nextKey?: string;
}

/**
 * 키움 REST 클라이언트.
 * 소비자는 그냥 호출하고 데이터만 받는다 — rate 페이싱, 키 로테이션, 429 failover,
 * 401 토큰 재발급, 네트워크 백오프 재시도를 내부에서 처리한다.
 */
export class KiwoomRest {
    constructor(private readonly deps: KiwoomRestDeps) {}

    /** 저수준 호출. 모든 TR 메서드가 이걸 거친다. */
    async request<T>(
        apiId: string,
        endpoint: string,
        body: Record<string, unknown>,
        opts: RequestOptions = {},
    ): Promise<KiwoomApiResponse<T>> {
        const { tuning, transport, baseUrl, logger, pool } = this.deps;
        const pinned = opts.lease; // 페이지네이션이면 같은 키 유지
        let lease = pinned ?? pool.acquire();
        let attempt = 0;

        for (;;) {
            await lease.pace(apiId);
            try {
                const token = await lease.getToken();
                const res = await transport.post<T>(`${baseUrl}${endpoint}`, body, {
                    authorization: `Bearer ${token}`,
                    "api-id": apiId,
                    "cont-yn": opts.contYn ?? "N",
                    "next-key": opts.nextKey ?? "",
                });

                if (res.status === 429) {
                    lease.reportRateLimited();
                    if (++attempt > tuning.maxRetries) {
                        throw new KiwoomError(`rate limit 초과 — 재시도 소진 [${apiId}]`, {
                            apiId,
                            status: 429,
                        });
                    }
                    // 핀 고정(페이지네이션)이면 같은 키로 쿨다운만큼 쉬었다 재시도(커서 유지).
                    // 단발이면 다른 키로 failover.
                    if (pinned) await sleep(tuning.cooldownMs);
                    else lease = pool.acquire();
                    continue;
                }

                if (res.status === 401) {
                    if (++attempt > tuning.maxRetries) {
                        throw new KiwoomError(`인증 실패 [${apiId}]`, { apiId, status: 401 });
                    }
                    await lease.getToken(true); // 토큰 강제 재발급 후 재시도
                    continue;
                }

                if (res.status < 200 || res.status >= 300) {
                    throw new KiwoomError(`키움 API 오류 HTTP ${res.status} [${apiId}]`, {
                        apiId,
                        status: res.status,
                        data: res.data,
                    });
                }

                logger.debug(`키움 요청 성공 [${apiId}] cred=${lease.credential.id}`);
                return {
                    data: res.data,
                    contYn: res.headers["cont-yn"] ?? "N",
                    nextKey: res.headers["next-key"] ?? "",
                };
            } catch (err) {
                if (err instanceof KiwoomError) throw err; // 비재시도성 4xx 등은 그대로 전파
                // 네트워크/전송 오류 → 백오프 후 재시도(단발이면 failover).
                if (++attempt > tuning.maxRetries) {
                    throw new KiwoomError(`키움 요청 실패 [${apiId}]: ${(err as Error).message}`, {
                        apiId,
                        cause: (err as Error).message,
                    });
                }
                logger.warn(
                    `키움 요청 오류 재시도 ${attempt}/${tuning.maxRetries} [${apiId}]: ${(err as Error).message}`,
                );
                if (!pinned) lease = pool.acquire();
                await sleep(backoffDelay(attempt));
            }
        }
    }

    // ── TR 메서드 (단발) ─────────────────────────────────────────────

    /** [ka10100] 종목정보조회 */
    getStockInfo(stockCode: string, opts?: RequestOptions) {
        return this.request<KiwoomKa10100Response>(
            "ka10100",
            "/api/dostk/stkinfo",
            { stk_cd: stockCode },
            opts,
        );
    }

    /** [ka10001] 주식기본정보요청 */
    getBasicInfo(stockCode: string, opts?: RequestOptions) {
        return this.request<KiwoomKa10001Response>(
            "ka10001",
            "/api/dostk/stkinfo",
            { stk_cd: stockCode },
            opts,
        );
    }

    /** [ka10080] 주식분봉차트조회 (1분봉) */
    getMinuteChart(stockCode: string, params: { baseDate?: string } & RequestOptions = {}) {
        const { baseDate = "", ...opts } = params;
        return this.request<KiwoomKa10080Response>(
            "ka10080",
            "/api/dostk/chart",
            { stk_cd: stockCode, tic_scope: "1", upd_stkpc_tp: "1", base_dt: baseDate },
            opts,
        );
    }

    /** [ka10081] 주식일봉차트조회 */
    getDailyChart(stockCode: string, params: { baseDate: string } & RequestOptions) {
        const { baseDate, ...opts } = params;
        return this.request<KiwoomKa10081Response>(
            "ka10081",
            "/api/dostk/chart",
            { stk_cd: stockCode, upd_stkpc_tp: "1", base_dt: baseDate },
            opts,
        );
    }

    /**
     * [ka10081] 주식일봉차트조회 — 원주가(upd_stkpc_tp:"0", 미수정).
     * 수정주가판 getDailyChart 와 의도적으로 분리: 시총 백필 등 절대가가 필요한 소비자 전용.
     */
    getRawDailyChart(stockCode: string, params: { baseDate: string } & RequestOptions) {
        const { baseDate, ...opts } = params;
        return this.request<KiwoomKa10081Response>(
            "ka10081",
            "/api/dostk/chart",
            { stk_cd: stockCode, upd_stkpc_tp: "0", base_dt: baseDate },
            opts,
        );
    }

    // ── 고수준 (연속조회, 한 키에 핀 고정) ───────────────────────────

    /**
     * [ka10099] 종목정보 리스트 — 연속조회로 전부 수집한 뒤 **개별주식만**(marketName ∈ {거래소,코스닥}) 반환.
     * ka10099 응답엔 ETF/ETN/리츠/펀드가 섞여 오지만(실측), 이 메서드는 그 정의상 "개별 상장주식"만 준다.
     * 진짜 raw 전체(ETF/ETN 포함)가 필요하면 저수준 `request("ka10099", ...)` 를 직접 쓸 것.
     * marketCode: 0=코스피 10=코스닥 (키움 mrkt_tp).
     */
    async getStockList(marketCode: string): Promise<KiwoomKa10099Entry[]> {
        const lease = this.deps.pool.acquire(); // 시퀀스 전체를 한 키에 고정
        const out: KiwoomKa10099Entry[] = [];
        let contYn = "N";
        let nextKey = "";
        let pages = 0;
        do {
            const res = await this.request<{ list?: KiwoomKa10099Entry[] }>(
                "ka10099",
                "/api/dostk/stkinfo",
                { mrkt_tp: marketCode },
                { lease, contYn, nextKey },
            );
            for (const e of res.data.list ?? []) {
                // 거래소(코스피)·코스닥 = 개별주식. 그 외(ETF/ETN/리츠/인프라/뮤추얼)는 제외.
                if (e.marketName === "거래소" || e.marketName === "코스닥") out.push(e);
            }
            contYn = res.contYn;
            nextKey = res.nextKey;
            pages++;
        } while (contYn === "Y" && nextKey && pages < 50);
        return out;
    }

    /** 목표 개수를 채울 때까지 일봉 연속조회를 자동 처리. */
    async getDailyChartsByCount(
        stockCode: string,
        baseDate: string,
        targetCount = 600,
    ): Promise<KiwoomDailyCandle[]> {
        const lease = this.deps.pool.acquire(); // 시퀀스 전체를 한 키에 고정
        let collected: KiwoomDailyCandle[] = [];
        let contYn = "N";
        let nextKey = "";
        do {
            const res = await this.getDailyChart(stockCode, { baseDate, contYn, nextKey, lease });
            collected = collected.concat(res.data.stk_dt_pole_chart_qry ?? []);
            contYn = res.contYn;
            nextKey = res.nextKey;
        } while (collected.length < targetCount && contYn === "Y" && nextKey);
        return collected.slice(0, targetCount);
    }

    /**
     * 기간[from,to] 일봉을 연속조회로 수집(both YYYYMMDD).
     * 키움 일봉은 최신→과거 순 → baseDate=to 에서 역방향, 가장 오래된 dt 가 from 이전이면 종료.
     * 반환은 from 이전 과거가 일부 섞일 수 있음(경계 페이지) — 정확한 [from,to] 절단은 소비자(어댑터) 책임.
     * NXT 통합은 stockCode 를 'XXXXXX_AL' 로 넘기면 됨(그대로 전달).
     */
    async getDailyChartsForRange(
        stockCode: string,
        fromDate: string,
        toDate: string,
        maxPages = 20,
    ): Promise<KiwoomDailyCandle[]> {
        const lease = this.deps.pool.acquire(); // 시퀀스 전체를 한 키에 고정
        let collected: KiwoomDailyCandle[] = [];
        let contYn = "N";
        let nextKey = "";
        let pages = 0;
        do {
            const res = await this.getDailyChart(stockCode, { baseDate: toDate, contYn, nextKey, lease });
            const page = res.data.stk_dt_pole_chart_qry ?? [];
            if (page.length === 0) break;
            collected = collected.concat(page);
            const oldest = page[page.length - 1];
            if (oldest && oldest.dt < fromDate) break;
            contYn = res.contYn;
            nextKey = res.nextKey;
            pages++;
        } while (contYn === "Y" && nextKey && pages < maxPages);
        return collected;
    }

    /** 기간[from,to] 원주가(미수정) 일봉을 연속조회로 수집. getDailyChartsForRange 의 원주가판(시총 백필 전용). */
    async getRawDailyChartsForRange(
        stockCode: string,
        fromDate: string,
        toDate: string,
        maxPages = 20,
    ): Promise<KiwoomDailyCandle[]> {
        const lease = this.deps.pool.acquire(); // 시퀀스 전체를 한 키에 고정
        let collected: KiwoomDailyCandle[] = [];
        let contYn = "N";
        let nextKey = "";
        let pages = 0;
        do {
            const res = await this.getRawDailyChart(stockCode, { baseDate: toDate, contYn, nextKey, lease });
            const page = res.data.stk_dt_pole_chart_qry ?? [];
            if (page.length === 0) break;
            collected = collected.concat(page);
            const oldest = page[page.length - 1];
            if (oldest && oldest.dt < fromDate) break;
            contYn = res.contYn;
            nextKey = res.nextKey;
            pages++;
        } while (contYn === "Y" && nextKey && pages < maxPages);
        return collected;
    }

    /**
     * 특정 거래일의 1분봉을 모두 수집.
     * 키움 분봉은 최신→과거 순 → 가장 오래된 row 가 tradeDate 이전이 되면 종료.
     * NXT 통합은 stockCode 를 'XXXXXX_AL' 로 넘기면 됨(그대로 전달).
     */
    async getMinuteChartsForDate(
        stockCode: string,
        tradeDate: string,
        maxPages = 5,
    ): Promise<KiwoomMinuteCandle[]> {
        const lease = this.deps.pool.acquire(); // 시퀀스 전체를 한 키에 고정
        let collected: KiwoomMinuteCandle[] = [];
        let contYn = "N";
        let nextKey = "";
        let pages = 0;
        do {
            const res = await this.getMinuteChart(stockCode, { baseDate: tradeDate, contYn, nextKey, lease });
            const page = res.data.stk_min_pole_chart_qry ?? [];
            if (page.length === 0) break;
            collected = collected.concat(page);
            const oldest = page[page.length - 1];
            if (oldest && oldest.cntr_tm.substring(0, 8) < tradeDate) break;
            contYn = res.contYn;
            nextKey = res.nextKey;
            pages++;
        } while (contYn === "Y" && nextKey && pages < maxPages);
        return collected;
    }
}
