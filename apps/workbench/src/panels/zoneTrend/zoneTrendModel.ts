// 테마 선 차트 판의 뷰모델(순수) — 렌더 무관. 주인공 칸과 (미래의) 썸네일 칸이 같은 함수를 부른다.
//
// 멤버십 판정 = core `inThemeZone` 한 벌(decisions.md 「테마 선 차트 판」 — `themeAnswerOf` 는 테마 ∃·컷을
// 보는 **판정**이라 View 에 안 들인다). 재료 = sectionSeries.themeSectionAt(창 적용이 끝난 서수 —
// 서수 출처 단일화 불변: 판정식을 여기 다시 쓰면 그 순간 출처가 둘이 된다).
//
// 선 = 현재 분까지의 prefix 인과 축약(zigzagIdx) — 미래 분은 안 그린다("어떻게 왔나").
// 날짜 낟알 재료(분 배열·분당 대금)는 stocks **배열 참조** WeakMap 캐시 — 스크럽 틱(분 변경)마다
// 하루치를 다시 굽지 않게(sectionSeries 와 같은 수명 전략: /day-replay 캐시가 참조를 지배한다).
import {
    amountBucketIndex, breakoutOfStock, inThemeZone, lastIndexAtOrBefore, minuteOfDayOf,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { minuteAmountOf } from "../canvas/amountRuns.js";
import { themeSectionAt } from "../themeRank/sectionSeries.js";
import type { ScopeZone } from "../themeRank/zoneSources.js";
import { zigzagIdx } from "./zigzagLine.js";

export interface ZoneTrendLine {
    code: string;
    name: string | null;
    /** 지그재그 꼭짓점(x = 자정 기준 분, y = 등락 %) — 마지막 = 현재 분 이하의 마지막 샘플. */
    pts: { x: number; y: number }[];
    /** 분당 대금(원) — 굵기(amountRuns)의 재료. 결손 분·직전 분 결손(차분 불가) = null(모름). */
    amountAt: (minute: number) => number | null;
}

export interface ZoneTrendModel {
    /** 멤버(시선 테마 동료 ∩ 존)들의 선 — 시선 종목은 여기서 빼고 subject 하나로만 선다(하늘색 한 줄 규칙). */
    members: ZoneTrendLine[];
    /** 시선 종목의 선 — 멤버가 아니어도 싣는다. 스냅샷에 없으면 null. */
    subject: ZoneTrendLine | null;
    /** 현재 분의 멤버 수(시선 겸직 포함) — 헤더 정보. 존 없음·시선 테마 없음 = 0. */
    memberCount: number;
}

// ── 날짜 낟알 캐시 — (stocks 참조, 종목)당 분 배열·분당 대금 함수 한 벌.
interface StockDay {
    /** times → 자정 기준 분(times 와 같은 인덱스·오름차순). */
    minutes: number[];
    amountAt: (minute: number) => number | null;
}

const dayCache = new WeakMap<readonly ReplayStock[], Map<string, StockDay>>();

function stockDayOf(stocks: readonly ReplayStock[], st: ReplayStock): StockDay {
    let byCode = dayCache.get(stocks);
    if (!byCode) {
        byCode = new Map();
        dayCache.set(stocks, byCode);
    }
    let day = byCode.get(st.code);
    if (!day) {
        const minutes = st.times.map(minuteOfDayOf);
        // 분당 대금 = 누적 차분 — 공용 minuteAmountOf(canvas, 테이프와 같은 정의).
        day = { minutes, amountAt: minuteAmountOf(minutes, st.cumAmount) };
        byCode.set(st.code, day);
    }
    return day;
}

function lineOf(stocks: readonly ReplayStock[], st: ReplayStock, minute: number, thresholdPt: number): ZoneTrendLine | null {
    const day = stockDayOf(stocks, st);
    const end = lastIndexAtOrBefore(day.minutes, minute);
    if (end < 0) return null; // 그 분까지 샘플이 없다(장 시작 전·늦은 상장)
    const idxs = zigzagIdx(st.rate, thresholdPt, end);
    return {
        code: st.code,
        name: st.name,
        pts: idxs.map((k) => ({ x: day.minutes[k], y: st.rate[k] })),
        amountAt: day.amountAt,
    };
}

export function zoneTrendModelOf(args: {
    stocks: readonly ReplayStock[];
    date: string;
    minute: number;
    /** null = 존 없음(시선 선만). 멤버십에 쓰는 건 존의 세 값뿐 — 컷은 판정이라 안 본다. */
    zone: Pick<ScopeZone, "window" | "zoneAmountN" | "rate"> | null;
    thresholdPt: number;
    subjectCode: string | null;
}): ZoneTrendModel {
    const { stocks, date, minute, zone, thresholdPt, subjectCode } = args;
    // 모수 = 시선 테마 멤버 ∩ 존(2026-10-06 사용자 확정) — 테마 재료는 스냅샷 themes(self-contained),
    // 다중 테마는 합집합. 시선이 스냅샷에 없거나 테마가 없으면 멤버 0(시선 선만).
    const subjectStock = subjectCode !== null ? stocks.find((s) => s.code === subjectCode) : undefined;
    const subjectThemes = new Set(subjectStock?.themes ?? []);
    const sec = zone !== null && subjectThemes.size > 0 ? themeSectionAt(stocks, date, minute, zone.window) : null;
    const members: ZoneTrendLine[] = [];
    let subject: ZoneTrendLine | null = null;
    let memberCount = 0;
    for (const st of stocks) {
        const isSubj = st.code === subjectCode;
        let isMember = false;
        if (sec !== null && zone !== null && (isSubj || st.themes.some((t) => subjectThemes.has(t)))) {
            const r = sec.ranksOf(st.code);
            isMember = r !== null && inThemeZone(r, zone);
        }
        if (isMember) memberCount++;
        if (!isMember && !isSubj) continue;
        const line = lineOf(stocks, st, minute, thresholdPt);
        if (line === null) continue;
        // 시선이 멤버를 겸하면 하늘색 한 줄만 — members 중복 금지(decisions).
        if (isSubj) subject = line;
        else members.push(line);
    }
    return { members, subject, memberCount };
}

/** y 자동 맞춤 — [min(−3, 최저−3), 최고+3], 모수 = **시선 테마 멤버 전체의 하루 전체**(2026-10-06
 *  저녁 사용자 확정 — 옛 시선 단독 기준 개정: 동료 선이 상한 밖으로 잘렸다). 존 무관·하루 기준인
 *  이유: 테마 집합은 하루 불변이라 스크럽 중 축이 안 출렁이고, 그려지는 멤버(테마∩존)는 전부 이
 *  부분집합이라 다 품긴다 — 멤버십(분마다 변함) 기준 fit 은 여전히 기각.
 *  하한도 선을 품는다(하락 종목에서 상한만 움직이면 창이 뒤집힌다 — 리뷰 지적).
 *  시선이 스냅샷에 없으면 기본 창. 수동 조정·복귀 규칙은 판이 진다. */
export const DEFAULT_Y_VIEW = { lo: -3, hi: 18 };

export function autoYViewOf(stocks: readonly ReplayStock[], subjectCode: string | null): { lo: number; hi: number } {
    const subj = subjectCode !== null ? stocks.find((s) => s.code === subjectCode) : undefined;
    if (!subj) return DEFAULT_Y_VIEW;
    const themes = new Set(subj.themes);
    let max = -Infinity;
    let min = Infinity;
    for (const st of stocks) {
        if (st !== subj && !st.themes.some((t) => themes.has(t))) continue;
        for (const r of st.rate) {
            if (r > max) max = r;
            if (r < min) min = r;
        }
    }
    if (!Number.isFinite(max)) return DEFAULT_Y_VIEW;
    // lo ≤ min−3 ≤ max−3 < max+3 — 창은 항상 바로 선다(별도 가드 불요).
    return { lo: Math.min(-3, min - 3), hi: max + 3 };
}

// ── hover 상세(캔들·대금 마커·밴드·사슬) — 짚은 선 하나의 분차트 오버레이 재료(2026-10-06 저녁,
// dense 선 → 캔들 교체). 전부 **UN 분모 % 공간**이라 이 판의 y 와 같은 좌표계다: 캔들 = 스냅샷
// minuteOpen/High/Low·rate 그대로, 밴드 = breakoutOfStock trace 그대로(환산 0 — 기본 차트는 분모가
// 갈려 환산했다). 사슬·밴드는 보는 집합의 「돌파」 줄(기본 차트 사슬 층과 같은 출처·같은 계산)이
// 정의한다 — 줄이 없으면 캔들·대금 마커만. 전부 현재 분까지(인과 — 미래 봉·밴드 안 싣는다).

export interface HoverDetail {
    /** 분봉(% 공간) — x = 분, o/h/l/c. 결손 분은 애초에 샘플이 없다. */
    candles: { x: number; o: number; h: number; l: number; c: number }[];
    /** 대금 구간 마커 — 분당 대금이 구간(20억~)에 든 봉. 표기는 기본 차트와 같은 「구간 하한 숫자」. */
    amounts: { x: number; h: number; bucket: number }[];
    /** 밴드 면 조각(러닝 = high·기준선 = base) — null·결손 분에서 끊는다. */
    bands: { kind: "high" | "base"; pts: { x: number; lo: number; hi: number }[] }[];
    /** 사슬 구간(배경 띠) — from~to 분(현재 분에서 절단). */
    chains: { from: number; to: number }[];
}

export function hoverDetailOf(
    stocks: readonly ReplayStock[],
    code: string,
    minute: number,
    chainKnobs: { zigzagPct: number; bandPct: number } | null,
    baseline: number | null,
): HoverDetail | null {
    const st = stocks.find((s) => s.code === code);
    if (!st) return null;
    const day = stockDayOf(stocks, st);
    const end = lastIndexAtOrBefore(day.minutes, minute);
    if (end < 0) return null;

    const candles: HoverDetail["candles"] = [];
    const amounts: HoverDetail["amounts"] = [];
    for (let i = 0; i <= end; i++) {
        const x = day.minutes[i];
        candles.push({ x, o: st.minuteOpen[i], h: st.minuteHigh[i], l: st.minuteLow[i], c: st.rate[i] });
        const tv = day.amountAt(x);
        const b = tv === null ? -1 : amountBucketIndex(tv);
        if (b >= 0) amounts.push({ x, h: st.minuteHigh[i], bucket: b });
    }

    const bands: HoverDetail["bands"] = [];
    const chains: HoverDetail["chains"] = [];
    if (chainKnobs !== null) {
        const res = breakoutOfStock(st, baseline, chainKnobs, { trace: true });
        const tr = res.trace!;
        // 밴드 조각 — null(밴드 없음·소멸)과 분 결손에서 끊는다(없는 구간을 지어내지 않기).
        const pushBand = (kind: "high" | "base", loOf: (i: number) => number | null, hiOf: (i: number) => number | null): void => {
            let seg: { x: number; lo: number; hi: number }[] = [];
            const flush = (): void => {
                if (seg.length > 0) bands.push({ kind, pts: seg });
                seg = [];
            };
            for (let i = 0; i <= end; i++) {
                const lo = loOf(i);
                const hi = hiOf(i);
                if (lo === null || hi === null) { flush(); continue; }
                if (seg.length > 0 && day.minutes[i] !== day.minutes[i - 1] + 1) flush();
                seg.push({ x: day.minutes[i], lo, hi });
            }
            flush();
        };
        pushBand("high", (i) => tr.bottom[i] ?? null, (i) => tr.top[i] ?? null);
        if (res.baselinePct !== null) pushBand("base", (i) => tr.baseBottom[i] ?? null, () => res.baselinePct);
        // 사슬 구간 — 끝 = 그 사슬의 마지막 거래 봉(현재 분 절단: end 이후 봉은 없는 셈).
        const lastBar = new Map<number, number>();
        for (const b of res.bars) if (b.i <= end) lastBar.set(b.chain, b.i);
        res.chains.forEach((c, k) => {
            if (c.start > end) return;
            chains.push({ from: day.minutes[c.start], to: day.minutes[lastBar.get(k) ?? c.start] });
        });
    }
    return { candles, amounts, bands, chains };
}

/** 크로스헤어 칩의 실값 — 그 분(이하 마지막 샘플 carry-forward)의 등락 % + 그 분의 분당 대금. */
export function trendSampleAt(
    stocks: readonly ReplayStock[],
    code: string,
    minute: number,
): { rate: number; amount: number | null } | null {
    const st = stocks.find((s) => s.code === code);
    if (!st) return null;
    const day = stockDayOf(stocks, st);
    const i = lastIndexAtOrBefore(day.minutes, minute);
    if (i < 0) return null;
    return { rate: st.rate[i], amount: day.amountAt(minute) };
}
