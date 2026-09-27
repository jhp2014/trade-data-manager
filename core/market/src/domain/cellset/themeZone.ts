// 테마 존 판정 — 분 단면 서수 위의 **순수 계산**(React·wire·I/O 0). 하루 「테마」 셀 술어의 판정 한 벌.
// 옛 workbench lib/themeStrength 의 core 이주(2026-09-26)이자 개형: 대금 창이 0|60 이지선다에서
// **자유 T분**(null = 당일 누적)이 되고, 등락 축이 순위 ≤M | **값 x~y%** 둘이 된다(조합 4).
// 2026-09-27 컷 셋(재적·기본 순위·존 순위)이 한쪽 임계값에서 **하한~상한 구간**이 됐다(이상·이하).
//
// ## 의미론 (decisions.md 「테마 강도·순위 단면」 — 묶음 필터)
// 타점 통과 ⟺ 그 종목의 소속 테마 중, **활성 하위 조건 전부를 혼자 만족하는** 테마가 하나라도 존재
// (테마 단위 AND · 테마 간 ∃). 하위 조건을 독립 평가해 조합하면 서로 다른 테마로 나눠 만족해도
// 통과해 버린다 — 그래서 판정이 두 층이다: 테마 하나의 AND(themeZoneStatsOf → themeZoneStatsPass)
// → themeAnswerOf(∃). **한 테마의 AND 를 단독 소비하는 코드를 만들지 말 것** — 분해 금지가 무너진다.
// 화면이 "어느 테마가 통과시키나"를 말해야 할 때는 `themeZoneVerdicts`(∃ 를 접기 전 재료)를 쓴다.
// 활성 조건이 하나도 없으면 조건 없음 = 전부 통과(존 N/M 은 그때 순수 시선 도구다 — 사용자 확정).
//
// ## 창(window)이 파라미터인데 단면 인터페이스에 없는 이유
// 단면(ThemeSectionRanks)은 **이미 창이 적용된 서수**를 낸다 — 창은 단면을 만드는 쪽(어댑터,
// sectionSeries.themeSectionAt)의 재료이지 판정의 재료가 아니다. 판정에 창이 들어오면 같은 단면을
// 두 창이 나눠 읽는 혼선이 생긴다(옛 amount/amount60 이지선다가 그 모양이었다).
import type { ThemeIndex } from "../classification/themeMember.js";

/** 단면에서 이 모듈이 요구하는 것 — 창 적용이 끝난 서수 + 등락률 값. 어느 공급자든 이 모양이면 같은 함수. */
export interface ThemeSectionRanks {
    ranksOf(code: string): { rateOrd: number | null; ratePct: number | null; amountOrd: number | null } | null;
}

/**
 * 등락 축 — 존의 세로 변. 순위(서수 ≤ max)거나 값(등락률 minPct% ~ maxPct%, 양끝 포함·한쪽 비면 반열림).
 * 값은 **적어도 한쪽**이 있다(파서·편집면이 지킨다) — 둘 다 비면 등락 변이 없는 존이 되어 뜻이 바뀐다.
 * 순위는 상한만이다 — 존은 "상위 무리"라 11~40위 같은 띠는 존의 뜻을 흐린다(2026-09-27 사용자 확정).
 */
export type ThemeRateAxis = { mode: "rank"; max: number } | { mode: "value"; minPct?: number; maxPct?: number };

/**
 * 컷 하나 — 켬 + 양끝 선택 경계(정수, 양끝 포함, 빈칸 = 그쪽 무제한 — 2026-09-27 이상·이하). 켬과 경계를
 * 가른 이유: 끈 컷의 경계가 살아 있어야 다시 켤 때 제자리로 온다. ⚠ 켜져 있어도 양끝이 다 비면 조건이 아니다.
 */
export interface ThemeCut {
    on: boolean;
    min?: number;
    max?: number;
}

export const themeCutActive = (c: ThemeCut): boolean => c.on && (c.min !== undefined || c.max !== undefined);
/** 켜진 컷의 판정 — 결손(null)은 불만족(결손은 결손). 끈 컷은 호출하지 말 것(themeZoneStatsPass 가 가른다). */
const inCut = (v: number | null, c: ThemeCut): boolean =>
    v !== null && (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max);

