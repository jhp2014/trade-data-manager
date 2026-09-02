import axios, { type AxiosInstance } from "axios";

/** 전송 계층이 돌려주는 정규화된 HTTP 응답. status 로 성공/실패를 클라이언트가 판단한다. */
export interface KrxHttpResponse<T> {
    status: number;
    data: T;
    headers: Record<string, string>;
}

/**
 * HTTP 추상화. 실제 axios 구현을 주입 가능한 인터페이스 뒤로 숨겨서
 * - 테스트에서 mock 으로 교체(실제 KRX 없이 파싱/유량 로직 검증)
 * - 미래에 다른 전송 계층으로 교체
 * 가 가능하도록 한다.
 *
 * KRX OPEN API 는 조회 전부 GET + 쿼리스트링(basDd) + 헤더 AUTH_KEY 라 get 만 있으면 된다.
 */
export interface KrxTransport {
    get<T>(
        url: string,
        params: Record<string, string>,
        headers: Record<string, string>,
    ): Promise<KrxHttpResponse<T>>;
}

function normalizeHeaders(h: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!h || typeof h !== "object") return out;
    const src =
        typeof (h as { toJSON?: () => unknown }).toJSON === "function"
            ? ((h as { toJSON: () => Record<string, unknown> }).toJSON())
            : (h as Record<string, unknown>);
    for (const k of Object.keys(src)) out[k.toLowerCase()] = String(src[k]);
    return out;
}

/**
 * axios 기반 기본 전송 구현. validateStatus 를 항상 통과시켜 4xx/5xx 도 status 로 돌려준다
 * (throw 는 네트워크 오류에서만) — 인증 실패 응답의 **본문**을 recon 이 봐야 하기 때문.
 * 전종목 응답이 수 MB 급이라 타임아웃은 KIS(15s)보다 넉넉하게 둔다.
 */
export function createAxiosTransport(opts: { timeoutMs?: number } = {}): KrxTransport {
    const client: AxiosInstance = axios.create({
        timeout: opts.timeoutMs ?? 30000,
        validateStatus: () => true,
    });
    return {
        async get<T>(url: string, params: Record<string, string>, headers: Record<string, string>) {
            const res = await client.get<T>(url, { params, headers });
            return {
                status: res.status,
                data: res.data,
                headers: normalizeHeaders(res.headers),
            };
        },
    };
}
