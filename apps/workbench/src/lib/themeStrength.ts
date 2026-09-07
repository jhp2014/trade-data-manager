// 테마 강도 판정 — 순위 단면 서수 위의 **순수 계산**(React·wire·I/O 0).
//
// ## 의미론 (decisions.md "테마 강도·순위 단면" — 묶음 필터)
// 타점 통과 ⟺ 그 종목의 소속 테마 중, **활성 하위 조건 전부를 혼자 만족하는** 테마가 하나라도 존재
// (테마 단위 AND · 테마 간 ∃). 하위 조건을 독립 평가해 조합하면 서로 다른 테마로 나눠 만족해도
// 통과해 버린다 — 그래서 판정이 두 층이다: passesTheme(테마 하나의 AND) → passesPoint(∃).
// **passesTheme 를 단독 소비하는 코드를 만들지 말 것** — 그 순간 분해 금지가 무너진다.
// 화면이 "어느 테마가 통과시키나"를 말해야 할 때는 `themeVerdicts`(∃ 를 접기 전 재료)를 쓴다 —
// 판정 경로는 여전히 `passesPoint` 하나이고, 둘의 일치는 불변식으로 테스트가 잡는다.
// 활성 조건이 하나도 없으면 조건 없음 = 전부 통과(존 N/M 은 그때 순수 시선 도구다 — 사용자 확정).
//
// ## 왜 투영(ThemeProjection)을 받나
// ThemeIndex.themesOf/codesOf 는 호출마다 배열을 복사한다(core 오염 방지 계약). 수천 타점 × 테마
// 루프 안에서 부르면 프레임당 수만 할당 — 진입부에서 한 번 투영하고 내부는 참조만 쓴다.
// 이 모듈은 테마 멤버십을 **읽기 시점 현재 상태**로만 본다(굽지 않는다 — 확정 설계).
//
// ## core 시민 자격
// 입출력이 전부 순수값이라 나중에 api 가 같은 판정을 하게 되면 core 로 파일 이동만 하면 된다 —
// 훅·React import 를 이 파일에 들이지 말 것.
import type { ThemeIndex } from "@trade-data-manager/market/domain";

/** 단면에서 이 모듈이 요구하는 것 — 구운 번들 단면(useRankSections.SectionView)과 스크럽 재계산
 *  단면(scrubSection) 어느 쪽이든 이 모양이면 **같은 함수**에 들어간다(서수 출처가 둘이 되지 않게). */
export interface SectionRanks {
    ranksOf(code: string): { rate: number | null; amount: number | null } | null;
}

/**
 * 묶음 파라미터 — 평평한 스칼라만(persistedField 의 mergeShape 로 파싱이 끝나게).
 * 활성 플래그와 임계값을 분리한 이유: 끈 조건의 임계값이 살아 있어야 다시 켤 때 원래 자리로
 * 돌아온다(축 서랍의 "숨김은 조건을 안 건드린다"와 같은 논리).
 * ⚠ 존은 **교집합**(등락률 서수 ≤ zoneRateN ∧ 거래대금 서수 ≤ zoneAmountN)이다 — 복기 보드
 * replaySettings 의 N/M(합집합 hot)과 어휘가 다르니 이름을 섞지 말 것.
 */
