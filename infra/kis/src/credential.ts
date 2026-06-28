import type { KisTransport } from "./transport.js";
import { type TokenStore, credentialCacheKey } from "./tokenStore.js";
import type { Logger } from "./logger.js";
import { KisError } from "./errors.js";
import { isTokenValid } from "./util.js";

/** /oauth2/tokenP 성공 응답. */
interface KisTokenResponse {
    access_token: string;
    token_type: string; // "Bearer"
    expires_in: number; // 초 (보통 86400)
    access_token_token_expired: string; // "YYYY-MM-DD HH:MM:SS"
}

/** /oauth2/tokenP 거부 응답(예: EGW00133 발급 빈도 초과). */
interface KisTokenError {
    error_code?: string;
    error_description?: string;
    rt_cd?: string;
    msg_cd?: string;
    msg1?: string;
}

export interface CredentialDeps {
    baseUrl: string;
    transport: KisTransport;
    tokenStore: TokenStore;
    logger: Logger;
    tokenMarginMs: number;
    /** 토큰 발급(1초당 1건) 최소 간격(ms). */
    tokenRateLimitMs: number;
}

/**
 * 자격증명(=계좌/앱키) 1개의 모든 상태를 캡슐화한다:
 *  - 토큰 발급/캐시(메모리 + tokenStore, single-flight 갱신)
 *  - 계좌 단위 rate 시계 → reserve() (KIS 유량은 계좌 전역이라 TR별이 아님)
 *  - 토큰 발급 전용 시계 → reserveToken() (1초당 1건)
 *  - 유량 초과(EGW00201) 직후 쿨다운
 * 풀은 이 객체들을 라운드로빈/failover 로 굴린다.
 */
export class Credential {
    /** appKey 해시(노출 안전). 캐시 파일명·로그·핀고정 식별에 사용. */
    readonly id: string;

    private token: string | null = null;
    private expiresAt: string | null = null;
    /** 다음 호출 가능 시각(epoch ms). 계좌 전역 단일 버킷. */
    private clock = 0;
    /** 다음 토큰 발급 가능 시각(epoch ms). */
    private tokenClock = 0;
    private cooldownUntil = 0;
    private refreshing: Promise<string> | null = null;

    constructor(
        private readonly appKey: string,
        private readonly appSecret: string,
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

    /**
     * KIS 시세 요청에 매번 붙는 인증 헤더. 키움과 달리 appkey/appsecret 를 모든 요청에 실어야 한다.
     * (appsecret 은 패키지 내부에만 머무름 — 외부로 노출되지 않게 여기서만 조립.)
     */
    authHeaders(token: string): Record<string, string> {
        return { authorization: `Bearer ${token}`, appkey: this.appKey, appsecret: this.appSecret };
    }

    // ── rate 페이싱 ────────────────────────────────────────────────
    /**
     * 이 계좌의 다음 호출 슬롯을 예약하고, 호출자가 대기해야 할 ms 를 반환한다.
     * KIS 유량은 계좌(앱키) 전역 18건/초 → 모든 TR 이 한 시계를 공유한다(키움과 다른 점).
     */
    reserve(rateLimitMs: number): number {
        const now = Date.now();
        const scheduled = Math.max(now, this.clock);
        this.clock = scheduled + rateLimitMs;
        return scheduled - now;
    }

    // ── 토큰 ───────────────────────────────────────────────────────
    async getToken(force = false): Promise<string> {
        if (!force && this.token && isTokenValid(this.expiresAt, this.deps.tokenMarginMs)) {
            return this.token;
        }
        if (!force) {
            const cached = await this.deps.tokenStore.load(this.id);
            if (cached && isTokenValid(cached.expires_at, this.deps.tokenMarginMs)) {
                this.token = cached.access_token;
                this.expiresAt = cached.expires_at;
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
        // 토큰 발급 1초당 1건 한도 준수 — 발급 직전 토큰 시계로 페이싱.
        const now = Date.now();
        const scheduled = Math.max(now, this.tokenClock);
        this.tokenClock = scheduled + this.deps.tokenRateLimitMs;
        const wait = scheduled - now;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));

        const res = await this.deps.transport.post<KisTokenResponse & KisTokenError>(
            `${this.deps.baseUrl}/oauth2/tokenP`,
            { grant_type: "client_credentials", appkey: this.appKey, appsecret: this.appSecret },
            { "Content-Type": "application/json;charset=UTF-8" },
        );
        const data = res.data;
        if (res.status !== 200 || !data?.access_token) {
            const reason =
                data?.error_description ?? data?.msg1 ?? data?.error_code ?? data?.msg_cd ?? `HTTP ${res.status}`;
            throw new KisError(`KIS 인증 거부: ${reason}`, {
                credential: this.id,
                status: res.status,
                errorCode: data?.error_code ?? data?.msg_cd,
            });
        }
        this.token = data.access_token;
        this.expiresAt = data.access_token_token_expired;
        await this.deps.tokenStore.save(this.id, {
            access_token: data.access_token,
            expires_at: data.access_token_token_expired,
        });
        this.deps.logger.debug(`KIS 토큰 발급/갱신 [${this.id}] 만료 ${this.expiresAt}`);
        return this.token;
    }
}
