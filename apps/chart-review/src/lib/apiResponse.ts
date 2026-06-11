import { NextResponse } from "next/server";

/**
 * 예외를 { error }/500 응답으로 변환한다(모든 API route 의 catch 공용).
 * Error 면 message, 아니면 String(err) 을 그대로 노출한다.
 */
export function errorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * 요청 JSON 본문을 파싱한다. 파싱 실패 시 null 을 반환한다.
 * - 본문이 필수인 라우트: null 이면 400 으로 응답.
 * - 본문이 선택인 라우트: `(await parseJsonBody(req)) ?? {}` 로 기본값 사용.
 */
export async function parseJsonBody<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