/**
 * 테마 술어 파라미터 — 술어 payload 에 산다(SavedSet 이 stages 를 통째 복사하므로 밖에 두면 집합의
 * 자립이 깨진다). 활성 플래그와 임계값을 분리한 이유: 끈 조건의 임계값이 살아 있어야 다시 켤 때
 * 원래 자리로 돌아온다. ⚠ 존은 **교집합**(등락 축 ∧ 대금 서수 ≤ zoneAmountN)이다.
 */
export interface ThemeZoneParams {
    /** 대금 서수의 창(분). null = 당일 누적. 자유 T — 클라가 즉석 계산한다(60 고정 해제, 2026-09-26). */
    window: number | null;
    zoneAmountN: number;
    rate: ThemeRateAxis;
    /** 순위 조건(②③)의 기준 서수 — 한 벌 공유(등락률 기본, 거래대금 옵션). */
    basis: "rate" | "amount";
    /** ① 재적 — 존 내 테마 종목 수(자신 포함)가 구간 안. 3~5 = 번진 날 빼기. 빈 하한 = 1(존에 없으면 재적 아님). */
    count: ThemeCut;
    /** ② 기본 순위 — 테마 전 멤버 중 기준 서수 순위(존 무관)가 구간 안. */
    baseRank: ThemeCut;
    /** ③ 존 순위 — 존에 든 멤버 중 순위가 구간 안(자신이 존 밖이면 불만족). 2~5 = 대장 빼고 후발. */
    zoneRank: ThemeCut;
    /**
     * **진입 시만**(부재 = 상시) — 판정이 직전 분에는 거짓이었고 지금 참인 셀만 발화한다(옛 전이
     * 기계의 후신 — 테마에만 남았다). 판정식은 `themeAnswerAt` 한 곳: pass(min) ∧ ¬pass(min−1),
     * 첫 분(min−1 단면에 재료 없음)은 진입으로 친다. 활성 하위 조건이 0이면 뜻이 없다(빈 술어 규칙 그대로).
     */
    enter?: boolean;
}

export const DEFAULT_THEME_ZONE: ThemeZoneParams = {
    window: null,
    zoneAmountN: 40,
    rate: { mode: "rank", max: 30 },
    basis: "rate",
    count: { on: true, min: 3 },
    baseRank: { on: false, max: 3 },
    zoneRank: { on: false, max: 2 },
};

export const THEME_WINDOW_MAX_MIN = 600;

export const anyThemeCondOn = (p: ThemeZoneParams): boolean =>
    themeCutActive(p.count) || themeCutActive(p.baseRank) || themeCutActive(p.zoneRank);

/** 모든 컷을 끈 모양 — 이주가 "조건-off theme"로 살릴 때(경계는 기본값으로 남겨 다시 켜면 제자리). */
export const themeCutsOff = (): Pick<ThemeZoneParams, "count" | "baseRank" | "zoneRank"> => ({
    count: { ...DEFAULT_THEME_ZONE.count, on: false },
    baseRank: { ...DEFAULT_THEME_ZONE.baseRank, on: false },
    zoneRank: { ...DEFAULT_THEME_ZONE.zoneRank, on: false },
});

const cutKey = (c: ThemeCut): string => (themeCutActive(c) ? `${c.min ?? ""}~${c.max ?? ""}` : "-");

/** 파라미터 키 — 엔진의 셀당 답 캐시·표시 memo 가 같은 자를 쓴다(같은 키 = 같은 판정). */
export const themeZoneKeyOf = (p: ThemeZoneParams): string =>
    `tz|w${p.window ?? "d"}|a${p.zoneAmountN}|r${p.rate.mode === "rank" ? `k${p.rate.max}` : `v${p.rate.minPct ?? ""}~${p.rate.maxPct ?? ""}`}|b${p.basis}` +
    `|c${cutKey(p.count)}|B${cutKey(p.baseRank)}|Z${cutKey(p.zoneRank)}|e${p.enter === true ? 1 : 0}`;

/**
 * 저장물 파서 — 유효성 정의 한 벌(관대한 병합: 객체가 아니면 null, 필드는 맞는 것만 승계·나머지 기본값).
 * **옛 themeStrength 모양(zoneRateN·zoneAmountWindow 0|60)도 여기서 읽는다** — 종단 저장물 이주가
 * 파서 하나로 끝나게(사슬 필터 이주 선례). basis "amount" 는 그대로, window 60 → 60, 0 → null.
 */
