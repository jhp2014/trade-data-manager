// /api 프록시 뒤 REST 호출 공통 transport — fetch + 비2xx throw(status+body) + JSON 파싱을 한 곳에.
// react-query 가 캐싱·재시도를 담당하므로 여긴 transport 만(재시도/타임아웃 없음). 런타임 의존성 0.
// 각 api/*.ts 는 wire 타입 매핑 + 엔드포인트 1줄만 남긴다.

type Query = Record<string, string>;

function url(path: string, query?: Query): string {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    return `/api/${path}${qs}`;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    const hasBody = opts.body !== undefined;
    const res = await fetch(url(path, opts.query), {
        method,
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${method} /${path} ${res.status}: ${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

export const apiGet = <T>(path: string, query?: Query): Promise<T> => request<T>("GET", path, { query });
export const apiPost = <T>(path: string, body?: unknown): Promise<T> => request<T>("POST", path, { body });
export const apiDelete = (path: string, query?: Query): Promise<void> => request<void>("DELETE", path, { query });
