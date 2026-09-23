// 돌파 사슬 — Daily 타점 생성기(2026-09-24). 규칙 전문은 .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// 한 종목·하루의 dense 분봉을 한 번 훑어 **두 밴드 상태기계**(러닝 최고가 밴드·기준선 밴드)와 **돌파 사슬**을
// 세우고, 사슬 안의 **대금 사다리**를 통과한 봉을 후보로 낸다. 격자·접기를 쓰지 않는다 — 사슬 안 봉은 사건
// 봉이 아니어도 대금만으로 후보가 되므로 모든 분봉의 대금이 필요하고, 그건 분봉 순회에만 있다.
//
// ## 값 공간 — % 를 가격 비로
// 입력은 `/day-replay` 의 % 시계열(기준가 대비, 소수 2자리)이다. 비교는 전부 **가격 비**(1 + %/100)로 한다 —
// 밴드 하단 M×(1−b)·눌림 H×(1−z) 는 % 차가 아니라 가격 비율이다. 0.01% 반올림은 호가 한 틱(≥ ~0.05%)보다
// 작아 같은 가격은 같은 값·다른 가격은 다른 값이 된다. 반올림끼리 겹친 오차(≤ 1e-4)를 `EPS` 로 흡수해
// "터치(같은 가격)"를 정확히 잡는다 — 한 틱 아래(≥ 5e-4)는 여전히 못 넘는다.
//
// ## 필터는 구조를 안 바꾼다
// 밴드·사슬·사다리는 **모든 거래 봉**으로 선다. 양봉·시간대·돌파 대금 같은 조건은 후보에 거는 AND 필터라
// 여기 없다(켜고 끄는 것이 다른 후보의 존재를 흔들면 안 된다). 거래 없는 봉(분 대금 0 — dense 채움봉)은
// 아무것도 아니다: 사건도 밴드 갱신도 사슬 끝도 아니다(거래 없음은 가격 사건이 아니다).

/** 입력 — `/day-replay` MinuteDerived 에서 쓰는 필드만(와이어 종목이 그대로 들어온다). */
export interface ChainSeries {
    minuteHigh: readonly number[];
    minuteLow: readonly number[];
    /** 세션 누적 거래대금(원) — 분 대금 = 앞 분과의 차. */
    cumAmount: readonly number[];
}

export interface BreakoutChainKnobs {
    /** 사슬 끝 — 사슬 고점에서 이만큼(%) 눌리면 끝. */
    zigzagPct: number;
    /** 밴드 폭(%) — 러닝 최고가 밴드·기준선 밴드 공용. */
    bandPct: number;
}

/** 사슬 이름표 — 사슬 단위, 도중 합류(「고가 돌파」 사슬이 기준선 밴드 사건을 만나면 그 봉부터 「기준선 돌파」). */
export type BreakoutLabel = "baseline" | "high";

export interface BreakoutCandidate {
    /** 시계열 인덱스. */
    i: number;
    /** 그 봉 대금(원). */
    tv: number;
    /** 사슬 번호(그날 0부터). */
    chain: number;
    /** 사슬 안 순번 — 0 = 첫 사건. */
    seq: number;
    label: BreakoutLabel;
}

export interface BreakoutChainSpan {
    start: number;
    /** 사슬을 끝낸 봉(눌림) — 장 끝까지 살아 있으면 null. */
    end: number | null;
    /** 사슬 고점(%). */
    high: number;
    /** 「기준선 돌파」가 된 봉(시작부터면 start) — 끝까지 「고가 돌파」면 null. */
    baselineFrom: number | null;
}

/** 그림용 밴드 궤적(%) — 봉 처리 **뒤**의 상태. 기준선 밴드가 없거나 소멸했으면 null. */
export interface BandTrace {
    top: (number | null)[];
    bottom: (number | null)[];
    baseBottom: (number | null)[];
}

export interface BreakoutChainResult {
    candidates: BreakoutCandidate[];
    chains: BreakoutChainSpan[];
    trace?: BandTrace;
}

const EPS = 1e-4;
const lv = (pct: number): number => 1 + pct / 100;
const pctOf = (level: number): number => (level - 1) * 100;
const ge = (a: number, b: number): boolean => a >= b - EPS;
const le = (a: number, b: number): boolean => a <= b + EPS;
const gt = (a: number, b: number): boolean => a > b + EPS;

/**
 * 한 종목·하루의 돌파 사슬. `baselinePct` = 기준선의 % (분봉 % 와 **같은 식·같은 반올림** — 호출부 몫), 없으면 null.
 * `trace` 를 켜면 그림용 밴드 궤적을 함께 낸다(격자 패널 전용 — 셀 평가는 끈다).
 */