export function parseThemeZoneParams(o: unknown): ThemeZoneParams | null {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    const d = DEFAULT_THEME_ZONE;
    const num = (v: unknown, fb: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : fb);
    const bool = (v: unknown, fb: boolean): boolean => (typeof v === "boolean" ? v : fb);
    const rate = ((): ThemeRateAxis => {
        const raw = r.rate;
        if (raw && typeof raw === "object") {
            const a = raw as Record<string, unknown>;
            if (a.mode === "value") {
                const fin = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
                let lo = fin(a.minPct);
                let hi = fin(a.maxPct);
                if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
                if (lo !== undefined || hi !== undefined) return { mode: "value", ...(lo !== undefined ? { minPct: lo } : {}), ...(hi !== undefined ? { maxPct: hi } : {}) };
            }
            if (a.mode === "rank") return { mode: "rank", max: num(a.max, d.rate.mode === "rank" ? d.rate.max : 30) };
        }
        // 옛 모양 — zoneRateN(순위 N).
        if (r.zoneRateN !== undefined) return { mode: "rank", max: num(r.zoneRateN, 30) };
        return d.rate;
    })();
    const window = ((): number | null => {
        if (r.window === null) return null;
        if (typeof r.window === "number" && Number.isFinite(r.window)) return Math.min(THEME_WINDOW_MAX_MIN, Math.max(1, Math.floor(r.window)));
        // 옛 모양 — zoneAmountWindow 0|60.
        if (r.zoneAmountWindow === 60) return 60;
        if (r.zoneAmountWindow === 0) return null;
        return d.window;
    })();
    /** 컷 한 칸 — 경계는 1 이상 정수, 뒤집히면 뒤집어 받는다. 켜졌는데 양끝이 다 비면 그대로 둔다(조건 아님). */
    function cutOf(raw: unknown, oldOn: unknown, oldVal: unknown, oldSide: "min" | "max", fb: ThemeCut): ThemeCut {
        const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : undefined);
        if (raw && typeof raw === "object") {
            const c = raw as Record<string, unknown>;
            let lo = int(c.min);
            let hi = int(c.max);
            if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
            return { on: bool(c.on, fb.on), ...(lo !== undefined ? { min: lo } : {}), ...(hi !== undefined ? { max: hi } : {}) };
        }
        if (oldOn === undefined && oldVal === undefined) return fb;
        const v = int(oldVal) ?? fb[oldSide];
        return { on: bool(oldOn, fb.on), ...(v !== undefined ? { [oldSide]: v } : {}) };
    }
    return {
        window,
        zoneAmountN: num(r.zoneAmountN, d.zoneAmountN),
        rate,
        basis: r.basis === "amount" ? "amount" : "rate",
        // 새 모양 `{ on, min?, max? }` — 옛 평면 모양(countOn·countMin / baseRankOn·baseRankMax / zoneRankOn·
        // zoneRankMax, 2026-09-27 이전)은 그 한쪽 경계로 옮긴다(재적 = 하한, 순위 = 상한 — 판정이 같다).
        count: cutOf(r.count, r.countOn, r.countMin, "min", d.count),
        baseRank: cutOf(r.baseRank, r.baseRankOn, r.baseRankMax, "max", d.baseRank),
        zoneRank: cutOf(r.zoneRank, r.zoneRankOn, r.zoneRankMax, "max", d.zoneRank),
        // 옛 전이 저장물 이주(2026-09-27 전이 은퇴): 처음으로·직전 대비 상승은 뜻이 "진입"이었다.
        // 하루 처음(firstOfDay)은 등가물이 없어 벗긴다(상시로).
        ...(r.enter === true || r.transition === "firstTrue" || r.transition === "improve" ? { enter: true } : {}),
    };
}

/** 테마 멤버십의 루프용 투영 — ThemeIndex.themesOf/codesOf 는 호출마다 복사하므로 진입부에서 한 번만. */
export interface ThemeProjection {
    themesByCode: ReadonlyMap<string, readonly string[]>;
    codesByTheme: ReadonlyMap<string, readonly string[]>;
}

