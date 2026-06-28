import { Credential } from "./credential.js";
import type { KisTuning } from "./config.js";
import { KisError } from "./errors.js";
import { sleep } from "./util.js";

/**
 * 한 자격증명에 대한 일시적 사용권.
 * - 단발 호출: 매 호출마다 새 lease(라운드로빈).
 * - 페이지네이션: 시퀀스 시작 시 lease 1개를 받아 모든 페이지에 재사용(핀 고정) → tr_cont/ctx_area 커서가 키 사이에서 깨지지 않음.
 */
export class CredentialLease {
    constructor(
        readonly credential: Credential,
        private readonly tuning: KisTuning,
    ) {}

    getToken(force = false): Promise<string> {
        return this.credential.getToken(force);
    }

    /** 이 계좌의 다음 호출 슬롯이 열릴 때까지 대기(계좌 전역 18건/초). */
    async pace(): Promise<void> {
        await sleep(this.credential.reserve(this.tuning.rateLimitMs));
    }

    /** 유량 초과(EGW00201) → 이 자격증명을 쿨다운(풀이 잠시 회피). */
    reportRateLimited(): void {
        this.credential.cooldown(this.tuning.cooldownMs);
    }
}

/**
 * 자격증명 풀. 라운드로빈으로 부하를 분산하고, 쿨다운 중인 키는 건너뛴다.
 * 유효 처리량 = (키 개수) × (계좌당 18건/초). 키 1개면 로테이션은 자연히 no-op.
 */
export class CredentialPool {
    private rr = 0;

    constructor(
        private readonly credentials: Credential[],
        private readonly tuning: KisTuning,
    ) {
        if (credentials.length === 0) {
            throw new KisError("CredentialPool: 자격증명이 비어있습니다");
        }
    }

    get size(): number {
        return this.credentials.length;
    }

    /**
     * 다음 사용 가능한 자격증명을 라운드로빈으로 고른다.
     * 전부 쿨다운이면 가장 빨리 풀리는 것을 고른다(그래도 진행은 시킴 — 호출자 재시도가 대기).
     */
    acquire(): CredentialLease {
        const n = this.credentials.length;
        const now = Date.now();
        for (let k = 0; k < n; k++) {
            const cred = this.credentials[(this.rr + k) % n];
            if (cred.isAvailable(now)) {
                this.rr = (this.rr + k + 1) % n;
                return new CredentialLease(cred, this.tuning);
            }
        }
        let best = this.credentials[0];
        for (const c of this.credentials) {
            if (c.availableAt < best.availableAt) best = c;
        }
        return new CredentialLease(best, this.tuning);
    }

    /** WS 등 단일 연결용 — 항상 첫 번째(primary) 자격증명의 토큰. */
    primaryToken(force = false): Promise<string> {
        return this.credentials[0].getToken(force);
    }

    /**
     * 모든 자격증명의 토큰을 미리 발급(워밍업/검수). 키별 성공·실패를 반환.
     * 토큰 발급은 1초당 1건 한도라 순차로 돈다(Credential 내부 토큰시계가 추가로 페이싱).
     */
    async warmAll(force = false): Promise<{ id: string; ok: boolean; error?: string }[]> {
        const out: { id: string; ok: boolean; error?: string }[] = [];
        for (const c of this.credentials) {
            try {
                await c.getToken(force);
                out.push({ id: c.id, ok: true });
            } catch (e) {
                out.push({ id: c.id, ok: false, error: (e as Error).message });
            }
        }
        return out;
    }
}
