import type { KiwoomTransport, KiwoomHttpResponse } from "../transport.js";

export interface MockCall {
    url: string;
    body: any;
    headers: Record<string, string>;
}

/** 호출 기록을 남기는 스크립트형 mock transport. handler 가 응답을 결정. */
export function mockTransport(
    handler: (call: MockCall, index: number) => Partial<KiwoomHttpResponse<any>>,
): { transport: KiwoomTransport; calls: MockCall[] } {
    const calls: MockCall[] = [];
    const transport: KiwoomTransport = {
        async post<T>(url: string, body: unknown, headers: Record<string, string>) {
            const call: MockCall = { url, body, headers: headers ?? {} };
            calls.push(call);
            const r = handler(call, calls.length - 1);
            return {
                status: r.status ?? 200,
                data: (r.data ?? {}) as T,
                headers: r.headers ?? {},
            } satisfies KiwoomHttpResponse<T>;
        },
    };
    return { transport, calls };
}

/** 토큰 엔드포인트(.../oauth2/token) 호출이면 appkey 별 토큰을 돌려주는 표준 응답. */
export function tokenResponseFor(body: any): Partial<KiwoomHttpResponse<any>> {
    return {
        status: 200,
        data: {
            token: `T:${body.appkey}`,
            token_type: "bearer",
            expires_dt: futureExpiry(),
            return_code: 0,
            return_msg: "정상",
        },
    };
}

export function isTokenCall(url: string): boolean {
    return url.endsWith("/oauth2/token");
}

/** 24시간 뒤 만료(=항상 유효) 14자리 문자열. */
export function futureExpiry(): string {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
