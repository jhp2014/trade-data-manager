// KRX OPEN API 원시 REST 클라이언트 — 포트를 모른다(도메인 미인지). core 포트 매핑은 infra/broker 가 한다.
// KIS/키움과 달리 토큰 발급도 자격증명 풀도 없다: 요청마다 헤더 AUTH_KEY 하나가 전부.
import { KrxError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { KrxTuning } from "../config.js";
import type { KrxTransport } from "../transport.js";
import type { KrxApiResponse, KrxByddTrdResponse, KrxMarket } from "./types.js";

export interface KrxRestDeps {
    transport: KrxTransport;
    authKey: string;
    baseUrl: string;
    tuning: KrxTuning;
    logger: Logger;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class KrxRest {
    /** 다음 요청이 나갈 수 있는 가장 이른 시각(ms). 동시 호출이 와도 슬롯을 겹치지 않게 예약제로 준다. */
    private nextSlotAt = 0;

    constructor(private readonly deps: KrxRestDeps) {}

    /**
     * [{market}_bydd_trd] 일별매매정보 — 기준일 하루의 **전종목** 1응답.
     * @param market stk 유가증권 · ksq 코스닥 · knx 코넥스
     * @param basDd 기준일자 YYYYMMDD. 휴장일 동작은 recon 이 확정한다(빈 배열 예상).
     */
    async getByddTrd(market: KrxMarket, basDd: string): Promise<KrxApiResponse<KrxByddTrdResponse>> {
        return this.get<KrxByddTrdResponse>(`${market}_bydd_trd`, { basDd });
    }

    /** 공통 GET — 유량 게이트 + 헤더 + 실패 판정. 성공 판정은 "status 200 + 본문이 객체"까지만(키 존재는 호출자 몫). */
    private async get<T>(apiId: string, params: Record<string, string>): Promise<KrxApiResponse<T>> {
        const { transport, authKey, baseUrl, logger } = this.deps;
        await this.gate();

        const url = `${baseUrl}/sto/${apiId}`;
        const res = await transport.get<T>(url, params, { AUTH_KEY: authKey });

        if (res.status !== 200) {
            throw new KrxError(`KRX 요청 실패 [${apiId}] status=${res.status}`, {
                apiId,
                params,
                status: res.status,
                body: res.data,
            });
        }
        if (!res.data || typeof res.data !== "object") {
            throw new KrxError(`KRX 응답이 객체가 아니다 [${apiId}]`, { apiId, params, body: res.data });
        }
        logger.debug(`${apiId} ok`, params);
        return res;
    }

    /** 최소 간격 예약. 지금이 슬롯보다 이르면 그만큼 재운다. */
    private async gate(): Promise<void> {
        const now = Date.now();
        const at = Math.max(now, this.nextSlotAt);
        this.nextSlotAt = at + this.deps.tuning.rateLimitMs;
        if (at > now) await sleep(at - now);
    }
}
