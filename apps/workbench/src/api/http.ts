// REST 호출 공통 transport — fetch + 비2xx throw(ApiError) + JSON 파싱을 한 곳에.
// react-query 가 캐싱·재시도·취소(signal)를 담당하므로 여긴 transport 만. 런타임 의존성 0.
// 각 api/*.ts 는 wire 타입 매핑 + 엔드포인트 1줄만 남긴다.
//
// 백엔드가 둘이라 prefix 두 벌(vite 프록시 기준):
//   · /api  → apps/api  (DB·복기·큐레이션)
//   · /live → apps/live (브로커 실시간·알람)
// 프로토콜(에러 봉투·빈 본문·JSON 가드)은 같으므로 base 만 다른 같은 request 를 쓴다.

type Query = Record<string, string>;
type Base = "api" | "live";

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

function url(base: Base, path: string, query?: Query): string {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    return `/${base}/${path}${qs}`;
}

/**
 * 에러 본문에서 사람에게 보일 메시지만. Nest 에러 봉투({message})면 그 값, 아니면 null.
 * 패널들이 error.message 를 그대로 화면에 찍으므로(예: "엔진 미연결") 원문 JSON 이 새면 안 된다.
 */
function serverMessage(body: string): string | null {
    try {
        const parsed: unknown = JSON.parse(body);
        if (parsed && typeof parsed === "object" && "message" in parsed) {
            const m = (parsed as { message: unknown }).message;
            if (typeof m === "string" && m !== "") return m;
            if (Array.isArray(m) && m.length > 0) return m.map(String).join(", "); // class-validator 배열 형태
        }
    } catch {
        /* JSON 아니면 폴백 */
    }
    return null;
}

async function request<T>(base: Base, method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    const hasBody = opts.body !== undefined;
    const res = await fetch(url(base, path, opts.query), {
        method,
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal, // react-query 가 키 변경/언마운트 시 취소(AbortError)를 전파
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const where = `${method} /${base}/${path} ${res.status}`;
        throw new ApiError(serverMessage(body) ?? (body ? `${where}: ${body}` : where), res.status, body);
    }
    // 204·빈 본문(일부 mutation)은 값 없음. 그 외는 JSON — 아니면(에러 HTML 등) 명확히 던진다.
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (text === "") return undefined as T;
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new ApiError(`${method} /${base}/${path}: 2xx 응답이지만 JSON 아님`, res.status, text.slice(0, 200));
    }
}

// ── apps/api (/api) ──────────────────────────────────────────────────────
export const apiGet = <T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> => request<T>("api", "GET", path, { query, signal });
export const apiPost = <T>(path: string, body?: unknown): Promise<T> => request<T>("api", "POST", path, { body });
export const apiPatch = <T>(path: string, body?: unknown): Promise<T> => request<T>("api", "PATCH", path, { body });
export const apiPut = <T>(path: string, body?: unknown): Promise<T> => request<T>("api", "PUT", path, { body });
// body 를 받는 이유: 목록 삭제(맵 자리 여럿)는 id 가 길어 쿼리스트링에 안 담긴다. HTTP 상 DELETE 본문은
// 합법이고 Nest/Express 가 파싱한다 — 여럿을 낱개 요청으로 쪼개면 부분 실패가 생기므로 한 요청이어야 한다.
export const apiDelete = (path: string, query?: Query, body?: unknown): Promise<void> => request<void>("api", "DELETE", path, { query, body });

// ── apps/live (/live) ────────────────────────────────────────────────────
export const liveGet = <T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> => request<T>("live", "GET", path, { query, signal });
export const livePost = <T>(path: string, body?: unknown): Promise<T> => request<T>("live", "POST", path, { body });
export const livePut = <T>(path: string, body?: unknown): Promise<T> => request<T>("live", "PUT", path, { body });
export const liveDelete = (path: string): Promise<void> => request<void>("live", "DELETE", path);