export function breakoutChainsOf(
    s: ChainSeries,
    baselinePct: number | null,
    k: BreakoutChainKnobs,
    opts: { trace?: boolean } = {},
): BreakoutChainResult {
    const n = s.minuteHigh.length;
    const band = k.bandPct / 100;
    const pull = 1 - k.zigzagPct / 100;
    const trace: BandTrace | undefined = opts.trace ? { top: [], bottom: [], baseBottom: [] } : undefined;

    // 러닝 최고가 밴드 — 첫 거래 봉 전엔 없다.
    let top: number | null = null;
    let bottom = Infinity;
    // 기준선 밴드 — 상단 B 고정, 하단은 좁아지기만, 고가 ≥ B 인 첫 봉에서 소멸.
    const B = baselinePct === null ? null : lv(baselinePct);
    let baseAlive = B !== null;
    let baseBottom = B === null ? Infinity : B * (1 - band);

    const candidates: BreakoutCandidate[] = [];
    const chains: BreakoutChainSpan[] = [];
    let cur: { span: BreakoutChainSpan; high: number; ladder: number; label: BreakoutLabel; seq: number } | null = null;

    for (let i = 0; i < n; i++) {
        const tv = s.cumAmount[i] - (i > 0 ? s.cumAmount[i - 1] : 0);
        if (tv > 0) {
            const h = lv(s.minuteHigh[i]);
            const l = lv(s.minuteLow[i]);

            // ── 러닝 최고가 밴드: (3) 상단 터치·돌파 → 재설정 / (2) 하단 터치·돌파 → 좁힘 / (1) 무사건.
            let evRun = false;
            if (top === null || ge(h, top)) {
                top = top === null ? h : Math.max(top, h);
                bottom = top * (1 - band);
                evRun = true;
            } else if (ge(h, bottom)) {
                bottom = Math.max(bottom, h);
                evRun = true;
            }

            // ── 기준선 밴드: 통째로 위(갭)면 사건 없이 소멸 / 상단 터치·돌파는 사건이자 소멸 / 하단은 좁힘.
            let evBase = false;
            if (baseAlive && B !== null) {
                if (gt(l, B)) {
                    baseAlive = false;
                } else if (ge(h, B)) {
                    evBase = true;
                    baseAlive = false;
                } else if (ge(h, baseBottom)) {
                    baseBottom = Math.max(baseBottom, h);
                    evBase = true;
                }
            }

            // ── 사슬. 새 고가면 고점 갱신(그 봉은 끝 검사 없음), 아니면 눌림 검사.
            let ended = false;
            if (cur !== null) {
                if (gt(h, cur.high)) {
                    cur.high = h;
                } else if (le(l, cur.high * pull)) {
                    cur.span.end = i;
                    cur.span.high = pctOf(cur.high);
                    cur = null;
                    ended = true;
                }
            }
            if (cur !== null) {
                if (evBase && cur.label === "high") {
                    cur.label = "baseline"; // 도중 합류 — 이 봉부터 사슬 끝까지
                    cur.span.baselineFrom = i;
                }
                if (tv >= cur.ladder) {
                    cur.ladder = tv;
                    cur.seq += 1;
                    candidates.push({ i, tv, chain: chains.length - 1, seq: cur.seq, label: cur.label });
                }
            } else if (!ended && (evRun || evBase)) {
                // 한 봉이 두 밴드 사건이면 기준선이 이긴다(더 좁은 뜻).
                const label: BreakoutLabel = evBase ? "baseline" : "high";
                const span: BreakoutChainSpan = { start: i, end: null, high: pctOf(h), baselineFrom: evBase ? i : null };
                chains.push(span);
                cur = { span, high: h, ladder: tv, label, seq: 0 };
                candidates.push({ i, tv, chain: chains.length - 1, seq: 0, label });
            }
        }
        if (trace) {
            trace.top.push(top === null ? null : pctOf(top));
            trace.bottom.push(top === null ? null : pctOf(bottom));
            trace.baseBottom.push(baseAlive ? pctOf(baseBottom) : null);
        }
    }
    if (cur !== null) cur.span.high = pctOf(cur.high);
    return { candidates, chains, ...(trace ? { trace } : {}) };
}

/**
 * 기준선 가격 → 분봉과 **같은 식·같은 반올림**의 % (`deriveMinutes` 의 `pct`). 기준가가 없으면 null.
 * 반올림이 다르면 기준선과 같은 가격의 봉이 "터치"로 안 잡힌다.
 */
export function baselinePctOf(baseline: number | null, basePrice: number | null): number | null {
    if (baseline === null || basePrice === null || basePrice === 0) return null;
    return Math.round(((baseline - basePrice) / basePrice) * 100 * 100) / 100;
}
