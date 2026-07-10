// /api 프록시 뒤 REST 호출 공통 transport — fetch + 비2xx throw(ApiError) + JSON 파싱을 한 곳에.
// react-query 가 캐싱·재시도·취소(signal)를 담당하므로 여긴 transport 만. 런타임 의존성 0.
// 각 api/*.ts 는 wire 타입 매핑 + 엔드포인트 1줄만 남긴다.

type Query = Record<string, string>;

/** 서버가 준 실패(비2xx) 또는 2xx인데 JSON 이 아님 — status/body 를 실어 던진다(호출자가 분기 가능). */
export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

function url(path: string, query?: Query): string {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    return `/api/${path}${qs}`;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    const hasBody = opts.body !== undefined;
    const res = await fetch(url(path, opts.query), {
        method,
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal, // react-query 가 키 변경/언마운트 시 취소(AbortError)를 전파
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ApiError(`${method} /${path} ${res.status}: ${body}`, res.status, body);
    }
    // 204·빈 본문(일부 mutation)은 값 없음. 그 외는 JSON — 아니면(에러 HTML 등) 명확히 던진다.
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (text === "") return undefined as T;
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new ApiError(`${method} /${path}: 2xx 응답이지만 JSON 아님`, res.status, text.slice(0, 200));
    }
}

export const apiGet = <T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> => request<T>("GET", path, { query, signal });
export const apiPost = <T>(path: string, body?: unknown): Promise<T> => request<T>("POST", path, { body });
export const apiPatch = <T>(path: string, body?: unknown): Promise<T> => request<T>("PATCH", path, { body });
export const apiDelete = (path: string, query?: Query): Promise<void> => request<void>("DELETE", path, { query });
