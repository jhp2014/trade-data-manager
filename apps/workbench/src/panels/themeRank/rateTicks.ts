// 등락 순위 축의 % 눈금(순수) — decisions.md 「테마 순위는 판 하나다」의 % 눈금 항목.
//
// 순위는 등락률 내림차순 경쟁 순위(core descendingOrdinals — 1 + #(rate > r))라, 그 분 단면에서
// `count = #(rate ≥ X)` 를 세면 X 이상은 전부 순위 ≤ count, 미만은 전부 ≥ count+1 이다 — `count + 0.5`
// 자리가 **정확한** X% 경계다(근사 불요). 셈은 순위와 **같은 배열**(sectionSeries.valuesAtMinute().rate —
// carry-forward·UN 기준 한 벌)을 써야 한다. 다른 배열을 세면 선과 점이 한 칸씩 어긋난다.
//
// 저장은 panelUi "rateTicks"(axes 와 별도 키 — 부재 = 기본 0·5·10·20, `[]` = 끔).
import type { AxisScale } from "./axisModel.js";

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

/** 선 하나의 셈 — count = 그 값 이상인 종목 수(결손 제외). */
export function rateTickCounts(rates: readonly (number | null)[], pcts: readonly number[]): { pct: number; count: number }[] {
    return pcts.map((pct) => {
        let count = 0;
        for (const r of rates) if (r !== null && Number.isFinite(r) && r >= pct - 1e-9) count++;
        return { pct, count };
    });
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
    const lines: { pct: number; py: number }[] = [];
    const above: number[] = [];
    const below: number[] = [];
    for (const { pct, count } of counts) {
        if (count <= 0) continue;
        const v = count + 0.5;
        if (y.inDomain(v)) lines.push({ pct, py: y.px(v) });
        else if (v < domTop) above.push(pct);
        else below.push(pct);
    }
    // 위 → 아래(= 큰 값 → 작은 값) 순서로 합친다. 같은 count 의 두 값은 같은 py 라 자연히 한 묶음.
    const lo = above.length > 0 ? edge.top + mergePx : -Infinity;
    const hi = below.length > 0 ? edge.bottom - mergePx : Infinity;
    const sorted = lines.map((l) => ({ pct: l.pct, py: Math.min(hi, Math.max(lo, l.py)) })).sort((a, b) => a.py - b.py || b.pct - a.pct);
    const labels: { py: number; parts: number[] }[] = [];
    let cur: { pys: number[]; parts: number[] } | null = null;
    for (const l of sorted) {
        if (cur !== null && l.py - cur.pys[cur.pys.length - 1] < mergePx) {
            cur.pys.push(l.py);
            cur.parts.push(l.pct);
            continue;
        }
        if (cur !== null) labels.push(close(cur));
        cur = { pys: [l.py], parts: [l.pct] };
    }
    if (cur !== null) labels.push(close(cur));
    return { lines, labels, above: above.sort((a, b) => a - b), below: below.sort((a, b) => a - b) };
}

/** 묶음 닫기 — 글자 자리는 선들의 가운데, 조각은 작은 값부터(「10·20%」 — 읽는 순서). */
const close = (g: { pys: number[]; parts: number[] }): { py: number; parts: number[] } => ({
    py: g.pys.reduce((a, b) => a + b, 0) / g.pys.length,
    parts: [...g.parts].sort((a, b) => a - b),
});

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
