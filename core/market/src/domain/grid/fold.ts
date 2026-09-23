// 격자 접기 — zigzag 1% 로 구운 날짜 격자를 읽기 시점에 p%(2%·3%…)로 접는다.
// 규칙 전문은 .claude/decisions.md 「하루 타점 — 서버가 날짜 격자를 굽고 클라가 조건으로 뽑는다」.
//
// ## 왜 접나
// 하루 우주는 서버가 날짜 × 전 종목 격자를 **한 벌**(1%)만 굽고, 마디의 해상도(2%·3%·5%)는 읽는 쪽이
// 정한다. 굽는 값을 넓게 두고 읽을 때 조이는 원칙(밴드 3% → m' 0.5 와 같은 결).
//
// ## 무엇을 재사용하나 — 루프를 사본으로 흉내 내지 않는다
// 접기는 `detectGrid` 와 **같은 zigzag 루프(`zigzagIdxOf`)와 같은 크로싱 스캔(`levelCrossIdxOf`)** 을
// 성긴 봉 열 위에서 다시 돌린다. 2026-09-23 벤치의 순진한 접기(첫 1% 피벗부터 교대 열만 훑기)는 선행
// 국면(`dir=none` 에서 세션 고·저를 둘 다 추적)과 tie 규칙(세션 최고가 갱신 봉은 고가 우선)을 못 따라가
// 6종목에서 `levelViewOf` 불변식(레벨 cross 결손)을 깨뜨렸다.
//
// ## 성긴 봉 열 S = 1% 피벗 ∪ 사건 봉(분으로 병합)
//  · 사건 봉(newHighs)은 OHLC 가 완결이라 고가·저가를 둘 다 안다.
//  · 사건이 아닌 고점 피벗은 **저가를 +∞**, 저점 피벗은 **고가를 −∞** 로 둔다 — 모르는 쪽은 어떤 판정도
//    먼저 일으키지 못한다(`zigzagIdxOf` 머리 주석).
//  · floor 0 으로 구웠으므로 **러닝 최고가 갱신 봉이 전부 S 에 있다** — tie 스위치(renew)와 러닝 최고가가
//    원본과 정확히 같다. 세션 첫 봉은 언제나 사건(maxBefore 0)이라 선행 국면이 실제 값에서 시작한다.
//
// ## 근사다 — 감수한다(사용자 확정: 하루는 탐색이라 대강 유사하면 충분)
//  · **확정 시각을 잃는다** — p% 확정 봉은 대개 1% 피벗 **사이**에 있어 S 에 없다. **이른 경계**를 쓴다:
//    확정시킨 원소 직전의 1% 피벗 다음 분(그보다 이른 봉에는 p% 되돌림이 원리적으로 없다 — 그 앞 구간의
//    최저는 그 구간의 1% 저점 피벗이고 그건 S 에 있다). 약한 미래 누출이다(확정을 조금 일찍 본다).
//  · 사이 봉의 저가·고가를 잃어 극값 선택이 드물게 갈린다(실측 3일: 직접 2% 대비 타점 사라짐 2 · 생김 2 / 312).
//  · 그래서 같은 (종목, 날짜)의 재돌파가 하루(접은 2%)와 종단(직접 2%)에서 ~1% 다를 수 있다 — 버그 아님.
import { DAY_GRID_DETECT_OPTIONS, levelCrossIdxOf, zigzagIdxOf, type GridBarMark, type GridPivot, type PointGrid } from "./grid.js";

export interface FoldResult {
    grid: PointGrid;
    /**
     * 레벨의 크로싱이 **사건 아닌 피벗**에 걸려 자기 봉 대금(tv)을 모르는 수. 클래스 ①(세션 최고가가
     * 피벗이 못 돼 레벨이 러닝 최고가보다 낮다 — 첫 크로싱이 갱신 사건이 아닐 수 있다)에서만 난다.
     * 그 cross 는 `tv = 이 봉.cum − 직전 원소.cum`(그 사이 봉 전부의 합)으로 싣는다 — 창 [크로싱..끝] 을
     * **직전 원소 다음 봉부터**로 이르게 근사한다(확정 시각의 이른 경계와 같은 결). `"0"` 으로 두면 갱신
     * 창이 0 이 되어 불변식 ⑥(0 < renewal ≤ leg)을 깬다. 하루 판정(`pointsOf`·`levelViewOf`)은 cross 의
     * tv 를 읽지 않는다 — 이 값은 창을 읽는 소비자가 생길 때를 위한 무해한 근사다.
     */
    crossTvUnknown: number;
}

