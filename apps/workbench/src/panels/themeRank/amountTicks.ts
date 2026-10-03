// 대금 순위 축의 억 눈금(순수) — decisions.md 「대금 순위 축의 억 눈금」(2026-10-03).
//
// % 눈금(rateTicks)의 쌍둥이지만 두 가지가 다르다:
//  · **기본값이 없다**(빈 목록) — 기준이 창마다 달라 미리 정할 근거가 없다(사용자 확정).
//  · **창(windowMin)별 저장**이다 — panelUi "amountTicks" = Record<창키, 억 목록>. 당일과 30분의
//    기준이 다르다는 게 본질이라, 창을 바꾸면 그 창의 목록이 돌아온다(자 키의 "창 무시"와 반대가 의도).
//
// 값의 단위는 **억**(사람이 읽는 크기 — 저장물 가독). 셈 직전에만 정수 원으로 바꾼다(부동소수 경계 방지).
// 레이아웃은 thresholdTicks 한 벌(가로 반전축 — lo 가장자리 = 오른쪽 = 1위 쪽).

export const AMOUNT_TICK_MAX = 8;
/** 범위(억): 1억 ~ 10조(값 축 팬 한계 AMOUNT_PAN.hi 와 맞춤). */
export const AMOUNT_TICK_LO = 1;
export const AMOUNT_TICK_HI = 100000;
/** 가로 글자 합침·가장자리 밀기 거리(px) — 세로(12px)와 달리 글자가 옆으로 길다. 가장자리 밀기는
 *  접힘 글자 폭(~40px) + 가운데 정렬 글자 반폭(~32px, "5000억·1.2조") = 72 를 덮어야 겹침이 없다
 *  (2026-10-03 재확인 — 64 는 혼합 단위 글자에서 8px 샜다). */
export const AMOUNT_TICK_MERGE_PX = 72;

/** 칸 값 정규화 — 소수 1자리(억). */
export const roundAmountTick = (v: number): number => Math.round(v * 10) / 10;

/** 창키 — 당일 = "day", N분 창 = "N". */
export const amountTickWindowKey = (windowMin: number | null): string => (windowMin === null ? "day" : String(windowMin));

/** 한 창의 목록 파서(관대) — 배열이 아니면 [](기본도 [] 라 rateTicks 의 "[] = 끔" 구분이 없다). */
export function parseAmountTickList(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [];
    const set = new Set<number>();
    for (const v of raw) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const r = roundAmountTick(v);
        if (r < AMOUNT_TICK_LO || r > AMOUNT_TICK_HI) continue;
        set.add(r);
    }
    return [...set].sort((a, b) => a - b).slice(0, AMOUNT_TICK_MAX);
}

/** 저장물 파서(관대) — 객체가 아니면 {}, 키는 "day"|양의 정수 문자열만, 빈 목록 항목은 버린다(뜻이 같다). */
export function parseAmountTicks(raw: unknown): Record<string, number[]> {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (k !== "day" && !/^[1-9][0-9]*$/.test(k)) continue;
        const list = parseAmountTickList(v);
        if (list.length > 0) out[k] = list;
    }
    return out;
}

/** 한 창의 목록을 갈아 끼운 저장물 — 빈 목록이면 키를 지운다(함수형 업데이트로 병합해 쓸 것 —
 *  통째로 쓰면 다른 창의 목록이 날아간다). */
export function withWindowTicks(all: Record<string, number[]>, key: string, next: readonly number[]): Record<string, number[]> {
    const list = commitAmountTicks(next);
    const out = { ...all };
    if (list.length === 0) delete out[key];
    else out[key] = list;
    return out;
}

/** 입력 편집의 커밋 — 범위 밖은 끝으로 붙이고(조용히 버리지 않는다) 파서와 같은 정규화. */
export function commitAmountTicks(next: readonly number[]): number[] {
    return parseAmountTickList(next.map((v) => Math.min(AMOUNT_TICK_HI, Math.max(AMOUNT_TICK_LO, v))));
}

/**
 * 칩 입력 글자 → 억 값. 빈칸 = ""(삭제 뜻), 못 읽거나 0 이하면 null(취소 — 조용히 지우지 않는다).
 * 칩이 보여 주는 모양("4,500억"·"1.2조")과 맨숫자(억)를 그대로 받는다.
 */
export function parseAmountInput(text: string): number | "" | null {
    const t = text.trim().replace(/,/g, "");
    if (t === "") return "";
    const m = /^([0-9]+(?:\.[0-9]+)?)\s*(조|억)?$/.exec(t);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return m[2] === "조" ? n * 10000 : n;
}

const trimNum = (v: number): string => String(Math.round(v * 10) / 10);
const unitOf = (v: number): "억" | "조" => (v >= 10000 ? "조" : "억");
const numOf = (v: number): string => (v >= 10000 ? trimNum(v / 10000) : trimNum(v));

/** 칩·접힘 글자의 값 하나 표기 — "300억"·"1.2조". */
export const fmtAmountTick = (v: number): string => `${numOf(v)}${unitOf(v)}`;

/**
 * 묶음 글자 — 작은 값부터, maxParts 넘으면 양끝만 「a…b」(% 눈금과 같은 접기). 단위가 같으면
 * 한 번만 붙인다("300·500억"), 다르면 각자 붙인다("5000억·1.2조").
 */
export function amountTickLabelText(parts: readonly number[], maxParts = 2): string {
    const fold = parts.length > maxParts && parts.length > 1;
    const pick = fold ? [parts[0], parts[parts.length - 1]] : [...parts];
    const sep = fold ? "…" : "·";
    const sameUnit = pick.every((p) => unitOf(p) === unitOf(pick[0]));
    return sameUnit ? pick.map(numOf).join(sep) + unitOf(pick[0]) : pick.map(fmtAmountTick).join(sep);
}
