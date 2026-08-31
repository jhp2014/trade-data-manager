// core/market/domain/grid — 자동 타점 격자 검출(순수, I/O 0). 규칙 전문: .claude/decisions.md "자동 타점 격자" 절.
//
// 격자 = 앵커 차트(종목,날짜) 하나의 분봉을 "읽기 층이 Point 의미론을 자유 조절할 수 있는 최소 압축물"로
// 구운 것: ① zigzag 피벗(가격 구조 + leg 누적 거래대금) ② floor 이상 대금의 신고가 캔들 목록
// ③ 기준선 첫 터치. Point 판정·게이트(50억/30억)·제외 창·축약 병합은 여기 없다 — points.ts(읽기 층)가
// 격자만 보고 계산한다. 굽는 값은 전부 "하한(격자)"이고 읽기 층은 위로만 조인다.
//
// 반면 **세션 창·신고가 기준은 읽기 층이 못 되돌리는 상태값**이라 검출기가 진다(2026-08-30 사용자 확정):
//  · 세션 창 = [08:00, 15:30] — NXT 프리마켓 포함, 시간외 제외. 러닝 최고가가 상태값이라
//    창 밖 체결 하나가 그날 신고가 캔들 목록을 통째로 바꾼다 — 창을 바꾸면 격자 version 상향.
//  · 신고가 = 세션 창 안 **당일 러닝 최고가** 갱신. 마디 기준 재단은 읽기 층이 피벗으로 할 수 있지만 역은 불가.
//
// 기준선(base)은 호출자가 확정·환산해 넘긴다(resolveBaselines 승자를 rawScaleOf 로 **그 날 원주가 스케일**로
// 되돌린 값) — 기준선은 수정주가 자, 분봉은 원주가 자다. 여기서 섞으면 감자·액분 종목의 터치가 통째로 틀어진다.
import type { MinuteCandle } from "../candle/model.js";
import { densifyMinutes } from "../candle/minuteBackfill.js";
import { computeMinuteTradingAmount } from "../candle/price.js";

/** zigzag 피벗 — 마디 고점/저점. 시각은 KST 자정기준 분(int). */
export interface GridPivot {
    kind: "high" | "low";
    /** 극값 발생 시각(분). */
    min: number;
    /** 극값(그 날 원주가, 원). */
    price: number;
    /** 반대 방향 임계 도달로 소급 확정된 시각(분). 장 끝까지 미확정(마지막 마디)이면 null — 읽기 층이 판단. */
    confirmedMin: number | null;
    /** 직전 피벗 다음 봉부터 이 피벗 봉까지 leg 누적 거래대금(원, 무손실 string). */
    legAmount: string;
}

/** 신고가 캔들 — 세션 창 안 당일 러닝 최고가를 갱신했고 tvMax2 ≥ floor 인 봉. Point 후보의 전체 모집합. */
export interface GridNewHigh {
    /** 시각(분). */
    min: number;
    /** 그 봉 고가 = 갱신된 러닝 최고가(원주가, 원). */
    high: number;
    /** 그 봉 거래대금(원, string). */
    tv: string;
    /** max(직전 dense 봉, 현재 봉) 거래대금 — VI 로 대금이 직전 봉에 쏠린 경우 구제(원, string). */
    tvMax2: string;
    /** 양봉(종가 > 시가). Point 자격 조건이지만 판정은 읽기 층 — 격자는 사실만 싣는다. */
    bull: boolean;
}

/** 자동 타점 격자 — 앵커 차트(종목,날짜) 하나의 압축물. 직렬화 그대로 파일 캐시에 실린다. */
export interface PointGrid {
    /** 확정 기준선 가격(그 날 원주가 스케일, 원). 호출자가 못 넘기면 null(터치·기준선 파생 불가). */
    base: number | null;
    /** 기준선 첫 터치(고가 ≥ base) 시각(분). 볼륨 무관 — floor 에 걸러질 수 있어 명시 저장. 미터치면 null. */
    touchMin: number | null;
    /** zigzag 피벗(시간 오름차순, high/low 교대). 임계 미달의 잔잔한 날은 빈 배열(무사건 격자 — 정상). */
    pivots: GridPivot[];
    /** 신고가 캔들 목록(시간 오름차순). */
    newHighs: GridNewHigh[];
}

/** 검출기 파라미터 — 전부 격자에 구워진다(바꾸면 version 상향 + 재계산). */
export interface GridDetectOptions {
    /** zigzag 확정 임계(%). 기본 2 — 이보다 잔 구조는 격자에 없다(하한). */
    zigzagPct?: number;
    /** 신고가 목록 수록 하한(억원). 기본 20 — 읽기 층 게이트(50/30억)는 이 위에서만 조절 가능. */
    floorEok?: number;
    /** 세션 창 시작(자정기준 분, 이상). 기본 480 = 08:00(프리마켓 포함). */
    sessionStartMin?: number;
    /** 세션 창 끝(자정기준 분, 이하). 기본 930 = 15:30(시간외 제외). */
    sessionEndMin?: number;
}

