import axios, { type AxiosInstance } from "axios";
import { DartError } from "./errors.js";

/** 전송 계층이 돌려주는 정규화된 HTTP 응답. status 로 성공/실패를 클라이언트가 판단한다. */
export interface DartHttpResponse<T> {
    status: number;
    data: T;
}

/**
 * HTTP 추상화. 테스트에서 mock 으로 교체하려고 인터페이스 뒤로 숨긴다.
 * OpenDART 조회는 전부 GET + 쿼리스트링이고, 응답은 JSON 또는 zip 바이너리 둘 중 하나다.
 */
export interface DartTransport {
    getJson<T>(url: string, params: Record<string, string>): Promise<DartHttpResponse<T>>;
    getBytes(url: string, params: Record<string, string>): Promise<DartHttpResponse<Uint8Array>>;
}

/**
 * axios 기반 기본 구현. validateStatus 를 항상 통과시켜 4xx/5xx 도 status 로 돌려준다.
 * 네트워크 오류는 그대로 던지지 않고 메시지만 옮겨 싼다 — axios 에러의 config 에 인증키가 든
 * params 가 실려 있어, 그대로 흘리면 로그로 키가 샌다.
 * corpCode(전 법인 목록)·공시 원본 zip 이 수십 MB 라 타임아웃을 넉넉하게 둔다.
 */
export function createAxiosTransport(opts: { timeoutMs?: number } = {}): DartTransport {
    const client: AxiosInstance = axios.create({
        timeout: opts.timeoutMs ?? 120000,
        validateStatus: () => true,
    });
    const send = async <T>(url: string, params: Record<string, string>, binary: boolean): Promise<DartHttpResponse<T>> => {
        try {
            const res = await client.get<T>(url, {
                params,
                ...(binary ? { responseType: "arraybuffer" as const } : {}),
            });
            return { status: res.status, data: res.data };
        } catch (err) {
            const code = (err as { code?: unknown }).code;
            throw new DartError(`DART 전송 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`, { code });
        }
    };
    return {
        getJson: <T>(url: string, params: Record<string, string>) => send<T>(url, params, false),
        async getBytes(url, params) {
            const res = await send<ArrayBuffer>(url, params, true);
            return { status: res.status, data: new Uint8Array(res.data) };
        },
    };
}
