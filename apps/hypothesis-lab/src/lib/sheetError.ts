/**
 * 시트 워킹셋 읽기 실패의 종류(클라이언트가 안내/전환 분기에 쓴다).
 * - "tab-missing": 설정한 탭이 스프레드시트에 없음(googleapis "Unable to parse range").
 * - "read-failed": 그 외(인증/네트워크/권한/컬럼 누락 등).
 *
 * 서버 액션이 throw 를 잡아 이 값으로 바꿔 반환한다 — Next 서버 액션은 프로덕션에서
 * 에러 메시지를 digest 로 가리므로, 클라가 message 로 판별할 수 없기 때문.
 */
export type SheetErrorKind = "tab-missing" | "read-failed";
export type SheetErrorInfo = { kind: SheetErrorKind; tab: string };

/** googleapis 메시지로 탭 누락 여부만 가린다(그 외는 read-failed). */
export function classifySheetError(err: unknown, tab: string): SheetErrorInfo {
    const msg = err instanceof Error ? err.message : String(err);
    const kind: SheetErrorKind = /Unable to parse range/i.test(msg) ? "tab-missing" : "read-failed";
    return { kind, tab };
}
