// HTTP 요청 파라미터 검증 — 컨트롤러들이 공유하는 날짜/시각 가드. 형식만이 아니라 **실제 달력 유효성**까지 본다
// (2026-99-99 · 25:00:00 거부). 실패 시 일관된 400(BadRequestException). core 는 정상 입력을 가정하므로 여기가 경계.
import { BadRequestException } from "@nestjs/common";
import { isCanonicalStockCode, type HypothesisFilterExpr } from "@trade-data-manager/market";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HMS_RE = /^\d{2}:\d{2}:\d{2}$/;

/** YYYY-MM-DD — 필수 + 형식 + 달력 유효성. 통과하면 그 값을 그대로 반환, 아니면 400. */
export function assertYmd(value: string | undefined, field = "date"): string {
    if (!value || !YMD_RE.test(value)) throw new BadRequestException(`${field} 필수(YYYY-MM-DD)`);
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    // 롤오버 검사: 2026-02-30 → 3월로 넘어가 getUTCDate 불일치, 2026-13-01 → 월 불일치.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
        throw new BadRequestException(`${field} 가 유효한 날짜가 아님: ${value}`);
    }
    return value;
}

/** HH:MM:SS — 필수 + 형식 + 시각 유효성(23:59:59 상한). 통과하면 그 값을 그대로 반환, 아니면 400. */
export function assertHms(value: string | undefined, field = "time"): string {
    if (!value || !HMS_RE.test(value)) throw new BadRequestException(`${field} 필수(HH:MM:SS)`);
    const [h, mi, s] = value.split(":").map(Number);
    if (h > 23 || mi > 59 || s > 59) throw new BadRequestException(`${field} 가 유효한 시각이 아님: ${value}`);
    return value;
}

/**
 * 표준 종목코드(6자리 대문자 영숫자 — KRX 숫자고갈 영숫자 코드 포함) — 필수 + core 불변식
 * (isCanonicalStockCode). 통과하면 그대로 반환, 아니면 400. API 는 표준형만 받는다 —
 * 비표준 표현(A접두·_접미·앞0 생략)의 정규화는 ingestion 경계(broker 시트 어댑터)의 몫이고,
 * HTTP 경계에서 조용히 보정하면 클라이언트 버그를 덮으므로 400 으로 드러낸다.
 */
export function assertStockCode(value: string | undefined, field = "code"): string {
    if (!value) throw new BadRequestException(`${field} 필수`);
    if (!isCanonicalStockCode(value)) throw new BadRequestException(`${field} 형식(6자리 영숫자): ${value}`);
    return value;
}

/**
 * 가설 필터식(DNF jsonb) — groups: (AND 그룹)[], 각 그룹: 리프[], 리프: {hypothesisId, negated}.
 * 바깥 배열만 보던 예전 가드가 놓치던 **리프 구조까지** 검증한다(빈 id·비-boolean negated·비배열 중첩 거부).
 * 검증된 값만 재조립해 반환 → 여분 키가 jsonb 로 새어 저장되는 것도 막는다. 실패 시 400.
 */
export function assertFilterExpr(value: unknown): HypothesisFilterExpr {
    const groups = (value as { groups?: unknown })?.groups;
    if (!value || typeof value !== "object" || !Array.isArray(groups)) {
        throw new BadRequestException("expr.groups 필수(배열)");
    }
    return {
        groups: groups.map((group, gi) => {
            if (!Array.isArray(group)) throw new BadRequestException(`expr.groups[${gi}] 는 배열이어야 함`);
            return group.map((leaf, li) => {
                const l = leaf as { hypothesisId?: unknown; negated?: unknown };
                const hypothesisId = typeof l?.hypothesisId === "string" ? l.hypothesisId.trim() : "";
                if (!hypothesisId) throw new BadRequestException(`expr.groups[${gi}][${li}].hypothesisId 필수`);
                if (typeof l?.negated !== "boolean") throw new BadRequestException(`expr.groups[${gi}][${li}].negated 는 boolean`);
                return { hypothesisId, negated: l.negated };
            });
        }),
    };
}
