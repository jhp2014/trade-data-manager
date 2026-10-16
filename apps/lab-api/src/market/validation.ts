// 시장 경로의 파라미터 검증 — tdm api 의 apps/api/src/market/validation.ts 에서 이식(결 그대로).
// 형식만이 아니라 실제 달력 유효성까지 본다. 실패 시 BadRequest — 응답 body 는 NestJS 400 과 같은 꼴로
// 나간다(app.ts onError). strangler 이식 중이라 에러 응답도 api 와 동일해야 클라가 차이를 못 느낀다.

import { isCanonicalStockCode } from "@trade-data-manager/market";

/** 400 재료 — app.ts onError 가 NestJS BadRequestException 과 같은 body 로 바꾼다. */
export class BadRequest extends Error {}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD — 필수 + 형식 + 달력 유효성. 통과하면 그 값을 그대로 반환, 아니면 400. */
export function assertYmd(value: string | undefined, field = "date"): string {
    if (!value || !YMD_RE.test(value)) throw new BadRequest(`${field} 필수(YYYY-MM-DD)`);
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    // 롤오버 검사: 2026-02-30 → 3월로 넘어가 getUTCDate 불일치, 2026-13-01 → 월 불일치.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
        throw new BadRequest(`${field} 가 유효한 날짜가 아님: ${value}`);
    }
    return value;
}

/**
 * 표준 종목코드(6자리 대문자 영숫자) — 필수 + core 불변식(isCanonicalStockCode). 통과하면 그대로 반환, 아니면 400.
 * 비표준 표현의 정규화는 ingestion 경계의 몫 — HTTP 경계에서 조용히 보정하면 클라이언트 버그를 덮는다.
 */
export function assertStockCode(value: string | undefined, field = "code"): string {
    if (!value) throw new BadRequest(`${field} 필수`);
    if (!isCanonicalStockCode(value)) throw new BadRequest(`${field} 형식(6자리 영숫자): ${value}`);
    return value;
}
