// 테마 존 판정 — 분 단면 서수 위의 **순수 계산**(React·wire·I/O 0). 하루 「테마」 셀 술어의 판정 한 벌.
// 옛 workbench lib/themeStrength 의 core 이주(2026-09-26)이자 개형: 대금 창이 0|60 이지선다에서
// **자유 T분**(null = 당일 누적)이 되고, 등락 축이 순위 ≤M | **값 ≥x%** 둘이 된다(조합 4).
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

/** 등락 축 — 존의 세로 변. 순위(서수 ≤ max)거나 값(등락률 ≥ minPct%). */
export type ThemeRateAxis = { mode: "rank"; max: number } | { mode: "value"; minPct: number };

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
    /** ① 존 내 테마 종목 수 ≥ countMin (자신 포함). */
    countOn: boolean;
    countMin: number;
    /** ② 테마 내 기본 순위 ≤ baseRankMax (존 무관, 테마 전 멤버 중). */
    baseRankOn: boolean;
    baseRankMax: number;
    /** ③ 테마 내 존 순위 ≤ zoneRankMax (존에 든 멤버 중 — 자신이 존 밖이면 불만족). */
    zoneRankOn: boolean;
    zoneRankMax: number;
}

export const DEFAULT_THEME_ZONE: ThemeZoneParams = {
    window: null,
    zoneAmountN: 40,
    rate: { mode: "rank", max: 30 },
    basis: "rate",
    countOn: true,
    countMin: 3,
    baseRankOn: false,
    baseRankMax: 3,
    zoneRankOn: false,
    zoneRankMax: 2,
};

export const THEME_WINDOW_MAX_MIN = 600;

export const anyThemeCondOn = (p: ThemeZoneParams): boolean => p.countOn || p.baseRankOn || p.zoneRankOn;

/** 파라미터 키 — 엔진의 셀당 답 캐시·표시 memo 가 같은 자를 쓴다(같은 키 = 같은 판정). */
export const themeZoneKeyOf = (p: ThemeZoneParams): string =>
    `tz|w${p.window ?? "d"}|a${p.zoneAmountN}|r${p.rate.mode === "rank" ? `k${p.rate.max}` : `v${p.rate.minPct}`}|b${p.basis}` +
    `|c${p.countOn ? p.countMin : "-"}|B${p.baseRankOn ? p.baseRankMax : "-"}|Z${p.zoneRankOn ? p.zoneRankMax : "-"}`;

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
            if (a.mode === "value" && typeof a.minPct === "number" && Number.isFinite(a.minPct)) return { mode: "value", minPct: a.minPct };
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
    return {
        window,
        zoneAmountN: num(r.zoneAmountN, d.zoneAmountN),
        rate,
        basis: r.basis === "amount" ? "amount" : "rate",
        countOn: bool(r.countOn, d.countOn),
        countMin: num(r.countMin, d.countMin),
        baseRankOn: bool(r.baseRankOn, d.baseRankOn),
        baseRankMax: num(r.baseRankMax, d.baseRankMax),
        zoneRankOn: bool(r.zoneRankOn, d.zoneRankOn),
        zoneRankMax: num(r.zoneRankMax, d.zoneRankMax),
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
        : r.ratePct !== null && r.ratePct >= p.rate.minPct;
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

/** 셈 → 활성 조건 AND 판정. **임계값을 보는 유일한 자리**(결손 순위는 그 조건이 켜져 있으면 불만족). */
export function themeZoneStatsPass(stats: ThemeZoneStats | null, p: ThemeZoneParams): boolean {
    if (stats === null) return false;
    if (p.countOn && stats.zoneCount < p.countMin) return false;
    if (p.baseRankOn && (stats.baseRank === null || stats.baseRank > p.baseRankMax)) return false;
    if (p.zoneRankOn && (stats.zoneRank === null || stats.zoneRank > p.zoneRankMax)) return false;
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
