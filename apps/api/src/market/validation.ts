// HTTP 요청 파라미터 검증 — 컨트롤러들이 공유하는 날짜/시각 가드. 형식만이 아니라 **실제 달력 유효성**까지 본다
// (2026-99-99 · 25:00:00 거부). 실패 시 일관된 400(BadRequestException). core 는 정상 입력을 가정하므로 여기가 경계.
import { BadRequestException } from "@nestjs/common";
import { isCanonicalStockCode } from "@trade-data-manager/market";

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
 * 이름 필드(그룹·축·테마 등 **키로 쓰이는** 자유 텍스트) — 필수 + 문자열 타입.
 * 앞뒤 공백은 유니크 제약을 우회하는 사고("돌파 "≠"돌파")라 여기서 깎는다. 이름이 키라 더 중요하다.
 */
export function assertName(name: unknown, field = "name"): string {
    if (name !== undefined && typeof name !== "string") throw new BadRequestException(`${field} 는 문자열`);
    const n = name?.trim();
    if (!n) throw new BadRequestException(`${field} 필수`);
    return n;
}

/**
 * 선택 자유 텍스트(메모·이슈 등) — 주면 문자열 + 길이 상한. 안 주면(undefined/null) undefined 로 통과.
 * 내용은 검사하지 않는다(자유 텍스트) — 타입 오염(객체·숫자)과 폭주 페이로드만 경계에서 자른다.
 */
export function assertOptionalText(value: unknown, field: string, maxLen: number): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") throw new BadRequestException(`${field} 는 문자열`);
    if (value.length > maxLen) throw new BadRequestException(`${field} 는 ${maxLen}자 이하: 현재 ${value.length}자`);
    return value;
}

/**
 * pg unique 위반(23505) 판별 — drizzle 이 DrizzleQueryError 로 감싸므로 cause 사슬을 따라 내려가 본다.
 * (dual write 는 원격 쓰기가 먼저라, 충돌은 감싸진 채로 그대로 컨트롤러까지 올라온다.)
 */
export function isUniqueViolation(e: unknown): boolean {
    for (let cur: unknown = e; cur instanceof Error; cur = cur.cause) {
        if ((cur as { code?: unknown }).code === "23505") return true;
    }
    return false;
}

/**
 * 이름 unique 충돌을 400 으로 — 중복 이름은 호출자의 잘못이지 서버 고장이 아니다(group guard 와 같은 철학).
 * 다른 예외는 그대로 500 으로 흘려보낸다 — DB 고장을 400 으로 감추면 안 된다.
 */
export async function rejectDuplicateName<T>(run: () => Promise<T>, name: string): Promise<T> {
    try {
        return await run();
    } catch (e) {
        if (isUniqueViolation(e)) throw new BadRequestException(`이미 있는 이름: ${name}`);
        throw e;
    }
}
