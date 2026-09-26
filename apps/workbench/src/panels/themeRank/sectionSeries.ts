// 분 단면의 **공용 지연 캐시** — 스크럽 단면(scrubSectionOf)·존 트랙(subjectOrdinalTrack)·꼬리
// (ThemeRankPanel trail)가 같은 분을 서로 모르게 세 번 굽지 않게, 스냅샷(stocks 배열)당 분→단면을
// 한 번만 계산해 나눠 쓴다. 계산 주체는 여전히 core rankSectionOf 하나다(서수 출처 단일화 — 여기는
// 캐시일 뿐 계산이 아니다). 값 층(sectionValuesOf)·T-창(windowedAmounts)도 같은 원칙·같은 캐시다.
//
// 키가 stocks **배열 참조**인 이유: /day-replay 는 react-query 캐시라 같은 날짜면 같은 배열이 돌아오고,
// 날짜가 바뀌거나 캐시가 밀려나면 참조가 바뀐다 — WeakMap 이 수명을 공짜로 따라간다(지우는 손 없음).
// 전량 선굽기(390분 ≈ 200ms 블로킹)를 안 하는 이유: 꼬리·스크럽은 분 몇 개면 되고, 전 분이 필요한
// 소비자(존 트랙)가 오면 그때 채워진다 — 처음 한 번만 오늘까지의 비용 그대로, 이후는 전부 재사용.
import {
    descendingOrdinals,
    rankSectionOf,
    sectionValuesOf,
    windowedAmounts,
    type RankSection,
    type SectionValues,
    type ThemeSectionRanks,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";

const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

interface Entry {
    date: string;
    byMinute: Map<number, RankSection>;
    valsByMinute: Map<number, SectionValues>;
    /** `${분}:${창}` → T-창 누적 대금 값/서수 — 창이 노브라 (분, 창) 낟알이다. */
    winValsByKey: Map<string, (number | null)[]>;
    winRanksByKey: Map<string, (number | null)[]>;
    /** 코드 → 배열 인덱스 — 테마 단면(ranksOf)의 조회 자. 스냅샷당 한 번. */
    codeIdx: Map<string, number> | null;
    /** `${분}:${창 키}` → 테마 단면(창 적용 끝) — theme 술어·표시가 같은 단면을 본다. */
    themeByKey: Map<string, ThemeSectionRanks>;
}

const cache = new WeakMap<readonly ReplayStock[], Entry>();

function entryOf(stocks: readonly ReplayStock[], date: string): Entry {
    let entry = cache.get(stocks);
    // 같은 배열에 다른 날짜가 올 일은 없지만(스냅샷은 날짜당 한 벌), 왔다면 낡은 단면을 섞느니 버린다.
    if (!entry || entry.date !== date) {
        entry = { date, byMinute: new Map(), valsByMinute: new Map(), winValsByKey: new Map(), winRanksByKey: new Map(), codeIdx: null, themeByKey: new Map() };
        cache.set(stocks, entry);
    }
    return entry;
}

/** (스냅샷, 날짜, 자정 기준 분) → 서수 단면. 같은 (스냅샷, 분)은 한 번만 계산된다. */
export function sectionAtMinute(stocks: readonly ReplayStock[], date: string, minute: number): RankSection {
    const entry = entryOf(stocks, date);
    let section = entry.byMinute.get(minute);
    if (!section) {
        section = rankSectionOf(stocks, date, fmtMin(minute));
        entry.byMinute.set(minute, section);
    }
    return section;
}

/** (스냅샷, 날짜, 분) → 값 단면(등락률 %·누적 대금 원) — 값 산점의 재료. */
export function valuesAtMinute(stocks: readonly ReplayStock[], date: string, minute: number): SectionValues {
    const entry = entryOf(stocks, date);
    let vals = entry.valsByMinute.get(minute);
    if (!vals) {
        vals = sectionValuesOf(stocks, date, fmtMin(minute));
        entry.valsByMinute.set(minute, vals);
    }
    return vals;
}

/** (스냅샷, 날짜, 분, 창) → T-창 누적 대금 값(원). 계산 주체는 core windowedAmounts 하나. */
export function windowedAmountsAt(stocks: readonly ReplayStock[], date: string, minute: number, windowMin: number): (number | null)[] {
    const entry = entryOf(stocks, date);
    const key = `${minute}:${windowMin}`;
    let vals = entry.winValsByKey.get(key);
    if (!vals) {
        vals = windowedAmounts(stocks, date, fmtMin(minute), windowMin);
        entry.winValsByKey.set(key, vals);
    }
    return vals;
}

/** (스냅샷, 날짜, 분, 창) → T-창 대금 서수 — 서수 규칙은 당일 서수와 같은 descendingOrdinals 다. */
export function windowedRanksAt(stocks: readonly ReplayStock[], date: string, minute: number, windowMin: number): (number | null)[] {
    const entry = entryOf(stocks, date);
    const key = `${minute}:${windowMin}`;
    let ranks = entry.winRanksByKey.get(key);
    if (!ranks) {
        ranks = descendingOrdinals(windowedAmountsAt(stocks, date, minute, windowMin));
        entry.winRanksByKey.set(key, ranks);
    }
    return ranks;
}

/**
 * (스냅샷, 날짜, 분, 창) → **테마 단면**(themeZone.ThemeSectionRanks — 창 적용이 끝난 서수 + 등락률 값).
 * 창(window)이 null 이면 당일 누적 서수, T분이면 창 서수 — 판정(themeAnswerOf)은 창을 모른다
 * (같은 단면을 두 창이 나눠 읽는 혼선을 인터페이스에서 막는다 — themeZone 머리 주석).
 */
export function themeSectionAt(stocks: readonly ReplayStock[], date: string, minute: number, window: number | null): ThemeSectionRanks {
    const entry = entryOf(stocks, date);
    const key = `${minute}:${window ?? "d"}`;
    let sec = entry.themeByKey.get(key);
    if (!sec) {
        if (entry.codeIdx === null) entry.codeIdx = new Map(stocks.map((s, i) => [s.code, i] as const));
        const idx = entry.codeIdx;
        const base = sectionAtMinute(stocks, date, minute);
        const vals = valuesAtMinute(stocks, date, minute);
        const amountOrd = window === null ? base.amount : windowedRanksAt(stocks, date, minute, window);
        sec = {
            ranksOf: (code) => {
                const i = idx.get(code);
                if (i === undefined) return null;
                return { rateOrd: base.rate[i] ?? null, ratePct: vals.rate[i] ?? null, amountOrd: amountOrd[i] ?? null };
            },
        };
        entry.themeByKey.set(key, sec);
    }
    return sec;
}
