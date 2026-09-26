// 일별 타점[탐색]의 **순수부** — 행 세우기·조건 그룹 열의 멤버십·자동 그룹 제안.
// 규칙: .claude/decisions.md 「일별 타점[탐색]」. 훅 없는 함수만 둔다(테스트 표면).
import type { CellHit } from "@trade-data-manager/market/domain";
import { minuteToHms } from "@trade-data-manager/market/domain";
import type { SetExpr } from "../filter/expr.js";

/** 조건 그룹 상한 — 열 매트릭스가 읽히는 폭이자, 그룹 평가 훅을 고정 개수로 부르는 근거(훅 규칙). */
export const MAX_GROUPS = 5;

export interface ExploreRow {
    code: string;
    /** 분(minute-of-day) — 셀 좌표의 반쪽. */
    min: number;
    /** "HH:MM:SS" — goToPoint·순회 커서가 쓰는 그대로. */
    time: string;
    /** 그 분 봉의 거래대금(원). null = 재료에서 그 분을 못 찾음(표시는 "—"). */
    amount: number | null;
}

/** 행의 좌표 키 — 그룹 멤버십(`membershipOf`)과 같은 자를 쓴다. */
export const cellKeyOf = (code: string, min: number): string => `${code}|${min}`;

export type ExploreSort = "stock" | "time";

/**
 * 후보 → 행. 분 대금은 누적대금의 차분(첫 봉은 누적 그대로) — 재료(스냅샷)의 분 배열에서 찾는다.
 * `minuteOf` 가 재료의 (code, unix초 배열)을 분으로 바꾸는 일은 호출자가 안다(시간대 셈을 여기 안 들인다).
 * 정렬: 기본 = **종목순**(종목 안 시간순 — 대부분 종목 단위로 걷는다, 사용자 확정) · "time" = 장 흐름.
 */
export function exploreRowsOf(
    hits: readonly CellHit[],
    stockOf: (code: string) => { times: readonly number[]; cumAmount: readonly number[] } | undefined,
    minuteOf: (unixSec: number) => number,
    sort: ExploreSort = "stock",
): ExploreRow[] {
    /** code → (분 → 배열 인덱스) — 종목당 한 번만 걷는다(행 300 × 분 400 정찰을 피함). */
    const idx = new Map<string, Map<number, number>>();
    const indexOf = (code: string, min: number): number | undefined => {
        let m = idx.get(code);
        if (!m) {
            m = new Map();
            const s = stockOf(code);
            if (s) for (let i = 0; i < s.times.length; i++) m.set(minuteOf(s.times[i]!), i);
            idx.set(code, m);
        }
        return m.get(min);
    };
    const rows = hits.map((h): ExploreRow => {
        const s = stockOf(h.code);
        const i = s ? indexOf(h.code, h.min) : undefined;
        const amount = s === undefined || i === undefined ? null
            : i === 0 ? s.cumAmount[0]!
            : s.cumAmount[i]! - s.cumAmount[i - 1]!;
        return { code: h.code, min: h.min, time: minuteToHms(h.min), amount };
    });
    const byCode = (a: ExploreRow, b: ExploreRow): number => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
    return sort === "stock"
        ? rows.sort((a, b) => byCode(a, b) || a.min - b.min)
        : rows.sort((a, b) => a.min - b.min || byCode(a, b));
}

/** 그룹 하나의 그날 결과 → 멤버십 — 행의 ●/· 판정. */
export function membershipOf(hits: readonly CellHit[]): ReadonlySet<string> {
    return new Set(hits.map((h) => cellKeyOf(h.code, h.min)));
}

/**
 * 자동 조건 그룹 — 보는 집합 식의 **최상위 참조 항**(대개 OR 부품)을 선 순서대로, 상한까지.
 * 조건 항·괄호 안 참조는 안 센다 — "부품"의 뜻을 최상위로 좁혀야 A/B 가 곧 식의 갈래와 일치한다.
 */
export function autoGroupIds(expr: SetExpr): string[] {
    const out: string[] = [];
    for (const t of expr.of) if (t.kind === "ref" && !out.includes(t.setId)) out.push(t.setId);
    return out.slice(0, MAX_GROUPS);
}

export type GroupColState =
    | { kind: "ready"; member: ReadonlySet<string> }
    /** 아직 모름(평가 중) — ●/· 대신 "…"(모름을 탈락으로 찍지 않는다). */
    | { kind: "loading" }
    /** 못 믿음(잘림·오류) — 열 전체 "—". 잘림(truncated)도 여기다: 상한이 **종목째** 자르므로 남은
     *  멤버십이 편향 표본이다 — 2026-09-26 실측: 시각-only 그룹이 다른 종목 14개로 잘려 ● 이 0개였다. */
    | { kind: "unknown"; why: string };

/** 그룹 열 하나의 상태 — 판정을 한 곳에 모은다(패널·테스트가 같은 자). */
export function groupColStateOf(v: { evaluable: boolean; ready: boolean; isLoading: boolean; tooWide: boolean; truncated: boolean; themesReady: boolean; error: Error | null; hits: readonly CellHit[] }): GroupColState {
    // 평가할 게 없는 그룹(전부 꺼짐·미연동 돌파·종단 참조)은 재료를 안 당겨 ready 가 영영 안 선다 —
    // "…" 로 두면 계산 중인 척이 된다(리뷰가 잡은 자리).
    if (!v.evaluable) return { kind: "unknown", why: "평가할 조건이 없다 — 꺼짐·미연동 돌파·종단 참조뿐인 그룹" };
    if (v.error !== null) return { kind: "unknown", why: "재료 조회 실패" };
    if (v.tooWide) return { kind: "unknown", why: "너무 넓음 — 그물에 걸려 멤버십을 못 믿는다" };
    if (v.truncated) return { kind: "unknown", why: "상한 잘림 — 종목째 잘린 편향 표본이라 ●/· 를 못 믿는다(그룹 조건을 좁히세요)" };
    // 존 순위 재료(테마 멤버십)가 아직이면 그 그룹의 ●/· 는 모름이다 — 탈락으로 찍지 않는다.
    if (!v.ready || v.isLoading || !v.themesReady) return { kind: "loading" };
    return { kind: "ready", member: membershipOf(v.hits) };
}
