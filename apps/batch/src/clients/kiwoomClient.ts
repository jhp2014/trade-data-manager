import axios, { AxiosInstance } from "axios";
import { logger } from "@/utils/logger";
import fs from "fs";
import path from "path";
import "dotenv/config";

export interface KiwoomApiResponse<T> {
    data: T;
    contYn: string; // 연속 조회 여부 ("Y" or "N")
    nextKey: string; // 다음 데이터 조회를 위한 키값
}

/** [au10001] 접근토큰 발급 응답 스펙    
 * {
    "expires_dt":"20241107083713",
    "token_type":"bearer",
    "token":"WQJCwyqInphKnR3bSRtB9NE1lv..."
    "return_code":0,
    "return_msg":"정상적으로 처리되었습니다"
    }
 */
export interface KiwoomTokenResponse {
    token: string;
    token_type: string;
    expires_dt: string;
}

/* [ka10100] 종목정보조회 응답 스펙
{
    "code":"005930",
    "name":"삼성전자",
    "listCount":"0000000026034239",
    "auditInfo":"정상",
    "regDay":"20090803",    //상장일
    "lastPrice":"00136000",
    "state":"증거금20%|담보대출|신용가능",
    "marketCode":"0",
    "marketName":"거래소",
    "upName":"금융업",
    "upSizeName":"대형주",
    "companyClassName":"",
    "orderWarning":"0",
    "nxtEnable":"Y",
    "return_code":0,
    "return_msg":"정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10100Response {
    code: string;               // 종목코드
    name: string;               // 종목명
    marketName: string;         // 시장명 (예: 코스피, 코스닥)
    nxtEnable: string;          // NXT가능여부 (Y/N)
    regDay: string;
}


/* [ka10001] 주식기본정보요청 응답 스펙
{
    "stk_cd":"005930",
    "stk_nm":"삼성전자",
    "setl_mm":"12",
    "fav":"5000",
    "cap":"1311",
    "flo_stk":"25527",
    "crd_rt":"+0.08",
    "oyr_hgst":"+181400",
    "oyr_lwst":"-91200",
    "mac":"24352",
    "mac_wght":"",
    "for_exh_rt":"0.00",
    "repl_pric":"66780",
    "per":"",
    "eps":"",
    "roe":"",
    "pbr":"",
    "ev":"",
    "bps":"-75300",
    "sale_amt":"0",
    "bus_pro":"0",
    "cup_nga":"0",
    "250hgst":"+124000",
    "250lwst":"-66800",
    "high_pric":"95400",
    "open_pric":"-0",
    "low_pric":"0",
    "upl_pric":"20241016",
    "lst_pric":"-47.41",
    "base_pric":"20231024",
    "exp_cntr_pric":"+26.69",
    "exp_cntr_qty":"95400",
    "250hgst_pric_dt":"3",
    "250hgst_pric_pre_rt":"0",
    "250lwst_pric_dt":"0.00",
    "250lwst_pric_pre_rt":"0",
    "cur_prc":"0.00",
    "pre_sig":"",
    "pred_pre":"",
    "flu_rt":"0",
    "trde_qty":"0",
    "trde_pre":"0",
    "fav_unit":"0",
    "dstr_stk":"0", //유통주식수
    "dstr_rt":"0",  //유통비율
    "return_code":0,
    "return_msg":"정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10001Response {
    stk_cd: string;
    stk_nm: string;
    mac: string;     // 시가총액
    flo_stk: string; // 상장주식수
    dstr_stk: string;   //유통주식수
}

/* [ka10080] 주식분봉차트조회 단일 캔들 스펙
{
    "stk_cd": "005930",
    "stk_min_pole_chart_qry": [
        {
            "cur_prc": "-78800",
            "trde_qty": "7913",
            "cntr_tm": "20250917132000",
            "open_pric": "-78850",
            "high_pric": "-78900",
            "low_pric": "-78800",
            "acc_trde_qty": "14947571",
            "pred_pre": "-600",
            "pred_pre_sig": "5"     //전일대비기호 1: 상한가, 2:상승, 3:보합, 4:하한가, 5:하락
        },
        {
            "cur_prc": "-78900",
            "trde_qty": "16084",
            "cntr_tm": "20250917131900",
            "open_pric": "-78900",
            "high_pric": "-78900",
            "low_pric": "-78800",
            "acc_trde_qty": "14939658",
            "pred_pre": "-500",
            "pred_pre_sig": "5"
        },
    ],
    "return_code": 0,
    "return_msg": "정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10080Response {
    stk_cd: string;
    stk_min_pole_chart_qry: Array<{
        cur_prc: string;    // 종가
        trde_qty: string;   // 거래량
        cntr_tm: string;    // 체결시간
        open_pric: string;  // 시가
        high_pric: string;  // 고가
        low_pric: string;   // 저가
    }>;
}

/* [ka10081] 주식일봉차트조회 단일 캔들 스펙
{
    "stk_cd": "005930",
    "stk_dt_pole_chart_qry": [
        {
            "cur_prc": "70100",
            "trde_qty": "9263135",
            "trde_prica": "648525",
            "dt": "20250908",
            "open_pric": "69800",
            "high_pric": "70500",
            "low_pric": "69600",
            "pred_pre": "+600",
            "pred_pre_sig": "2",
            "trde_tern_rt": "+0.16"
        },
        {
            "cur_prc": "69500",
            "trde_qty": "11526724",
            "trde_prica": "804642",
            "dt": "20250905",
            "open_pric": "70300",
            "high_pric": "70400",
            "low_pric": "69500",
            "pred_pre": "-600",
            "pred_pre_sig": "5",    //전일대비기호 1: 상한가, 2:상승, 3:보합, 4:하한가, 5:하락
            "trde_tern_rt": "+0.19"
        },
    ],
    "return_code": 0,
    "return_msg": "정상적으로 처리되었습니다"
}
*/
export interface KiwoomKa10081Response {
    stk_cd: string;
    stk_dt_pole_chart_qry: Array<{
        cur_prc: string;
        trde_qty: string;
        trde_prica: string; // 거래대금
        dt: string;         // 일자
        open_pric: string;
        high_pric: string;
        low_pric: string;
        pred_pre: string
        pred_pre_sig: string;
    }>;
}


