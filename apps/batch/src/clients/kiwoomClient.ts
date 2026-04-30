import axios, { AxiosInstance } from "axios";
import { kiwoomConfig } from "./config.js";
import { tokenManager } from "./tokenManager.js";
import { KiwoomRequest } from "./decorators.js";
import {
    KiwoomKa10100Response,
    KiwoomKa10001Response,
    KiwoomKa10080Response,
    KiwoomKa10081Response,
    KiwoomApiResponse,
    KiwoomMinuteCandle,
    KiwoomDailyCandle
} from "./types.js";

export class KiwoomClient {
    private client: AxiosInstance;
    private lastRequestTime: number = 0;

    constructor() {
        this.client = axios.create({
            baseURL: kiwoomConfig.baseUrl,
            timeout: 15000,
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
            },
        });
    }

    /**
     * 💡 공통 요청 래퍼 메서드 (인터셉터 역할 대체)
     * 인증 토큰 주입, 헤더 설정, Rate Limit 대기를 한 번에 처리합니다.
     */
    private async post<T>(
        apiId: string,
        endpoint: string,
        body: any,
        contYn: string = "N",
        nextKey: string = ""
    ): Promise<KiwoomApiResponse<T>> {
        // 1. Rate Limit 보호
        await this.waitForRateLimit();

        // 2. 유효한 토큰 가져오기 (비동기)
        const token = await tokenManager.getValidToken();

        // 3. 실제 요청 전송
        const response = await this.client.post<T>(endpoint, body, {
            headers: {
                "authorization": `Bearer ${token}`,
                "api-id": apiId,
                "cont-yn": contYn,
                "next-key": nextKey
            },
        });

        // 4. 공통 응답 포맷 반환
        return {
            data: response.data,
            contYn: (response.headers["cont-yn"] as string) || "N",
            nextKey: (response.headers["next-key"] as string) || ""
        };
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const scheduledTime = Math.max(now, this.lastRequestTime + kiwoomConfig.rateLimitMs);
        this.lastRequestTime = scheduledTime;

        const delay = scheduledTime - now;
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * [ka10100] 종목정보조회
     */
    @KiwoomRequest("ka10100")
    async getStockInfo(stockCode: string) {
        return this.post<KiwoomKa10100Response>("ka10100", "/api/dostk/stkinfo", { stk_cd: stockCode });
    }

    /**
     * [ka10001] 주식기본정보요청
     */
    @KiwoomRequest("ka10001")
    async getBasicInfo(stockCode: string) {
        return this.post<KiwoomKa10001Response>("ka10001", "/api/dostk/stkinfo", { stk_cd: stockCode });
    }

    /**
     * [ka10080] 주식분봉차트조회 (1분봉)
     */
    @KiwoomRequest("ka10080")
    async getMinuteChart(
        stockCode: string,
        baseDate: string = "",
        contYn: string = "N",
        nextKey: string = ""
    ) {
        return this.post<KiwoomKa10080Response>(
            "ka10080",
            "/api/dostk/chart",
            {
                stk_cd: stockCode,
                tic_scope: "1",
                upd_stkpc_tp: "1",
                base_dt: baseDate,
            },
            contYn,
            nextKey
        );
    }

    /**
     * [ka10081] 주식일봉차트조회
     */
    @KiwoomRequest("ka10081")
    async getDailyChart(
        stockCode: string,
        baseDate: string,
        contYn: string = "N",
        nextKey: string = ""
    ) {
        return this.post<KiwoomKa10081Response>(
            "ka10081",
            "/api/dostk/chart",
            {
                stk_cd: stockCode,
                upd_stkpc_tp: "1",
                base_dt: baseDate,
            },
            contYn,
            nextKey
        );
    }

    /**
     * [고수준 메서드] 요청한 캔들 개수를 충족할 때까지 연속 조회를 자동으로 처리합니다.
     * @param stockCode 종목코드
     * @param baseDate 기준일자
     * @param targetCount 가져올 캔들의 목표 개수 (기본값: 예를 들어 100개)
    */
    async getDailyChartsByCount(
        stockCode: string,
        baseDate: string,
        targetCount: number = 600 // 한 번에 600개
    ): Promise<KiwoomDailyCandle[]> {

        let collected: KiwoomDailyCandle[] = [];
        let contYn = "N";
        let nextKey = "";

        do {
            // 1. API 호출 (최초 호출 시 contYn="N", nextKey="" 적용)
            const response = await this.getDailyChart(stockCode, baseDate, contYn, nextKey);
            const pageCandles = response.data.stk_dt_pole_chart_qry ?? [];

            // 2. 수집된 배열에 현재 페이지 데이터 병합
            collected = [...collected, ...pageCandles];

            // 3. 다음 페이지를 위한 키값 갱신
            contYn = response.contYn;
            nextKey = response.nextKey;

        } while (collected.length < targetCount && contYn === "Y" && nextKey);

        // 4. API가 한 번에 많은 데이터를 주어 targetCount를 초과했을 수 있으므로
        //    정확히 사용자가 요청한 개수만큼만 잘라서(slice) 반환합니다.
        return collected.slice(0, targetCount);
    }

    /**
     * [고수준 메서드] 특정 거래일의 1분봉을 모두 수집합니다.
     * 키움 분봉 API는 최신→과거 순으로 내려주므로,
     * 가장 오래된 row가 tradeDate 이전이 되면 더 이상 가져올 필요 없음.
     *
     * @param stockCode 종목코드 (NXT 통합은 'XXXXXX_AL')
     * @param tradeDate 'YYYYMMDD' 형식
     * @param maxPages 안전장치 (기본 5페이지)
     */
    async getMinuteChartsForDate(
        stockCode: string,
        tradeDate: string,
        maxPages: number = 5,
    ): Promise<KiwoomMinuteCandle[]> {
        let collected: KiwoomMinuteCandle[] = [];
        let contYn = "N";
        let nextKey = "";
        let pages = 0;

        do {
            const response = await this.getMinuteChart(stockCode, tradeDate, contYn, nextKey);
            const page = response.data.stk_min_pole_chart_qry ?? [];
            if (page.length === 0) break;

            collected = [...collected, ...page];

            // 가장 오래된 row가 이미 tradeDate 이전이면 종료
            const oldest = page[page.length - 1];
            if (oldest && oldest.cntr_tm.substring(0, 8) < tradeDate) break;

            contYn = response.contYn;
            nextKey = response.nextKey;
            pages++;
        } while (contYn === "Y" && nextKey && pages < maxPages);

        return collected;
    }
}

export const kiwoomClient = new KiwoomClient();