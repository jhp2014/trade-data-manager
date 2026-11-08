import axios, { type AxiosInstance } from "axios";
import { TossError } from "./errors.js";

/** 전송 계층이 돌려주는 정규화된 HTTP 응답. status 로 성공/실패를 클라이언트가 판단한다. */
export interface TossHttpResponse<T> {
    status: number;
    data: T;
    /** 헤더 이름은 소문자. */
    headers: Record<string, string>;
}

/** HTTP 추상화. 테스트에서 mock 으로 교체하려고 인터페이스 뒤로 숨긴다. */
export interface TossTransport {
    /** params 값의 `+` 는 %2B 로 나가야 한다(before 의 +09:00 — 토스 문서가 집어 말하는 함정). */
    get<T>(url: string, params: Record<string, string>, headers: Record<string, string>): Promise<TossHttpResponse<T>>;
    postForm<T>(url: string, form: Record<string, string>): Promise<TossHttpResponse<T>>;
}

/**
 * axios 기반 기본 구현. validateStatus 를 항상 통과시켜 4xx/5xx 도 status 로 돌려준다.
 * 네트워크 오류는 메시지만 옮겨 싼다 — axios 에러의 config 에 Bearer 토큰·client_secret 이 실려 있어
 * 그대로 흘리면 로그로 샌다.
 */
export function createAxiosTransport(opts: { timeoutMs?: number } = {}): TossTransport {
    const client: AxiosInstance = axios.create({
        timeout: opts.timeoutMs ?? 30000,
        validateStatus: () => true,
    });
    const send = async <T>(run: () => Promise<{ status: number; data: T; headers: unknown }>): Promise<TossHttpResponse<T>> => {
        try {
            const res = await run();
            return { status: res.status, data: res.data, headers: normalizeHeaders(res.headers) };
        } catch (err) {
            const code = (err as { code?: unknown }).code;
            throw new TossError(`토스 전송 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`, { code });
        }
    };
    return {
        get: (url, params, headers) => send(() => client.get(url, { params, headers })),
        postForm: (url, form) =>
            send(() =>
                client.post(url, new URLSearchParams(form).toString(), {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                }),
            ),
    };
}

function normalizeHeaders(headers: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries((headers ?? {}) as Record<string, unknown>)) {
        if (v !== undefined && v !== null) out[k.toLowerCase()] = String(v);
    }
    return out;
}