export class KiwoomClient {
    private client: AxiosInstance;
    private accessToken: string | null = null;

    // Rate Limit (1초 4건: 250ms 간격)
    private lastRequestTime: number = 0;
    private readonly RATE_LIMIT_DELAY_MS = 250;

    private readonly appKey = process.env.KIWOOM_APP_KEY;
    private readonly appSecret = process.env.KIWOOM_SECRET_KEY;
    private readonly baseURL = process.env.KIWOOM_BASE_URL;

    constructor() {
        if (!this.appKey || !this.appSecret) {
            logger.error("환경변수 KIWOOM_APP_KEY 또는 KIWOOM_SECRET_KEY가 누락되었습니다.");
            throw new Error("Missing API Credentials");
        }

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 15000,
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
            },
        });
    }

    private get cacheFilePath(): string {
        const cacheDir = path.resolve(process.cwd(), ".cache");
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        return path.join(cacheDir, "kiwoom_token.json");
    }

    private isTokenValid(expiresDt: string): boolean {
        if (!expiresDt || expiresDt.length !== 14) return false;

        const year = parseInt(expiresDt.substring(0, 4), 10);
        const month = parseInt(expiresDt.substring(4, 6), 10) - 1;
        const day = parseInt(expiresDt.substring(6, 8), 10);
        const hour = parseInt(expiresDt.substring(8, 10), 10);
        const min = parseInt(expiresDt.substring(10, 12), 10);
        const sec = parseInt(expiresDt.substring(12, 14), 10);

        const expireTime = new Date(year, month, day, hour, min, sec).getTime();
        const now = Date.now();

        // 만료 5분 전이면 재발급하도록 여유(buffer)를 둠
        return expireTime > now + 5 * 60 * 1000;
    }

    /**
     * [au10001] 접근 토큰 발급
     * 배치가 시작될 때 가장 먼저 실행되어야 해.
     */
    async authenticate(): Promise<void> {
        // 캐시 확인 로직
        if (fs.existsSync(this.cacheFilePath)) {
            try {
                const cached = JSON.parse(fs.readFileSync(this.cacheFilePath, "utf8"));
                if (cached.access_token && cached.expires_dt && this.isTokenValid(cached.expires_dt)) {
                    this.accessToken = cached.access_token;
                    this.client.defaults.headers.common["authorization"] = `Bearer ${this.accessToken}`;
                    logger.info("기존 캐시된 키움 API 토큰을 사용합니다.", { expiresDt: cached.expires_dt });
                    return;
                }
            } catch (err) {
                logger.warn("토큰 캐시 파일 읽기/파싱 실패, 새로 발급합니다.", err);
            }
        }

        logger.info("키움 API 인증을 시작합니다...");
        try {
            const response = await axios.post<KiwoomTokenResponse>(
                `${this.baseURL}/oauth2/token`,
                {
                    grant_type: "client_credentials",
                    appkey: this.appKey,
                    secretkey: this.appSecret,
                }
            );

            this.accessToken = response.data.token;
            this.client.defaults.headers.common["authorization"] = `Bearer ${this.accessToken}`;

            // 새로운 토큰 파일 캐싱
            fs.writeFileSync(
                this.cacheFilePath,
                JSON.stringify({
                    access_token: this.accessToken,
                    expires_dt: response.data.expires_dt,
                }),
                "utf8"
            );

            logger.info("인증 성공: 새 토큰이 발급되고 캐시되었습니다.", {
                expiresIn: response.data.expires_dt,
            });
        } catch (error: any) {
            logger.error("인증 실패: 토큰 발급 중 에리 발생", {
                status: error.response?.status,
                errorData: error.response?.data,
            });
            throw error;
        }
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        // 다음에 요청 가능한 시간 = (현재시간)과 (마지막 예약시간 + 지연시간) 중 늦은 시간
        const scheduledTime = Math.max(now, this.lastRequestTime + this.RATE_LIMIT_DELAY_MS);
        this.lastRequestTime = scheduledTime; // 다음 요청 예약 기준시간 갱신

        const delay = scheduledTime - now;
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    private async post<T>(
        apiId: string,
        endpoint: string,
        body: any,
        contYn: string = "N",
        nextKey: string = ""
    ): Promise<KiwoomApiResponse<T>> {
        if (!this.accessToken) {
            logger.error(`[${apiId}] 요청 실패: 인증 토큰이 없습니다.`);
            throw new Error("Unauthorized: Call authenticate() first.");
        }

        // Rate Limit 보호 기능 실행 (큐 대기)
        await this.waitForRateLimit();

        try {
            logger.debug(`[${apiId}] 요청 전송`, { endpoint, body, contYn, nextKey });
            const response = await this.client.post<T>(endpoint, body, {
                headers: {
                    "api-id": apiId,
                    "cont-yn": contYn,
                    "next-key": nextKey
                },
            });
            return {
                data: response.data,
                contYn: (response.headers["cont-yn"] as string) || "N",
                nextKey: (response.headers["next-key"] as string) || ""
            };
        } catch (error: any) {
            logger.error(`[${apiId}] API 응답 에러`, {
                endpoint,
                requestPayload: body,
                responseHeaders: error.response?.headers,
                responseStatus: error.response?.status,
                responseData: error.response?.data,
            });
            throw error;
        }
    }

    // 1. 종목정보조회
    async getStockInfo(stockCode: string) {
        return this.post<KiwoomKa10100Response>("ka10100", "/api/dostk/stkinfo", { stk_cd: stockCode });
    }

    // 2. 주식기본정보요청
    async getBasicInfo(stockCode: string) {
        return this.post<KiwoomKa10001Response>("ka10001", "/api/dostk/stkinfo", { stk_cd: stockCode });
    }

    // 3. 주식분봉차트조회 (1분봉)
    async getMinuteChart(stockCode: string, baseDate: string = "", contYn: string = "N", nextKey: string = "") {
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

    // 4. 주식일봉차트조회
    async getDailyChart(stockCode: string, baseDate: string, contYn: string = "N", nextKey: string = "") {
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
}

export const kiwoomClient = new KiwoomClient();