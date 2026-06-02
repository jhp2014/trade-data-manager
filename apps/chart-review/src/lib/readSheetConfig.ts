import { cookies } from "next/headers";

/** 읽기 시트 설정을 저장하는 쿠키 이름. 값은 JSON `{ id, tab }`. */
export const READ_SHEET_COOKIE = "cr_read_sheet";

export type ReadSheetConfig = {
  /** 작업셋을 정의할 스프레드시트 ID. 없으면 시트 미설정 상태. */
  spreadsheetId: string | null;
  /** 읽을 탭 이름(기본 "review"). */
  tab: string;
  /** 설정 출처: 쿠키 우선, 없으면 env, 둘 다 없으면 none. */
  source: "cookie" | "env" | "none";
};

const DEFAULT_TAB = "review";

/** 쿠키 문자열을 파싱한다. 형식이 깨졌으면 null. */
function parseCookieValue(raw: string | undefined): { id?: string; tab?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; tab?: string };
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * 현재 요청의 읽기 시트 설정을 해석한다(서버 전용).
 * - 쿠키에 spreadsheetId 가 있으면 쿠키 우선.
 * - 없으면 env(GOOGLE_SHEETS_ID / GOOGLE_SHEETS_TAB) 폴백.
 * - 둘 다 없으면 source="none" (작업셋 = DB 전체).
 * 자격증명(서비스 계정)은 항상 env 에서만 읽는다.
 */
export function getReadSheetConfig(): ReadSheetConfig {
  const fromCookie = parseCookieValue(cookies().get(READ_SHEET_COOKIE)?.value);
  const cookieId = fromCookie?.id?.trim();
  if (cookieId) {
    return {
      spreadsheetId: cookieId,
      tab: fromCookie?.tab?.trim() || DEFAULT_TAB,
      source: "cookie",
    };
  }

  const envId = process.env.GOOGLE_SHEETS_ID?.trim();
  if (envId) {
    return {
      spreadsheetId: envId,
      tab: process.env.GOOGLE_SHEETS_TAB?.trim() || DEFAULT_TAB,
      source: "env",
    };
  }

  return { spreadsheetId: null, tab: DEFAULT_TAB, source: "none" };
}

/** 서비스 계정 자격증명이 env 에 설정돼 있는지. */
export function hasSheetsCredentials(): boolean {
  const hasKeyFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
  const hasInlineKey = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
  return hasKeyFile || hasInlineKey;
}
