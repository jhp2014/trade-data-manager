// chart-review API 라우트(JSON) 호출 공용 클라이언트.
// 서버측 lib/apiResponse(errorResponse) 의 클라이언트 짝 — 모든 mutate 호출이
// "fetch → !ok 면 body.error 로 throw → 파싱된 JSON 반환" 패턴을 공유한다.

/**
 * JSON 본문으로 요청하고 파싱된 JSON 을 반환한다.
 * - 실패(!res.ok)면 응답 body 의 `error`(없으면 fallbackError)로 Error 를 던진다.
 * - body 가 undefined 면 본문 없이 보낸다(무본문 POST/DELETE 라우트용).
 */
export async function requestJson<T = Record<string, unknown>>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
  fallbackError = "요청 실패",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? fallbackError);
  return data as T;
}

/** GET 으로 JSON 을 받아 반환한다. 실패(!ok)면 body.error(없으면 fallback)로 throw. */
export async function getJson<T = Record<string, unknown>>(
  url: string,
  fallbackError = "요청 실패",
): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? fallbackError);
  return data as T;
}

/**
 * GET 으로 JSON 을 받아 반환하되, 실패(네트워크/!ok/파싱)면 null 을 돌려준다.
 * 화면을 막지 않는 보조 read(설정·탭 목록 등)에서 에러를 조용히 흘릴 때 쓴다.
 */
export async function getJsonOrNull<T = Record<string, unknown>>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const postJson = <T = Record<string, unknown>>(
  url: string,
  body?: unknown,
  fallbackError?: string,
) => requestJson<T>("POST", url, body, fallbackError);

export const patchJson = <T = Record<string, unknown>>(
  url: string,
  body?: unknown,
  fallbackError?: string,
) => requestJson<T>("PATCH", url, body, fallbackError);

export const deleteJson = <T = Record<string, unknown>>(
  url: string,
  body?: unknown,
  fallbackError?: string,
) => requestJson<T>("DELETE", url, body, fallbackError);
