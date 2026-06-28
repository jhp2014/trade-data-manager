import axios, { type AxiosInstance } from "axios";

/** 전송 계층이 돌려주는 정규화된 HTTP 응답. status + KIS 의 rt_cd/msg_cd 로 성공/유량초과를 클라이언트가 판단한다. */
export interface KisHttpResponse<T> {
    status: number;
    data: T;
    headers: Record<string, string>;
}

/**
 * HTTP 추상화. 실제 axios 구현을 주입 가능한 인터페이스 뒤로 숨겨서
 * - 테스트에서 mock 으로 교체(실제 KIS 없이 로테이션/재시도/페이지네이션 로직 검증)
 * - 미래에 다른 전송 계층으로 교체
 * 가 가능하도록 한다.
 *
 * KIS 는 토큰 발급만 POST(/oauth2/tokenP), 시세조회는 전부 GET + 쿼리스트링이라 둘 다 둔다.
 */
export interface KisTransport {
    get<T>(
        url: string,
        params: Record<string, string>,
        headers: Record<string, string>,
    ): Promise<KisHttpResponse<T>>;
    post<T>(
        url: string,
        body: unknown,
        headers: Record<string, string>,
    ): Promise<KisHttpResponse<T>>;
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

/** axios 기반 기본 전송 구현. validateStatus 를 항상 통과시켜 4xx/5xx 도 status 로 돌려준다(throw 는 네트워크 오류에서만). */
export function createAxiosTransport(opts: { timeoutMs?: number } = {}): KisTransport {
    const client: AxiosInstance = axios.create({
        timeout: opts.timeoutMs ?? 15000,
        headers: { "Content-Type": "application/json;charset=UTF-8" },
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
