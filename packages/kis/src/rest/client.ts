import type { CredentialPool, CredentialLease } from "../credentialPool.js";
import type { KisTransport } from "../transport.js";
import type { KisTuning } from "../config.js";
import type { Logger } from "../logger.js";
import { KisError } from "../errors.js";
import { sleep, backoffDelay } from "../util.js";
import type {
    KisApiResponse,
    KisMinuteCandle,
    KisMinuteChartResponse,
    KisNewsResponse,
    KisResponseBase,
} from "./types.js";

export interface KisRestDeps {
    pool: CredentialPool;
    transport: KisTransport;
    baseUrl: string;
    tuning: KisTuning;
    custType: string;
    logger: Logger;
}

export interface RequestOptions {
    /** 지정 시 해당 자격증명에 핀 고정(페이지네이션 시퀀스용). 미지정이면 풀에서 라운드로빈. */
    lease?: CredentialLease;
    /** 연속조회 헤더 tr_cont: 최초 "" , 다음 페이지 "N". */
    trCont?: string;
}

/** KIS 유량초과 코드 — rt_cd≠0 + msg_cd=EGW00201. HTTP 429 가 아니라 바디로 온다. */
const RATE_LIMIT_CODE = "EGW00201";
/** 토큰 만료/오류 코드 — 강제 재발급 후 재시도. */
const TOKEN_EXPIRED_CODES = new Set(["EGW00123", "EGW00121", "EGW00133"]);

/**
 * KIS REST 클라이언트.
 * 소비자는 그냥 호출하고 데이터만 받는다 — rate 페이싱, 키 로테이션, 유량초과 failover,
 * 토큰 만료 재발급, 네트워크 백오프 재시도를 내부에서 처리한다.
 * KIS 시세는 전부 GET + tr_id 헤더라 저수준 get() 하나로 모든 TR 을 태운다.
 */
export class KisRest {
    constructor(private readonly deps: KisRestDeps) {}

    /** 저수준 GET 호출. 모든 TR 메서드가 이걸 거친다. */
    async get<T extends KisResponseBase>(
        trId: string,
        endpoint: string,
        params: Record<string, string>,
        opts: RequestOptions = {},
    ): Promise<KisApiResponse<T>> {
        const { tuning, transport, baseUrl, custType, logger, pool } = this.deps;
        const pinned = opts.lease; // 페이지네이션이면 같은 키 유지
        let lease = pinned ?? pool.acquire();
        let attempt = 0;

        for (;;) {
            await lease.pace();
            try {
                const token = await lease.getToken();
                const res = await transport.get<T>(`${baseUrl}${endpoint}`, params, {
                    ...lease.credential.authHeaders(token),
                    tr_id: trId,
                    custtype: custType,
                    tr_cont: opts.trCont ?? "",
                });

                // 네트워크 인증(드묾) — 토큰 강제 재발급 후 재시도.
                if (res.status === 401 || res.status === 403) {
                    if (++attempt > tuning.maxRetries) {
                        throw new KisError(`인증 실패 HTTP ${res.status} [${trId}]`, { trId, status: res.status });
                    }
                    await lease.getToken(true);
                    continue;
                }

                const body = res.data;
                const msgCd = body?.msg_cd;

                // 유량초과 — KIS 는 429 가 아니라 바디 msg_cd=EGW00201 로 온다.
                if (msgCd === RATE_LIMIT_CODE) {
                    lease.reportRateLimited();
                    if (++attempt > tuning.maxRetries) {
                        throw new KisError(`유량초과 — 재시도 소진 [${trId}]`, { trId, msgCd });
                    }
                    // 핀 고정(페이지네이션)이면 같은 키로 쿨다운만큼 쉬었다 재시도(커서 유지). 단발이면 다른 키로 failover.
                    if (pinned) await sleep(tuning.cooldownMs);
                    else lease = pool.acquire();
                    continue;
                }

                // 토큰 만료 — 강제 재발급 후 재시도.
                if (msgCd && TOKEN_EXPIRED_CODES.has(msgCd)) {
                    if (++attempt > tuning.maxRetries) {
                        throw new KisError(`토큰 오류 [${trId}]: ${body?.msg1 ?? msgCd}`, { trId, msgCd });
                    }
                    await lease.getToken(true);
                    continue;
                }

                if (res.status < 200 || res.status >= 300) {
                    throw new KisError(`KIS API 오류 HTTP ${res.status} [${trId}]`, {
                        trId,
                        status: res.status,
                        data: body,
                    });
                }

                // rt_cd "0" 만 성공. 그 외(위에서 안 걸린 코드)는 비재시도성 오류로 전파.
                if (body?.rt_cd !== "0") {
                    throw new KisError(`KIS 응답 오류 [${trId}]: ${body?.msg1 ?? "rt_cd≠0"} (${msgCd})`, {
                        trId,
                        rtCd: body?.rt_cd,
                        msgCd,
                    });
                }

                logger.debug(`KIS 요청 성공 [${trId}] cred=${lease.credential.id}`);
                return { data: body, trCont: res.headers["tr_cont"] ?? "" };
            } catch (err) {
                if (err instanceof KisError) throw err; // 비재시도성 오류는 그대로 전파
                // 네트워크/전송 오류 → 백오프 후 재시도(단발이면 failover).
                if (++attempt > tuning.maxRetries) {
                    throw new KisError(`KIS 요청 실패 [${trId}]: ${(err as Error).message}`, {
                        trId,
                        cause: (err as Error).message,
                    });
                }
                logger.warn(
                    `KIS 요청 오류 재시도 ${attempt}/${tuning.maxRetries} [${trId}]: ${(err as Error).message}`,
                );
                if (!pinned) lease = pool.acquire();
                await sleep(backoffDelay(attempt));
            }
        }
    }