export function themeProjectionOf(index: ThemeIndex): ThemeProjection {
    const codesByTheme = new Map<string, readonly string[]>();
    const themesByCode = new Map<string, string[]>();
    for (const theme of index.allThemes()) {
        const codes = index.codesOf(theme);
        codesByTheme.set(theme, codes);
        for (const code of codes) {
            const list = themesByCode.get(code);
            if (list) list.push(theme);
            else themesByCode.set(code, [theme]);
        }
    }
    return { themesByCode, codesByTheme };
}

type Ranks = NonNullable<ReturnType<ThemeSectionRanks["ranksOf"]>>;

/** 존 판정(등락 축 ∧ 대금 서수 ≤ N) — 판정식을 밖에서 다시 쓰지 않게 export 로 연다. */
export const inThemeZone = (r: Ranks, p: Pick<ThemeZoneParams, "zoneAmountN" | "rate">): boolean => {
    if (r.amountOrd === null || r.amountOrd > p.zoneAmountN) return false;
    return p.rate.mode === "rank"
        ? r.rateOrd !== null && r.rateOrd <= p.rate.max
        : r.ratePct !== null && (p.rate.minPct === undefined || r.ratePct >= p.rate.minPct) && (p.rate.maxPct === undefined || r.ratePct <= p.rate.maxPct);
};

const basisOf = (r: Ranks, p: Pick<ThemeZoneParams, "basis">): number | null => (p.basis === "rate" ? r.rateOrd : r.amountOrd);

/** 테마 하나의 셈 결과 — **임계값을 안 본 숫자만**. 판정과 표시(themeZoneVerdicts)가 같은 셈을 본다. */
export interface ThemeZoneStats {
    /** 존에 든 멤버 수 — 자신 포함. */
    zoneCount: number;
    /** 테마 전 멤버 중 기본 순위(존 무관). 자기 서수가 결손이면 null. */
    baseRank: number | null;
    /** 존에 든 멤버 중 순위. 자신이 존 밖이거나 서수 결손이면 null(결손은 결손). */
    zoneRank: number | null;
}

/**
 * 테마 하나의 셈 — 순위는 경쟁 순위(1,1,3)와 같은 결로 "자기보다 엄격히 좋은(작은) 서수의 멤버 수 + 1".
 * 임계값을 안 받는 이유: 이 셈이 판정과 화면 진단의 공통 재료여서다.
 */
export function themeZoneStatsOf(code: string, theme: string, section: ThemeSectionRanks, p: ThemeZoneParams, proj: ThemeProjection): ThemeZoneStats | null {
    const members = proj.codesByTheme.get(theme);
    if (!members || members.length === 0) return null;
    const self = section.ranksOf(code);
    const selfBasis = self === null ? null : basisOf(self, p);
    const selfInZone = self !== null && inThemeZone(self, p);

    let zoneCount = 0;
    let baseBetter = 0;
    let zoneBetter = 0;
    for (const m of members) {
        const r = m === code ? self : section.ranksOf(m);
        if (r === null) continue; // 유니버스 밖·결손 — 분모에서 빠진다
        const b = basisOf(r, p);
        const z = inThemeZone(r, p);
        if (z) zoneCount++;
        if (m === code) continue;
        if (b !== null && selfBasis !== null && b < selfBasis) {
            baseBetter++;
            if (z && selfInZone) zoneBetter++;
        }
    }
    return {
        zoneCount,
        baseRank: selfBasis === null ? null : baseBetter + 1,
        zoneRank: selfInZone && selfBasis !== null ? zoneBetter + 1 : null,
    };
}

/** 셈 → 활성 조건 AND 판정. **경계를 보는 유일한 자리**(결손 순위는 그 조건이 켜져 있으면 불만족). */
export function themeZoneStatsPass(stats: ThemeZoneStats | null, p: ThemeZoneParams): boolean {
    if (stats === null) return false;
    // 재적의 빈 하한은 0 이 아니라 1 — 존에 한 종목도 없는 테마는 "재적"이 아니다. 0 을 받으면 상한만 준 컷
    // (「~2종목」)이 존에 없는 테마까지 통과시켜 테마 사이 ∃ 로 거의 전 종목이 걸리지 않는다(리뷰 지적).
    if (themeCutActive(p.count) && !inCut(stats.zoneCount, { ...p.count, min: p.count.min ?? 1 })) return false;
    if (themeCutActive(p.baseRank) && !inCut(stats.baseRank, p.baseRank)) return false;
    if (themeCutActive(p.zoneRank) && !inCut(stats.zoneRank, p.zoneRank)) return false;
    return true;
}