export const DEFAULT_GRID_OPTIONS: Required<GridDetectOptions> = {
    zigzagPct: 2,
    floorEok: 20,
    sessionStartMin: 8 * 60,
    sessionEndMin: 15 * 60 + 30,
};

const KRW_PER_EOK = 100_000_000n;

/**
 * "HH:MM[:SS]" → 자정기준 분. 분봉 초는 항상 00 이라 무손실(minuteBackfill 과 같은 해석).
 * 격자(분 int)와 앱의 시각 문자열(타점 자연키·차트 tradeTime)을 잇는 **유일한 자** — 짝은 minuteToHms.
 */
export const hmsToMinute = (time: string): number => {
    const [h, m] = time.split(":");
    return Number(h) * 60 + Number(m);
};

/** 자정기준 분 → "HH:MM:00" — 격자 시각을 타점 자연키·차트 시각 문자열로 되돌린다. hmsToMinute 의 짝. */
export const minuteToHms = (min: number): string => {
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${p(Math.floor(min / 60))}:${p(min % 60)}:00`;
};

const toMin = hmsToMinute;

/**
 * 격자 검출. 입력은 그 종목·그 날의 raw 분봉(존재하는 봉만, 시간 오름차순) — dense 화는 여기서 한다
 * (호출측에 맡기면 tvMax2 의 "직전 봉" 의미론이 조용히 갈린다: dense 라 VI·무거래 갭엔 거래량 0 평탄봉이
 * 들어가고, 그 직후 봉의 tvMax2 = 자기 자신이다. 의도된 규칙 — 테스트로 못 박음).
 * 분봉이 없거나 세션 창에 한 봉도 없으면 null(재료 없음 — 캐시 층이 "무사건 격자"와 구분해 안 굽는다).
 */
export function detectGrid(
    rawMinutes: MinuteCandle[],
    base: number | null,
    options: GridDetectOptions = {},
): PointGrid | null {
    const o = { ...DEFAULT_GRID_OPTIONS, ...options };
    // 창 필터를 densify **앞**에 둔다 — 뒤에 두면 창 밖 가격이 채움봉(직전 종가 평탄)으로 창 안에 새어들어
    // 러닝 최고가를 선점한다(프리마켓 배제 설정이 조용히 무력화되는 함정).
    const bars = densifyMinutes(
        rawMinutes.filter((m) => {
            const t = toMin(m.time);
            return t >= o.sessionStartMin && t <= o.sessionEndMin;
        }),
    );
    if (bars.length === 0) return null;

    const n = bars.length;
    const mins = new Array<number>(n);
    const highs = new Array<number>(n);
    const lows = new Array<number>(n);
    const tvs = new Array<bigint>(n);
    // prefix[i] = tvs[0..i] 누적(BigInt 무손실) — 피벗 확정이 소급이라 legAmount 는 구간차로 계산한다.
    const prefix = new Array<bigint>(n);
    let acc = 0n;
    for (let i = 0; i < n; i++) {
        const m = bars[i];
        mins[i] = toMin(m.time);
        highs[i] = Number(m.un.high);
        lows[i] = Number(m.un.low);
        tvs[i] = BigInt(computeMinuteTradingAmount(m.un));
        acc += tvs[i];
        prefix[i] = acc;
    }
    const legAmount = (fromIdxExclusive: number, toIdx: number): string =>
        (prefix[toIdx] - (fromIdxExclusive >= 0 ? prefix[fromIdxExclusive] : 0n)).toString();

    // ── zigzag ───────────────────────────────────────────────────────────────
    // 방향 미정 → 러닝 극값 둘을 추적하다 먼저 임계(≥)를 넘는 쪽이 선두 피벗을 확정한다.
    // 같은 봉이 극값 갱신과 반전 확정을 동시에 할 수 있다 — 규칙: **현 방향 극값을 먼저 갱신한 뒤**
    // 그 갱신된 극값 대비 반전을 검사한다(한 봉이 고점을 세우고 그 봉 저가로 확정하는 것 허용 — 결정적).
    const up = 1 + o.zigzagPct / 100;
    const down = 1 - o.zigzagPct / 100;
    const pivots: GridPivot[] = [];
    let lastPivotIdx = -1;
    let dir: -1 | 0 | 1 = 0;
    let extIdx = 0; // 현재 후보 극값의 봉 인덱스

    /** 피벗 확정 후 다음 후보 극값 초기화 — (피벗 봉..현재 봉]에서 반대 방향 극값을 다시 찾는다. */
    const rescanExtreme = (fromIdx: number, toIdx: number, want: "high" | "low"): number => {
        let best = fromIdx;
        for (let j = fromIdx + 1; j <= toIdx; j++) {
            if (want === "high" ? highs[j] > highs[best] : lows[j] < lows[best]) best = j;
        }
        return best;
    };
    const commit = (kind: "high" | "low", pivotIdx: number, confirmIdx: number): void => {
        pivots.push({
            kind,
            min: mins[pivotIdx],
            price: kind === "high" ? highs[pivotIdx] : lows[pivotIdx],
            confirmedMin: mins[confirmIdx],
            legAmount: legAmount(lastPivotIdx, pivotIdx),
        });
        lastPivotIdx = pivotIdx;
    };

    let candHiIdx = 0;
    let candLoIdx = 0;
    for (let i = 1; i < n; i++) {
        if (dir === 0) {
            if (highs[i] > highs[candHiIdx]) candHiIdx = i;
            if (lows[i] < lows[candLoIdx]) candLoIdx = i;
            const canUp = highs[i] >= lows[candLoIdx] * up;
            const canDown = lows[i] <= highs[candHiIdx] * down;
            if (canUp || canDown) {
                // 둘 다 성립(한 봉에 상하 ±임계)하면 **더 오래 서 있던 극값**이 선두 피벗이 된다 —
                // 두 극값이 같은 봉 출신이면 **확정 봉(bars[i])의 방향**으로 가른다(양봉 = 저점이 먼저).
                // 극값 봉이 아니라 확정 봉을 읽는 이유: 극값 봉은 방향이 갈린 원인이 아니라 그릇일 뿐이고,
                // 어느 쪽이 먼저였는지의 마지막 단서는 지금 봉의 종가 방향이다. 결정적 규칙.
                const goUp = canUp !== canDown ? canUp : candLoIdx !== candHiIdx ? candLoIdx < candHiIdx : Number(bars[i].un.close) > Number(bars[i].un.open);
                if (goUp) {
                    commit("low", candLoIdx, i);
                    dir = 1;
                    extIdx = rescanExtreme(candLoIdx, i, "high");
                } else {
                    commit("high", candHiIdx, i);
                    dir = -1;
                    extIdx = rescanExtreme(candHiIdx, i, "low");
                }
            }
        } else if (dir === 1) {
            if (highs[i] > highs[extIdx]) extIdx = i;
            if (lows[i] <= highs[extIdx] * down) {
                commit("high", extIdx, i);
                dir = -1;
                extIdx = rescanExtreme(extIdx, i, "low");
            }
        } else {
            if (lows[i] < lows[extIdx]) extIdx = i;
            if (highs[i] >= lows[extIdx] * up) {
                commit("low", extIdx, i);
                dir = 1;
                extIdx = rescanExtreme(extIdx, i, "high");
            }
        }
    }
    // 마지막 마디 — 장 끝까지 반대 임계가 안 와 미확정(confirmedMin null)으로 싣는다(읽기 층 판단).
    // 방향 미정(온종일 임계 미달)이면 피벗 0 — 무사건 격자. 마지막 확정이 장 마지막 봉에서 났으면
    // 되짚을 후보가 그 봉 자신뿐이라 꼬리를 안 만든다(같은 min 의 퇴화 피벗이 단조 증가 가정을 깬다).
    if (dir !== 0 && extIdx !== lastPivotIdx) {
        pivots.push({
            kind: dir === 1 ? "high" : "low",
            min: mins[extIdx],
            price: dir === 1 ? highs[extIdx] : lows[extIdx],
            confirmedMin: null,
            legAmount: legAmount(lastPivotIdx, extIdx),
        });
    }

    // ── 신고가 캔들 목록 + 기준선 첫 터치 ────────────────────────────────────
    const floorWon = BigInt(o.floorEok) * KRW_PER_EOK;
    const newHighs: GridNewHigh[] = [];
    let touchMin: number | null = null;
    let runningMax = -Infinity;
    for (let i = 0; i < n; i++) {
        if (base !== null && touchMin === null && highs[i] >= base) touchMin = mins[i];
        if (highs[i] <= runningMax) continue;
        runningMax = highs[i];
        const tvMax2 = i > 0 && tvs[i - 1] > tvs[i] ? tvs[i - 1] : tvs[i];
        if (tvMax2 < floorWon) continue;
        newHighs.push({
            min: mins[i],
            high: highs[i],
            tv: tvs[i].toString(),
            tvMax2: tvMax2.toString(),
            bull: Number(bars[i].un.close) > Number(bars[i].un.open),
        });
    }

    return { base, touchMin, pivots, newHighs };
}