    // ── TR 메서드 ────────────────────────────────────────────────────

    /**
     * [FHKST03010200] 주식당일분봉조회.
     * 한 번에 최근 30건(time 기준 과거로)을 돌려준다. 핵심 필드 acml_tr_pbmn(누적거래대금).
     * @param time 조회 기준시간 HHMMSS. ""(기본)이면 최신.
     * @param includePast 과거 데이터 포함(FID_PW_DATA_INCU_YN). 기본 true.
     * @param marketDiv 시장구분(FID_COND_MRKT_DIV_CODE). 기본 "J"(주식/ETF/ETN).
     */
    getMinuteChart(
        stockCode: string,
        params: {
            time?: string;
            includePast?: boolean;
            marketDiv?: string;
        } & RequestOptions = {},
    ): Promise<KisApiResponse<KisMinuteChartResponse>> {
        const { time = "", includePast = true, marketDiv = "J", ...opts } = params;
        return this.get<KisMinuteChartResponse>(
            "FHKST03010200",
            "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
            {
                FID_ETC_CLS_CODE: "",
                FID_COND_MRKT_DIV_CODE: marketDiv,
                FID_INPUT_ISCD: stockCode,
                FID_INPUT_HOUR_1: time,
                FID_PW_DATA_INCU_YN: includePast ? "Y" : "N",
            },
            opts,
        );
    }

    /**
     * [FHKST03010230] 주식일별분봉조회. 과거 특정일의 분봉을 1회 최대 120건 돌려준다(time 기준 과거로).
     * KIS 분봉 보존은 약 1년치(~250 거래일 롤링) — 그 이전은 rt_cd 0 + 빈 배열.
     * @param date 조회 기준일 YYYYMMDD.
     * @param time 조회 기준시간 HHMMSS. 그 시각부터 과거 120봉.
     * @param fakeTick 허봉(체결 없는 분의 채움봉) 포함 여부(FID_FAKE_TICK_INCU_YN). 기본 false.
     * @param marketDiv 시장구분(FID_COND_MRKT_DIV_CODE). 기본 "J"(KRX). NXT="NX", 통합="UN".
     */
    getDailyMinuteChart(
        stockCode: string,
        params: {
            date: string;
            time?: string;
            includePast?: boolean;
            fakeTick?: boolean;
            marketDiv?: string;
        } & RequestOptions,
    ): Promise<KisApiResponse<KisMinuteChartResponse>> {
        const { date, time = "153000", includePast = true, fakeTick = false, marketDiv = "J", ...opts } = params;
        return this.get<KisMinuteChartResponse>(
            "FHKST03010230",
            "/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice",
            {
                FID_COND_MRKT_DIV_CODE: marketDiv,
                FID_INPUT_ISCD: stockCode,
                FID_INPUT_HOUR_1: time,
                FID_INPUT_DATE_1: date,
                FID_PW_DATA_INCU_YN: includePast ? "Y" : "N",
                FID_FAKE_TICK_INCU_YN: fakeTick ? "Y" : "N",
            },
            opts,
        );
    }

