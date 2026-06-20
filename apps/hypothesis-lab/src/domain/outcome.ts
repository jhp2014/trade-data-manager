/**
 * 케이스 레벨 outcome 옵션 — 종류 정의는 App(클라이언트) 소유.
 * DB(cases.outcome)에는 옵션의 안정 키(value)만 저장한다. 옵션을 추가/삭제해도
 * 마이그레이션이 필요 없고, 지운 옵션의 기존 행은 안 깨진다(모르는 value 는 중립 폴백).
 *
 * 런타임 종류 목록은 stores/outcomeTypes(localStorage 영속)가 보유하며,
 * 아래 DEFAULT_OUTCOME_OPTIONS 로 시드된다.
 */
export type OutcomeColor =
    | "green"
    | "red"
    | "gray"
    | "amber"
    | "blue"
    | "purple"
    | "teal"
    | "pink";

export type OutcomeOption = {
    /** DB(cases.outcome)에 저장되는 안정 키. */
    value: string;
    label: string;
    color: OutcomeColor;
};

/** 색 선택 UI(설정 모달)용 전체 색 목록. */
export const OUTCOME_COLORS: readonly OutcomeColor[] = [
    "green",
    "red",
    "gray",
    "amber",
    "blue",
    "purple",
    "teal",
    "pink",
];

/** 종류 스토어의 초기 시드. */
export const DEFAULT_OUTCOME_OPTIONS: readonly OutcomeOption[] = [
    { value: "win", label: "익절", color: "green" },
    { value: "loss", label: "손절", color: "red" },
    { value: "even", label: "본전", color: "gray" },
    { value: "watch", label: "관망", color: "amber" },
];

/** 옵션 목록에서 value 로 찾기. null/모르는 value 면 undefined(중립 폴백은 호출측). */
export function findOutcome(
    options: readonly OutcomeOption[],
    value: string | null | undefined,
): OutcomeOption | undefined {
    return value == null ? undefined : options.find((o) => o.value === value);
}

/**
 * label 로 안정 value 키 생성(varchar(20) 이내, 기존 value 와 충돌 회피).
 * ascii slug 가 가능하면 그것을, 아니면(한글 등) 시간기반 키를 쓴다.
 */
export function makeOutcomeValue(label: string, existing: readonly string[]): string {
    const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 16);
    let base = /^[a-z0-9-]+$/.test(slug) && slug.length > 0 ? slug : `o${Date.now().toString(36)}`;
    base = base.slice(0, 20);
    if (!existing.includes(base)) return base;
    for (let i = 2; i < 1000; i++) {
        const cand = `${base.slice(0, 17)}-${i}`;
        if (!existing.includes(cand)) return cand;
    }
    return `o${Date.now().toString(36)}`;
}