/** S 의 원소 하나 — 모르는 고가는 −∞, 모르는 저가는 +∞, 모르는 대금은 null. */
interface CoarseBar {
    min: number;
    high: number;
    low: number;
    cum: string;
    tv: string | null;
}

/**
 * 1% 격자 → p% 격자. `pct ≤ fromPct` 면 그대로 돌려준다(더 가늘게는 못 만든다 — 재굽기의 일).
 * 피벗만 바뀌고 사건 목록·세션 최고가·전일종가·기준선은 원본 그대로다.
 */
export function foldGrid(g: PointGrid, pct: number, fromPct: number = DAY_GRID_DETECT_OPTIONS.zigzagPct): FoldResult {
    if (pct <= fromPct) return { grid: g, crossTvUnknown: 0 };

    // ── 성긴 봉 열 S ──
    const byMin = new Map<number, CoarseBar>();
    for (const e of g.newHighs) byMin.set(e.min, { min: e.min, high: e.high, low: e.low, cum: e.cum, tv: e.tv });
    for (const p of g.pivots) {
        // 사건 봉이면 이미 OHLC 를 안다(피벗 가격 = 그 봉의 고가/저가). 피벗끼리는 한 봉을 못 나눈다(불변식 ①).
        if (byMin.has(p.min)) continue;
        byMin.set(
            p.min,
            p.kind === "high"
                ? { min: p.min, high: p.price, low: Infinity, cum: p.cum, tv: null }
                : { min: p.min, high: -Infinity, low: p.price, cum: p.cum, tv: null },
        );
    }
    const S = [...byMin.values()].sort((a, b) => a.min - b.min);
    const mins = S.map((x) => x.min);
    const highs = S.map((x) => x.high);
    const lows = S.map((x) => x.low);

    // ── 같은 루프 · 같은 스캔을 p% 로 ──
    const raw = zigzagIdxOf(highs, lows, pct, (i) => mins[i]);
    const crossIdx = levelCrossIdxOf(raw, highs, (i) => mins[i]);

    // 이른 경계 — 확정시킨 원소 **직전의 1% 피벗** 다음 분(극값 다음 분보다 이르면 그리로).
    const pivotMins = g.pivots.map((p) => p.min); // 시간 강한 오름차순(격자 불변식 ①)
    const earlyConfirm = (extremeMin: number, confirmMin: number): number => {
        let lo = 0;
        let hi = pivotMins.length - 1;
        let before = -Infinity;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (pivotMins[mid] < confirmMin) {
                before = pivotMins[mid];
                lo = mid + 1;
            } else hi = mid - 1;
        }
        return Math.max(before + 1, extremeMin + 1);
    };

    let crossTvUnknown = 0;
    const markOf = (i: number): GridBarMark => {
        const el = S[i];
        if (el.tv !== null) return { min: el.min, tv: el.tv, cum: el.cum };
        // 모름 — 직전 원소 뒤부터 이 봉까지의 합으로 싣는다(FoldResult.crossTvUnknown 머리 주석).
        // i ≥ 1 은 스캔이 직전 레벨 다음부터 도는 데서 보장된다.
        crossTvUnknown++;
        return { min: el.min, tv: (BigInt(el.cum) - BigInt(S[i - 1].cum)).toString(), cum: el.cum };
    };

    const pivots: GridPivot[] = raw.map((r, k) => ({
        kind: r.kind,
        min: mins[r.idx],
        price: r.kind === "high" ? highs[r.idx] : lows[r.idx],
        confirmedMin: r.confirmIdx === null ? null : earlyConfirm(mins[r.idx], mins[r.confirmIdx]),
        cum: S[r.idx].cum,
        cross: crossIdx[k] === null ? null : markOf(crossIdx[k]!),
    }));
    return { grid: { ...g, pivots }, crossTvUnknown };
}
