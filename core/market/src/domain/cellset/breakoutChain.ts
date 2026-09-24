// 돌파 사슬 — Daily 타점 생성기(2026-09-24). 규칙 전문은 .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// 한 종목·하루의 dense 분봉을 한 번 훑어 **두 밴드 상태기계**(러닝 최고가 밴드·기준선 밴드)와 **돌파 사슬**을
// 세우고, 사슬 안의 거래 봉을 **전부** 기록한다(`bars`). 후보는 그 위에 거는 **사슬 필터**(봉 조건 → 순번)가
// 고른다(`chainVerdicts`). 격자·접기를 쓰지 않는다 — 사슬 안 봉은 사건 봉이 아니어도 후보가 될 수 있으므로
// 모든 분봉이 필요하고, 그건 분봉 순회에만 있다.
//
// ## 값 공간 — % 를 가격 비로
// 입력은 `/day-replay` 의 % 시계열(기준가 대비, 소수 2자리)이다. 비교는 전부 **가격 비**(1 + %/100)로 한다 —
// 밴드 하단 M×(1−b)·눌림 H×(1−z) 는 % 차가 아니라 가격 비율이다. 0.01% 반올림은 호가 한 틱(≥ ~0.05%)보다
// 작아 같은 가격은 같은 값·다른 가격은 다른 값이 된다. 반올림끼리 겹친 오차(≤ 1e-4)를 `EPS` 로 흡수해
// "터치(같은 가격)"를 정확히 잡는다 — 한 틱 아래(≥ 5e-4)는 여전히 못 넘는다.
//
// ## 필터는 구조를 안 바꾼다
// 밴드·사슬은 **모든 거래 봉**으로 선다. 사슬 필터는 사슬을 안 바꾸고 사슬 봉 중에서 고르기만 한다(순번은
// 필터를 통과한 봉끼리 센다). 생성소의 일반 필터(양봉·시간대 …)는 그 뒤의 AND 라 순번 셈에 안 든다.
// 거래 없는 봉(분 대금 0 — dense 채움봉)은 아무것도 아니다: 사건도 밴드 갱신도 사슬 끝도 사슬 봉도
// 아니다(거래 없음은 가격 사건이 아니다).

/** 입력 — `/day-replay` MinuteDerived 에서 쓰는 필드만(와이어 종목이 그대로 들어온다). */
export interface ChainSeries {
    /** 분봉 시가 %(사슬 필터의 시가→고가·시가→종가). */
    minuteOpen: readonly number[];
    minuteHigh: readonly number[];
    minuteLow: readonly number[];
    /** 분봉 종가 %. */
    rate: readonly number[];
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
/** 이름표 거르기 — 봉 조건의 하나(순번 셈 앞). */
export type BreakoutLabelFilter = "all" | BreakoutLabel;

/** 사슬 안 거래 봉 하나 — 사슬 필터가 보는 값은 전부 **그 봉까지의 값**이다(미래 누출 없음). */
export interface ChainBar {
    /** 시계열 인덱스. */
    i: number;
    /** 그 봉 대금(원). */
    tv: number;
    /** 사슬 번호(그날 0부터). */
    chain: number;
    /** 사슬 안 거래 봉 순번 — 0 = 사슬 첫 봉(사건 봉). */
    pos: number;
    /** 그 봉 시점의 이름표(도중 합류면 합류 봉부터 「기준선」). */
    label: BreakoutLabel;
    /** 그 봉 고가 ≥ 직전까지 세션 최고가(터치 포함 — 러닝 밴드 (3)과 같은 자). 그날 첫 거래 봉은 참. */
    sessionHigh: boolean;
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
    /** 사슬 안 거래 봉 전부(시계열 순). */
    bars: ChainBar[];
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
    s: Pick<ChainSeries, "minuteHigh" | "minuteLow" | "cumAmount">,
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

    const bars: ChainBar[] = [];
    const chains: BreakoutChainSpan[] = [];
    let cur: { span: BreakoutChainSpan; high: number; label: BreakoutLabel; pos: number } | null = null;