/** 테마별 진단 한 줄 — 셈 + 그 테마 단독 판정(표시 전용 — 모수 루프에서 부르지 말 것). */
export interface ThemeZoneVerdict extends ThemeZoneStats {
    theme: string;
    pass: boolean;
}

/**
 * 시선 한 종목의 테마별 진단 — ∃ 를 접기 전 재료. 불변식: 활성 조건이 하나라도 있으면
 * `verdicts.some(v => v.pass) === themeAnswerOf(...).pass` — 테스트가 잡는다.
 */
export function themeZoneVerdicts(code: string, section: ThemeSectionRanks, p: ThemeZoneParams, proj: ThemeProjection): ThemeZoneVerdict[] {
    const themes = proj.themesByCode.get(code) ?? [];
    return themes.map((theme) => {
        const stats = themeZoneStatsOf(code, theme, section, p, proj);
        return { theme, pass: themeZoneStatsPass(stats, p), zoneCount: stats?.zoneCount ?? 0, baseRank: stats?.baseRank ?? null, zoneRank: stats?.zoneRank ?? null };
    });
}

/** 엔진 콜백(themeAt)이 낳는 답 — 판정 + 표시 재료(존 순위 best·승자 테마). */
export interface ThemeAnswer {
    pass: boolean;
    /** 소속 테마 중 최고(최소) 존 순위 — 존 밖·테마 없음·결손 = null. 옛 zoneRankAt 과 같은 뜻. */
    zoneRank: number | null;
    theme: string | null;
}

/**
 * 타점(종목·분) 하나의 답 — ∃테마 판정 + 존 순위 best 를 한 걸음에.
 * 활성 조건이 없으면 무조건 통과(조건 없음 = 필터 없음 — 존은 그때 시선 도구).
 */
export function themeAnswerOf(code: string, section: ThemeSectionRanks, p: ThemeZoneParams, proj: ThemeProjection): ThemeAnswer {
    const themes = proj.themesByCode.get(code);
    if (!themes || themes.length === 0) return { pass: !anyThemeCondOn(p), zoneRank: null, theme: null };
    let pass = !anyThemeCondOn(p);
    let best: { rank: number; theme: string } | null = null;
    for (const t of themes) {
        const stats = themeZoneStatsOf(code, t, section, p, proj);
        if (!pass && themeZoneStatsPass(stats, p)) pass = true;
        if (stats?.zoneRank != null && (best === null || stats.zoneRank < best.rank)) best = { rank: stats.zoneRank, theme: t };
    }
    return { pass, zoneRank: best?.rank ?? null, theme: best?.theme ?? null };
}

/**
 * 타점(종목·분) 하나의 답 — **enter(진입 시만)까지 본** 판정. 엔진 재료(`CellMaterials.themeAt`)가
 * 이걸 그대로 배선한다: pass(min) ∧ ¬pass(min−1). min−1 단면은 공급자(sectionOf)가 대는데,
 * 분당 캐시(sectionSeries)라 이웃 분 평가에서 재사용된다 — 진입 노브의 비용은 "단면 하나 더"다.
 * 세션 첫 분은 자연히 진입이다 — min−1 에 재료가 없으면 서수가 전부 결손이라 pass(min−1)=false.
 * (min ≤ 0 가드는 자정 경계의 안전핀일 뿐 실데이터에선 안 닿는다 — 세션은 08:00 이후다.)
 */
export function themeAnswerAt(
    code: string,
    sectionOf: (min: number) => ThemeSectionRanks,
    min: number,
    p: ThemeZoneParams,
    proj: ThemeProjection,
): ThemeAnswer {
    const now = themeAnswerOf(code, sectionOf(min), p, proj);
    if (p.enter !== true || !now.pass || min <= 0) return now;
    const prev = themeAnswerOf(code, sectionOf(min - 1), p, proj);
    return prev.pass ? { ...now, pass: false } : now;
}
