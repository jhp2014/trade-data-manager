import type { KiwoomTransport } from "./transport.js";
import { type TokenStore, credentialCacheKey } from "./tokenStore.js";
import type { Logger } from "./logger.js";
import { KiwoomError } from "./errors.js";
import { isTokenValid } from "./util.js";

interface KiwoomTokenResponse {
    token: string;
    token_type: string;
    expires_dt: string;
    return_code: number;
    return_msg: string;
}

export interface CredentialDeps {
    baseUrl: string;
    transport: KiwoomTransport;
    tokenStore: TokenStore;
    logger: Logger;
    tokenMarginMs: number;
}

/**
 * 자격증명 1개의 모든 상태를 캡슐화한다:
 *  - 토큰 발급/캐시(메모리 + tokenStore, single-flight 갱신)
 *  - (자격증명 × TR) 단위 rate 시계 → reserve()
 *  - rate limit 직후 쿨다운
 * 풀은 이 객체들을 라운드로빈/failover 로 굴린다.
 */
export class Credential {
    /** appKey 해시(노출 안전). 캐시 파일명·로그·핀고정 식별에 사용. */
    readonly id: string;

    private token: string | null = null;
    private expiresDt: string | null = null;
    /** apiId → 다음 호출 가능 시각(epoch ms). TR 별 독립 버킷. */
    private readonly clocks = new Map<string, number>();
    private cooldownUntil = 0;
    private refreshing: Promise<string> | null = null;

    constructor(
        private readonly appKey: string,
        private readonly secretKey: string,
        private readonly deps: CredentialDeps,
    ) {
        this.id = credentialCacheKey(appKey);
    }

    // ── 쿨다운(failover) ───────────────────────────────────────────
    isAvailable(now = Date.now()): boolean {
        return now >= this.cooldownUntil;
    }
    get availableAt(): number {
        return this.cooldownUntil;
    }
    cooldown(ms: number): void {
        this.cooldownUntil = Date.now() + ms;
    }

    // ── rate 페이싱 ────────────────────────────────────────────────
    /**
     * 이 TR 슬롯을 예약하고, 호출자가 대기해야 할 ms 를 반환한다.
     * 같은 TR 의 연속 호출은 rateLimitMs 이상 벌어진다. TR 이 다르면 서로 영향 없음.
     */
    reserve(apiId: string, rateLimitMs: number): number {
        const now = Date.now();
        const scheduled = Math.max(now, this.clocks.get(apiId) ?? 0);
        this.clocks.set(apiId, scheduled + rateLimitMs);
        return scheduled - now;
    }

    // ── 토큰 ───────────────────────────────────────────────────────
    async getToken(force = false): Promise<string> {
        if (!force && this.token && isTokenValid(this.expiresDt, this.deps.tokenMarginMs)) {
            return this.token;
        }
        if (!force) {
            const cached = await this.deps.tokenStore.load(this.id);
            if (cached && isTokenValid(cached.expires_dt, this.deps.tokenMarginMs)) {
                this.token = cached.access_token;
                this.expiresDt = cached.expires_dt;
                return this.token;
            }
        }
        // single-flight: 동시 요청이 토큰을 중복 발급하지 않도록 진행 중 Promise 공유.
        if (this.refreshing) return this.refreshing;
        this.refreshing = this.refresh().finally(() => {
            this.refreshing = null;
        });
        return this.refreshing;
    }

    private async refresh(): Promise<string> {
        const res = await this.deps.transport.post<KiwoomTokenResponse>(
            `${this.deps.baseUrl}/oauth2/token`,
            { grant_type: "client_credentials", appkey: this.appKey, secretkey: this.secretKey },
            { "Content-Type": "application/json;charset=UTF-8" },
        );
        const data = res.data;
        if (res.status !== 200 || !data || data.return_code !== 0) {
            throw new KiwoomError(`키움 인증 거부: ${data?.return_msg ?? `HTTP ${res.status}`}`, {
                credential: this.id,
                status: res.status,
                returnCode: data?.return_code,
            });
        }
        this.token = data.token;
        this.expiresDt = data.expires_dt;
        await this.deps.tokenStore.save(this.id, {
            access_token: data.token,
            expires_dt: data.expires_dt,
        });
        this.deps.logger.debug(`키움 토큰 발급/갱신 [${this.id}]`);
        return this.token;
    }
}