    /**
     * 하루치 분봉을 통째로 수집(고수준). getDailyMinuteChart(120봉/콜)를 시간 역순으로 페이징해 모은다.
     *
     * 책임 = **기계적 수집만**: 페이징·중복제거·날짜필터·오름차순 정렬. 합의된 경계상
     * %·거래대금(OHLC평균×량)·누적 같은 도메인 계산은 하지 않는다(중립 포트/소비자 책임).
     * 빈 분은 채우지 않는다(키움과 동일 — 존재하는 봉만).
     *
     * @param marketDiv 기본 "UN"(통합) — NXT 프리마켓(08:00~)부터 정규장 마감까지 포함. KRX만이면 "J".
     * @param startTime 페이징 시작 시각(이 시각부터 과거로). 기본 "153000"(정규장 마감). 시간외까지면 "200000".
     * @param earliestTime 이 시각 이하로 내려가면 종료. 기본 "080000"(NXT 프리마켓 시작).
     * @returns 시간 오름차순 정렬된 분봉 배열(원시 KisMinuteCandle).
     */
    async collectDayMinutes(
        stockCode: string,
        date: string,
        params: { marketDiv?: string; startTime?: string; earliestTime?: string; maxPages?: number } = {},
    ): Promise<KisMinuteCandle[]> {
        const { marketDiv = "UN", startTime = "153000", earliestTime = "080000", maxPages = 12 } = params;
        const lease = this.deps.pool.acquire(); // 시퀀스 전체를 한 키에 핀 고정
        const byTime = new Map<string, KisMinuteCandle>();
        let time = startTime;

        for (let page = 0; page < maxPages; page++) {
            const res = await this.getDailyMinuteChart(stockCode, { date, time, marketDiv, lease });
            const candles = (res.data.output2 ?? []).filter((c) => c.stck_bsop_date === date);
            if (candles.length === 0) break;

            const before = byTime.size;
            for (const c of candles) byTime.set(c.stck_cntg_hour, c);
            if (byTime.size === before) break; // 새 봉 없음(중복뿐) → 진전 없으니 종료

            // 응답은 최신→과거(내림차순) → 마지막이 가장 오래된 봉.
            const oldest = candles[candles.length - 1].stck_cntg_hour;
            if (oldest <= earliestTime) break; // 장 시작(프리마켓) 도달
            time = oldest; // 다음 페이지는 이 시각부터 더 과거로(겹치는 봉은 dedup)
        }

        return [...byTime.values()].sort((a, b) => a.stck_cntg_hour.localeCompare(b.stck_cntg_hour));
    }

    /**
     * [FHKST01011800] 종합 시황/공시(제목) 조회.
     * 종목코드를 주면 해당 종목 뉴스, 비우면 전체 시황 뉴스. params 의미는 recon 으로 확정.
     */
    getNewsTitles(
        params: {
            stockCode?: string;
            marketClsCode?: string;
            entpCode?: string;
            date?: string;
            time?: string;
            titleKeyword?: string;
            sortClsCode?: string;
            serialNo?: string;
        } & RequestOptions = {},
    ): Promise<KisApiResponse<KisNewsResponse>> {
        const {
            stockCode = "",
            marketClsCode = "",
            entpCode = "",
            date = "",
            time = "",
            titleKeyword = "",
            sortClsCode = "",
            serialNo = "",
            ...opts
        } = params;
        return this.get<KisNewsResponse>(
            "FHKST01011800",
            "/uapi/domestic-stock/v1/quotations/news-title",
            {
                FID_NEWS_OFER_ENTP_CODE: entpCode,
                FID_COND_MRKT_CLS_CODE: marketClsCode,
                FID_INPUT_ISCD: stockCode,
                FID_TITL_CNTT: titleKeyword,
                FID_INPUT_DATE_1: date,
                FID_INPUT_HOUR_1: time,
                FID_RANK_SORT_CLS_CODE: sortClsCode,
                FID_INPUT_SRNO: serialNo,
            },
            opts,
        );
    }
}
