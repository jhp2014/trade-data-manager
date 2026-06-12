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

/** 400 Bad Request 응답(에러 메시지 포함). */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * JSON 본문이 필수인 라우트용. 파싱 성공 시 본문을, 실패 시 400 응답을 반환한다.
 * 사용: `const body = await requireJsonBody(req); if (body instanceof NextResponse) return body;`
 */
export async function requireJsonBody<T = Record<string, unknown>>(
  request: Request,
  errorMessage = "잘못된 JSON 본문입니다.",
): Promise<T | NextResponse> {
  const body = await parseJsonBody<T>(request);
  if (body === null) return badRequest(errorMessage);
  return body;
}

const MANUAL_KEY_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * 수동 입력 키 검증. trim 한 키를 반환하거나, 비었으면/형식 위반이면 400 응답을 반환한다.
 * 사용: `const key = validateManualKey(raw); if (key instanceof NextResponse) return key;`
 */
export function validateManualKey(raw: string | undefined): string | NextResponse {
  const key = raw?.trim();
  if (!key) return badRequest("key 가 필요합니다.");
  if (!MANUAL_KEY_PATTERN.test(key)) {
    return badRequest("key 는 영문/숫자/밑줄만 사용할 수 있습니다.");
  }
  return key;
}
