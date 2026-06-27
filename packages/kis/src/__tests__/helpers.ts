import type { KisTransport, KisHttpResponse } from "../transport.js";

export interface MockCall {
    method: "get" | "post";
    url: string;
    params: Record<string, string>;
    body: any;
    headers: Record<string, string>;
}

/** 호출 기록을 남기는 스크립트형 mock transport. handler 가 응답을 결정. */
export function mockTransport(
    handler: (call: MockCall, index: number) => Partial<KisHttpResponse<any>>,
): { transport: KisTransport; calls: MockCall[] } {
    const calls: MockCall[] = [];
    const run = (call: MockCall) => {
        calls.push(call);
        const r = handler(call, calls.length - 1);
        return {
            status: r.status ?? 200,
            data: (r.data ?? {}) as any,
            headers: r.headers ?? {},
        } satisfies KisHttpResponse<any>;
    };
    const transport: KisTransport = {
        async get<T>(url: string, params: Record<string, string>, headers: Record<string, string>) {
            return run({ method: "get", url, params, body: undefined, headers: headers ?? {} }) as KisHttpResponse<T>;
        },
        async post<T>(url: string, body: unknown, headers: Record<string, string>) {
            return run({ method: "post", url, params: {}, body, headers: headers ?? {} }) as KisHttpResponse<T>;
        },
    };
    return { transport, calls };
}

/** 토큰 엔드포인트(.../oauth2/tokenP) 호출이면 appkey 별 토큰을 돌려주는 표준 응답. */
export function tokenResponseFor(body: any): Partial<KisHttpResponse<any>> {
    return {
        status: 200,
        data: {
            access_token: `T:${body.appkey}`,
            token_type: "Bearer",
            expires_in: 86400,
            access_token_token_expired: futureExpiry(),
        },
    };
}

export function isTokenCall(url: string): boolean {
    return url.endsWith("/oauth2/tokenP");
}

/** 24시간 뒤 만료(=항상 유효) "YYYY-MM-DD HH:MM:SS" 문자열(KIS 형식). */
export function futureExpiry(): string {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