export interface ThemeStrengthParams {
    zoneRateN: number;
    zoneAmountN: number;
    /** 순위 조건(②③)의 기준 서수 — 한 벌 공유(사용자 확정: 등락률 기본, 거래대금 옵션). */
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

export const DEFAULT_THEME_STRENGTH: ThemeStrengthParams = {
    zoneRateN: 30,
    zoneAmountN: 40,
    basis: "rate",
    countOn: true,
    countMin: 3,
    baseRankOn: false,
    baseRankMax: 3,
    zoneRankOn: false,
    zoneRankMax: 2,
};

export const anyConditionOn = (p: ThemeStrengthParams): boolean => p.countOn || p.baseRankOn || p.zoneRankOn;

/**
 * 저장물 파서 — 깔때기 술어(parsePredicate)의 유효성 정의 한 벌. 정책은 관대한 병합:
 * 객체가 아니면 null, 필드는 맞는 것만 승계·나머지 기본값 — 필드가 나중에 늘어도 옛 저장물(필터 한 벌·
 * 저장 집합)이 통째로 소멸하지 않아야 해서다(parseStages 는 null 하나에 전체를 폐기한다).
 */
export function parseThemeStrengthParams(o: unknown): ThemeStrengthParams | null {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    const d = DEFAULT_THEME_STRENGTH;
    const num = (v: unknown, fb: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : fb);
    const bool = (v: unknown, fb: boolean): boolean => (typeof v === "boolean" ? v : fb);
    return {
        zoneRateN: num(r.zoneRateN, d.zoneRateN),
        zoneAmountN: num(r.zoneAmountN, d.zoneAmountN),
        basis: r.basis === "amount" ? "amount" : "rate",
        countOn: bool(r.countOn, d.countOn),
        countMin: num(r.countMin, d.countMin),
        baseRankOn: bool(r.baseRankOn, d.baseRankOn),
        baseRankMax: num(r.baseRankMax, d.baseRankMax),
        zoneRankOn: bool(r.zoneRankOn, d.zoneRankOn),
        zoneRankMax: num(r.zoneRankMax, d.zoneRankMax),
    };
}

/** 테마 멤버십의 루프용 투영 — 복사는 여기서 한 번뿐. */
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

/** 존 판정에 필요한 조각 — 틱 재료 함수는 임계값 없이 이만큼만 받는다(의존이 좁을수록 캐시가 오래 산다). */
export type ZoneParams = Pick<ThemeStrengthParams, "zoneRateN" | "zoneAmountN" | "basis">;

const inZone = (r: { rate: number | null; amount: number | null }, p: ZoneParams): boolean =>
    r.rate !== null && r.amount !== null && r.rate <= p.zoneRateN && r.amount <= p.zoneAmountN;

/** 테마 하나의 셈 결과 — **임계값을 안 본 숫자만**. 판정(passesTheme)과 표시(themeVerdicts)가 같은 셈을 본다. */
export interface ThemeStats {
    /** 존(등락 ≤ N ∧ 대금 ≤ M)에 든 멤버 수 — 자신 포함. */
    zoneCount: number;
    /** 테마 전 멤버 중 기본 순위(존 무관). 자기 서수가 결손이면 null. */
    baseRank: number | null;
    /** 존에 든 멤버 중 순위. 자신이 존 밖이거나 서수 결손이면 null(결손은 결손). */
    zoneRank: number | null;
}

/**
 * 테마 하나의 셈 — 순위는 core 경쟁 순위(1,1,3)와 같은 결로 "자기보다 엄격히 좋은(작은) 서수의 멤버
 * 수 + 1" 이라 동점끼리는 서로를 밀지 않는다. 멤버가 없으면 null(= 만족할 무리가 없다).
 * 임계값을 안 받는 이유: 이 셈이 판정과 화면 진단의 **공통 재료**여서다 — 임계값을 여기 들이면
 * 표시가 "임계값에 따라 달라지는 숫자"를 말하게 되고, 왜 떨어졌는지 못 읽는다.
 */
export function themeStatsOf(code: string, theme: string, section: SectionRanks, zoneParams: ZoneParams, proj: ThemeProjection): ThemeStats | null {
    const members = proj.codesByTheme.get(theme);
    if (!members || members.length === 0) return null;
    const self = section.ranksOf(code);
    const selfBasis = self === null ? null : zoneParams.basis === "rate" ? self.rate : self.amount;
    const selfInZone = self !== null && inZone(self, zoneParams);

    let zoneCount = 0;
    let baseBetter = 0; // 존 무관, 기준 서수가 자신보다 좋은 멤버 수
    let zoneBetter = 0; // 존 안에서 기준 서수가 자신보다 좋은 멤버 수
    for (const m of members) {
        const r = m === code ? self : section.ranksOf(m);
        if (r === null) continue; // 유니버스 밖·결손 — 분모에서 빠진다
        const b = zoneParams.basis === "rate" ? r.rate : r.amount;
        const z = inZone(r, zoneParams);
        if (z) zoneCount++;
        if (m === code) continue; // 자신은 "자기보다 좋은" 셈의 대상이 아니다
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
export function statsPass(stats: ThemeStats | null, params: ThemeStrengthParams): boolean {
    if (stats === null) return false;
    if (params.countOn && stats.zoneCount < params.countMin) return false;
    if (params.baseRankOn && (stats.baseRank === null || stats.baseRank > params.baseRankMax)) return false;
    if (params.zoneRankOn && (stats.zoneRank === null || stats.zoneRank > params.zoneRankMax)) return false;
    return true;
}

/**
 * 테마 하나가 활성 하위 조건 **전부**를 만족하는가(AND).
 * 앞의 두 줄은 **뜨거운 경로(countPassing: 모수 × 테마 × 멤버)의 조기 탈락**이다 — 자기 결손만으로
 * 갈리는 둘을 멤버 루프 전에 잘라낸다(결과는 statsPass 와 같다: 존 밖 → zoneRank null · 서수 결손 →
 * baseRank null). 표시 경로(themeVerdicts)는 이 지름길을 타지 않는다 — 왜 떨어졌는지 읽히려면
 * 셈이 다 나와야 한다.
 */
export function passesTheme(code: string, theme: string, section: SectionRanks, params: ThemeStrengthParams, proj: ThemeProjection): boolean {
    if (params.zoneRankOn || params.baseRankOn) {
        const self = section.ranksOf(code);
        if (params.zoneRankOn && !(self !== null && inZone(self, params))) return false;
        if (params.baseRankOn && (self === null || (params.basis === "rate" ? self.rate : self.amount) === null)) return false;
    }
    return statsPass(themeStatsOf(code, theme, section, params, proj), params);
}

/** 테마별 진단 한 줄 — 셈 + 그 테마 단독 판정. */
export interface ThemeVerdict extends ThemeStats {
    theme: string;
    pass: boolean;
}

/**
 * 시선 한 종목의 **테마별 진단**(표시 전용) — ∃ 를 접기 전의 재료를 그대로 낸다. 화면이 "어느 테마가
 * 통과시키나"를 말할 수 있게 하는 유일한 정문이다(그래서 `passesTheme` 를 화면이 직접 부를 일이 없다).
 * 불변식: 활성 조건이 하나라도 있으면 `verdicts.some(v => v.pass) === passesPoint(...)` — 테스트가 잡는다.
 * ⚠ 모수 루프에서 부르지 말 것 — 시선 1개용이다(테마당 객체를 만든다).
 */
export function themeVerdicts(code: string, section: SectionRanks, params: ThemeStrengthParams, proj: ThemeProjection): ThemeVerdict[] {
    const themes = proj.themesByCode.get(code) ?? [];
    return themes.map((theme) => {
        const stats = themeStatsOf(code, theme, section, params, proj);
        return { theme, pass: statsPass(stats, params), zoneCount: stats?.zoneCount ?? 0, baseRank: stats?.baseRank ?? null, zoneRank: stats?.zoneRank ?? null };
    });
}

/** 타점(종목) 하나의 통과 — ∃테마. 활성 조건이 없으면 무조건 통과(조건 없음 = 필터 없음). */
export function passesPoint(code: string, section: SectionRanks, params: ThemeStrengthParams, proj: ThemeProjection): boolean {
    if (!anyConditionOn(params)) return true;
    const themes = proj.themesByCode.get(code);
    if (!themes || themes.length === 0) return false; // 조건이 있는데 테마가 없으면 만족할 무리가 없다
    return themes.some((t) => passesTheme(code, t, section, params, proj));
}

/** 모수 집계 — 헤더 카운트의 3항(통과 / 판정가능 / 결손). 결손 = 단면 없음(pending·미수집·오늘). */
export interface StrengthCount {
    passed: number;
    evaluable: number;
    missing: number;
}

export function countPassing(
    points: readonly { stockCode: string; date: string; time: string }[],
    sectionAt: (date: string, time: string) => SectionRanks | null,
    params: ThemeStrengthParams,
    proj: ThemeProjection,
): StrengthCount {
    let passed = 0;
    let evaluable = 0;
    let missing = 0;
    for (const p of points) {
        const section = sectionAt(p.date, p.time);
        if (section === null) {
            missing++;
            continue;
        }
        evaluable++;
        if (passesPoint(p.stockCode, section, params, proj)) passed++;
    }
    return { passed, evaluable, missing };
}