    for (let i = 0; i < n; i++) {
        const tv = s.cumAmount[i] - (i > 0 ? s.cumAmount[i - 1] : 0);
        if (tv > 0) {
            const h = lv(s.minuteHigh[i]);
            const l = lv(s.minuteLow[i]);

            // ── 러닝 최고가 밴드: (3) 상단 터치·돌파 → 재설정 / (2) 하단 터치·돌파 → 좁힘 / (1) 무사건.
            let evRun = false;
            const sessionHigh = top === null || ge(h, top);
            if (sessionHigh) {
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
                cur.pos += 1;
                bars.push({ i, tv, chain: chains.length - 1, pos: cur.pos, label: cur.label, sessionHigh });
            } else if (!ended && (evRun || evBase)) {
                // 한 봉이 두 밴드 사건이면 기준선이 이긴다(더 좁은 뜻).
                const label: BreakoutLabel = evBase ? "baseline" : "high";
                const span: BreakoutChainSpan = { start: i, end: null, high: pctOf(h), baselineFrom: evBase ? i : null };
                chains.push(span);
                cur = { span, high: h, label, pos: 0 };
                bars.push({ i, tv, chain: chains.length - 1, pos: 0, label, sessionHigh });
            }
        }
        if (trace) {
            trace.top.push(top === null ? null : pctOf(top));
            trace.bottom.push(top === null ? null : pctOf(bottom));
            trace.baseBottom.push(baseAlive ? pctOf(baseBottom) : null);
        }
    }
    if (cur !== null) cur.span.high = pctOf(cur.high);
    return { bars, chains, ...(trace ? { trace } : {}) };
}

/**
 * 기준선 가격 → 분봉과 **같은 식·같은 반올림**의 % (`deriveMinutes` 의 `pct`). 기준가가 없으면 null.
 * 반올림이 다르면 기준선과 같은 가격의 봉이 "터치"로 안 잡힌다.
 */
export function baselinePctOf(baseline: number | null, basePrice: number | null): number | null {
    if (baseline === null || basePrice === null || basePrice === 0) return null;
    return Math.round(((baseline - basePrice) / basePrice) * 100 * 100) / 100;
}

/**
 * 한 종목 — 기준선 **가격**을 받아 분봉과 같은 % 로 옮겨 사슬을 세운다. 셀 엔진과 격자판이 **같은 이 함수**를
 * 쓴다(기준선 변환을 손으로 다시 쓰면 같은 화면에 숫자가 둘이 된다).
 */
export function breakoutOfStock(
    s: ChainSeries & { basePrice: { un: number | null } },
    baseline: number | null,
    k: BreakoutChainKnobs,
    opts: { trace?: boolean } = {},
): BreakoutChainResult & { baselinePct: number | null } {
    const baselinePct = baselinePctOf(baseline, s.basePrice.un);
    return { ...breakoutChainsOf(s, baselinePct, k, opts), baselinePct };
}

// ── 사슬 필터 ───────────────────────────────────────────────────────────────

/** 양끝 포함 구간 — 한쪽이 없으면 반열림. */
export interface ChainRange {
    min?: number;
    max?: number;
}

/**
 * 사슬 필터 = 봉 조건 + 순번(decisions 「Daily 타점 생성 = 돌파 사슬」). 없는 봉 조건은 무관. 이름표는
 * 술어의 `label` 이 들고 여기선 봉 조건으로 함께 건다(순번 셈 앞).
 */
export interface ChainFilter {
    /** 사슬 안 봉 순번 범위(봉 수, 첫 봉 = 0). */
    pos?: ChainRange;
    /** 봉 대금 ≥ N억. */
    amountEok?: number;
    /** 시가→고가 % 범위(가격 비). */
    openHigh?: ChainRange;
    /** 시가→종가 % 범위(가격 비 — 양봉 = 0 초과). */
    openClose?: ChainRange;
    /** 세션 고가 돌파 — 없으면 무관. */
    sessionHigh?: "yes" | "no";
    /** 봉 조건 통과 봉 중 사슬 안 처음 K개 — null = 전부. */
    firstK: number | null;
}

/** 기본 = 사슬마다 첫 봉(옛 저장물도 이 값으로 읽는다 — 전부로 읽으면 하루 수만 봉이 쏟아진다). */
export const DEFAULT_CHAIN_FILTER: ChainFilter = { firstK: 1 };
export const CHAIN_FIRST_K_MAX = 999;

/** 봉 조건 하나의 이름 — 레인 한 줄 = 조건 하나. 순서 = 판정·표시 순. */
export const CHAIN_CHECKS = ["pos", "amount", "openHigh", "openClose", "sessionHigh", "label"] as const;
export type ChainCheck = (typeof CHAIN_CHECKS)[number];

/** 이 필터에 걸린 봉 조건들(이름표는 "all" 이 아닐 때) — 레인 줄 목록. */
export function activeChecksOf(f: ChainFilter, label: BreakoutLabelFilter): ChainCheck[] {
    return CHAIN_CHECKS.filter((c) => {
        switch (c) {
            case "pos":
                return f.pos !== undefined;
            case "amount":
                return f.amountEok !== undefined;
            case "openHigh":
                return f.openHigh !== undefined;
            case "openClose":
                return f.openClose !== undefined;
            case "sessionHigh":
                return f.sessionHigh !== undefined;
            case "label":
                return label !== "all";
        }
    });
}

/** 사슬 봉 하나의 판정 — 떨어진 봉 조건들 · 순번(통과 봉만) · 최종 후보 여부. */
export interface ChainVerdict {
    bar: ChainBar;
    failed: ChainCheck[];
    /** 봉 조건을 다 통과한 봉 중 사슬 안 순서(0부터) — 떨어졌으면 null. */
    rank: number | null;
    picked: boolean;
}

const inRange = (v: number, r: ChainRange | undefined): boolean =>
    r === undefined || ((r.min === undefined || v >= r.min - 1e-9) && (r.max === undefined || v <= r.max + 1e-9));
/** a% → b% 의 가격 비 변화(%) — 둘 다 기준가 대비 % 라 차가 아니라 비로 잰다. */
export const movePct = (a: number, b: number): number => (lv(b) / lv(a) - 1) * 100;

/** 봉 하나가 떨어진 봉 조건들(순서 = `CHAIN_CHECKS`). */
export function failedChecksOf(b: ChainBar, s: ChainSeries, f: ChainFilter, label: BreakoutLabelFilter): ChainCheck[] {
    const out: ChainCheck[] = [];
    if (!inRange(b.pos, f.pos)) out.push("pos");
    if (f.amountEok !== undefined && b.tv < f.amountEok * 1e8) out.push("amount");
    const o = s.minuteOpen[b.i];
    if (f.openHigh !== undefined && !inRange(movePct(o, s.minuteHigh[b.i]), f.openHigh)) out.push("openHigh");
    if (f.openClose !== undefined && !inRange(movePct(o, s.rate[b.i]), f.openClose)) out.push("openClose");
    if (f.sessionHigh !== undefined && b.sessionHigh !== (f.sessionHigh === "yes")) out.push("sessionHigh");
    if (label !== "all" && b.label !== label) out.push("label");
    return out;
}

/** 사슬 봉 전부의 판정 — 순번은 사슬마다 새로 센다. 격자판(레인·설명)과 셀 엔진(picked)이 같은 이 함수를 쓴다. */
export function chainVerdicts(
    bars: readonly ChainBar[],
    s: ChainSeries,
    f: ChainFilter,
    label: BreakoutLabelFilter,
): ChainVerdict[] {
    const out: ChainVerdict[] = [];
    let chain = -1;
    let rank = 0;
    for (const bar of bars) {
        if (bar.chain !== chain) {
            chain = bar.chain;
            rank = 0;
        }
        const failed = failedChecksOf(bar, s, f, label);
        const r = failed.length === 0 ? rank++ : null;
        out.push({ bar, failed, rank: r, picked: r !== null && (f.firstK === null || r < f.firstK) });
    }
    return out;
}

/** 후보(최종 통과 봉)만. */
export function chainCandidatesOf(bars: readonly ChainBar[], s: ChainSeries, f: ChainFilter, label: BreakoutLabelFilter): ChainBar[] {
    const out: ChainBar[] = [];
    for (const v of chainVerdicts(bars, s, f, label)) if (v.picked) out.push(v.bar);
    return out;
}
