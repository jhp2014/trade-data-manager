// 등락 순위 축의 % 눈금(순수) — decisions.md 「테마 순위는 판 하나다」의 % 눈금 항목.
//
// 순위는 등락률 내림차순 경쟁 순위(core descendingOrdinals — 1 + #(rate > r))라, 그 분 단면에서
// `count = #(rate ≥ X)` 를 세면 X 이상은 전부 순위 ≤ count, 미만은 전부 ≥ count+1 이다 — `count + 0.5`
// 자리가 **정확한** X% 경계다(근사 불요). 셈은 순위와 **같은 배열**(sectionSeries.valuesAtMinute().rate —
// carry-forward·UN 기준 한 벌)을 써야 한다. 다른 배열을 세면 선과 점이 한 칸씩 어긋난다.
//
// 저장은 panelUi "rateTicks"(axes 와 별도 키 — 부재 = 기본 0·5·10·20, `[]` = 끔).
//
// 레이아웃 본체는 thresholdTicks(방향 무관 한 벌 — 억 눈금과 공유)로 이사했다. 여기는 % 어휘
// (pct·py·above/below 이름, 부호 색, 기본값·범위)의 어댑터만 남는다.
import type { AxisScale } from "./axisModel.js";
import { layoutThresholdTicks, thresholdCounts } from "./thresholdTicks.js";

export const DEFAULT_RATE_TICKS: readonly number[] = [0, 5, 10, 20];
export const RATE_TICK_MAX = 8;
export const RATE_TICK_LO = -30;
export const RATE_TICK_HI = 30;
/** 이보다 가까운 선의 글자는 하나로 합친다(「10·20%」). 선은 둘 다 긋는다. */
export const RATE_TICK_MERGE_PX = 12;

/** 칸 값 정규화 — 소수 1자리. */
export const roundTick = (v: number): number => Math.round(v * 10) / 10;

/**
 * 저장값 파서(관대) — 배열이 아니면 기본값, 배열이면 유한값·범위 안만·소수 1자리·중복 제거·오름차순·앞에서 8개.
 * `[]` 는 그대로 `[]`(끔 — 기본값으로 되살리지 않는다).
 */
export function parseRateTicks(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [...DEFAULT_RATE_TICKS];
    const set = new Set<number>();
    for (const v of raw) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const r = roundTick(v);
        if (r < RATE_TICK_LO || r > RATE_TICK_HI) continue;
        set.add(r);
    }
    return [...set].sort((a, b) => a - b).slice(0, RATE_TICK_MAX);
}

/**
 * 칩 입력 글자 → 값. 빈칸 = "" (삭제 뜻), 못 읽으면 null(취소 — 조용히 지우지 않는다).
 * 칩이 보여 주는 모양(유니코드 − · 꼬리 %)과 + 를 그대로 받는다.
 */
export function parseTickInput(text: string): number | "" | null {
    const t = text.trim().replace(/%$/, "").replace(/[−–]/g, "-").replace(/^\+/, "").trim();
    if (t === "") return "";
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

/** 입력 편집의 커밋 — 범위 밖은 끝으로 붙이고(조용히 버리지 않는다) 파서와 같은 정규화. */
export function commitRateTicks(next: readonly number[]): number[] {
    return parseRateTicks(next.map((v) => Math.min(RATE_TICK_HI, Math.max(RATE_TICK_LO, v))));
}

/** 선 하나의 셈 — count = 그 값 이상인 종목 수(결손 제외). % 는 소수 연산이라 1e-9 여유를 둔다. */
export function rateTickCounts(rates: readonly (number | null)[], pcts: readonly number[]): { pct: number; count: number }[] {
    return thresholdCounts(rates, pcts, 1e-9).map(({ v, count }) => ({ pct: v, count }));
}

export type TickTone = "rise" | "fall" | "flat";
export const tickTone = (pct: number): TickTone => (pct > 0 ? "rise" : pct < 0 ? "fall" : "flat");
export const fmtTick = (pct: number): string => String(roundTick(pct)).replace("-", "−");

export interface RateTickLayout {
    /** 뷰 안의 선(데이터 공간 y = count + 0.5 의 px). */
    lines: { pct: number; py: number }[];
    /** 왼쪽 여백 글자 — 가까운 선끼리 합친 묶음(위 → 아래). py = 글자 가운데(선에서 가장자리 글자만큼 밀릴 수 있다). */
    labels: { py: number; parts: number[] }[];
    /** 뷰 위로 벗어난 선의 값(있으면 위 가장자리 「…% ↑」). */
    above: number[];
    /** 뷰 아래로 벗어난 선의 값(있으면 아래 가장자리 「…% ↓」). */
    below: number[];
}

/**
 * 셈 → 화면 배치. count = 0(그 값 이상이 없음)은 선을 안 긋는다 — 1위 위의 선은 뜻이 없다.
 * 뷰 밖 판정은 `inDomain` 이다 — 순위 px 는 maxRank 로 클램프라 px 로 재면 밖의 선이 상자 안에 선다.
 * `edge` = 가장자리 「↑/↓」 글자의 가운데 px — 그 글자가 서면 뷰 안 글자는 그로부터 mergePx 밖으로 밀어 앉힌다
 * (선은 제자리 — 글자만 비킨다). 민 뒤에 합침을 재므로 밀려서 붙은 글자끼리는 하나로 합친다.
 */
export function layoutRateTicks(
    counts: readonly { pct: number; count: number }[],
    y: Pick<AxisScale, "px" | "inDomain">,
    domTop: number,
    edge: { top: number; bottom: number },
    mergePx = RATE_TICK_MERGE_PX,
): RateTickLayout {
    // 세로 축은 도메인 lo(1위) 쪽이 위(top) — thresholdTicks 의 lo/hi 가장자리로 그대로 매핑된다.
    const l = layoutThresholdTicks(
        counts.map((c) => ({ v: c.pct, count: c.count })),
        y,
        domTop,
        { loPx: edge.top, hiPx: edge.bottom },
        mergePx,
    );
    return {
        lines: l.lines.map(({ v, p }) => ({ pct: v, py: p })),
        labels: l.labels.map(({ p, parts }) => ({ py: p, parts })),
        above: l.beyondLo,
        below: l.beyondHi,
    };
}

/**
 * 묶음 글자의 조각 — 작은 값부터. `maxParts` 를 넘으면 양끝만 「a…b」(왼쪽 여백 44px 를 넘기지 않게 —
 * 「−10·−5·0%」도 넘친다. 뷰 안 = 2, 꼬리 화살표가 붙는 가장자리 = 1).
 */
export function tickLabelParts(parts: readonly number[], maxParts = 2): { text: string; tone: TickTone | null }[] {
    const fold = parts.length > maxParts && parts.length > 1;
    const pick = fold ? [parts[0], parts[parts.length - 1]] : parts;
    const sep = fold ? "…" : "·";
    const out: { text: string; tone: TickTone | null }[] = [];
    pick.forEach((p, i) => {
        if (i > 0) out.push({ text: sep, tone: null });
        out.push({ text: fmtTick(p), tone: tickTone(p) });
    });
    out.push({ text: "%", tone: null });
    return out;
}
