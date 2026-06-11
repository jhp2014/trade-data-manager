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
