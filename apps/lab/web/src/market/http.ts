// tdm api 읽기 transport — fetch + 비2xx 던지기 + JSON 파싱. /api 는 Vite 프록시가 tdm api(:3001)로 넘긴다.
// trade-lab 은 tdm 에 쓰지 않는다 — GET 만 둔다(workbench http.ts 의 읽기 쪽만 옮김).

type Query = Record<string, string>;

/** 서버가 준 실패(비2xx) 또는 2xx 인데 JSON 이 아님. */
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

/** Nest 에러 봉투({message})면 그 값 — 화면에 원문 JSON 이 새지 않게. */
function serverMessage(body: string): string | null {
    try {
        const parsed: unknown = JSON.parse(body);
        if (parsed && typeof parsed === "object" && "message" in parsed) {
            const m = (parsed as { message: unknown }).message;
            if (typeof m === "string" && m !== "") return m;
            if (Array.isArray(m) && m.length > 0) return m.map(String).join(", ");
        }
    } catch {
        /* JSON 아니면 폴백 */
    }
    return null;
}

export async function apiGet<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
    const where = `GET /api/${path}`;
    const res = await fetch(`/api/${path}${query ? `?${new URLSearchParams(query)}` : ""}`, { signal });
    const text = await res.text();
    if (!res.ok) throw new ApiError(serverMessage(text) ?? (text ? `${where} ${res.status}: ${text}` : `${where} ${res.status}`), res.status, text);
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new ApiError(`${where}: 2xx 응답이지만 JSON 아님`, res.status, text.slice(0, 200));
    }
}
