import axios, { type AxiosInstance } from "axios";

/** 전송 계층이 돌려주는 정규화된 HTTP 응답. status 로 4xx/429 를 클라이언트가 직접 판단한다. */
export interface KiwoomHttpResponse<T> {
    status: number;
    data: T;
    headers: Record<string, string>;
}

/**
 * HTTP POST 추상화. 실제 axios 구현을 주입 가능한 인터페이스 뒤로 숨겨서
 * - 테스트에서 mock 으로 교체(실제 키움 없이 로테이션/재시도 로직 검증)
 * - 미래에 다른 전송 계층으로 교체
 * 가 가능하도록 한다.
 */
export interface KiwoomTransport {
    post<T>(
        url: string,
        body: unknown,
        headers: Record<string, string>,
    ): Promise<KiwoomHttpResponse<T>>;
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

/** axios 기반 기본 전송 구현. validateStatus 를 항상 통과시켜 4xx/429 도 status 로 돌려준다(throw 는 네트워크 오류에서만). */
export function createAxiosTransport(opts: { timeoutMs?: number } = {}): KiwoomTransport {
    const client: AxiosInstance = axios.create({
        timeout: opts.timeoutMs ?? 15000,
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        validateStatus: () => true,
    });
    return {
        async post<T>(url: string, body: unknown, headers: Record<string, string>) {
            const res = await client.post<T>(url, body, { headers });
            return {
                status: res.status,
                data: res.data,
                headers: normalizeHeaders(res.headers),
            };
        },
    };
}
