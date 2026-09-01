// core/market/domain/grid — 자동 타점 격자 검출(순수, I/O 0). 규칙 전문: .claude/decisions.md "자동 타점 격자" 절.
//
// 격자 = 앵커 차트(종목,날짜) 하나의 분봉을 "읽기 층이 Point 의미론을 자유 조절할 수 있는 최소 압축물"로
// 구운 것: ① 피벗(확정 고점 + 구간 저점, leg·갱신 누적 대금) ② floor 이상 대금의 신고가 캔들 목록
// ③ 기준선 첫 터치. Point 판정·게이트(50억/30억)·제외 창·축약 병합은 여기 없다 — points.ts(읽기 층)가
// 격자만 보고 계산한다. 굽는 값은 전부 "하한(격자)"이고 읽기 층은 위로만 조인다.
//
// 반면 **세션 창·신고가 기준은 읽기 층이 못 되돌리는 상태값**이라 검출기가 진다(2026-08-30 사용자 확정):
//  · 세션 창 = [08:00, 20:00] — NXT 프리·애프터마켓을 정규장과 동일 취급(2026-08-31 사용자 확정).
//    러닝 최고가가 상태값이라 창 밖 체결 하나가 그날 신고가 캔들 목록을 통째로 바꾼다 —
//    창을 바꾸면 격자 version 상향.
//  · 신고가 = 세션 창 안 **당일 러닝 최고가** 갱신. 마디 기준 재단은 읽기 층이 피벗으로 할 수 있지만 역은 불가.
//
// 가격 둘(기준선 base·그날 기준가 prevBase)은 호출자가 확정·환산해 넘긴다(기준선은 resolveBaselines
// 승자를 rawScaleOf 로 **그 날 원주가 스케일**로 되돌린 값) — 기준선은 수정주가 자, 분봉은 원주가 자다.
// 여기서 섞으면 감자·액분 종목의 터치가 통째로 틀어진다. prevBase 는 검출에 안 쓰이는 통과 사실이다.
import type { MinuteCandle } from "../candle/model.js";
import { densifyMinutes } from "../candle/minuteBackfill.js";
import { computeMinuteTradingAmount } from "../candle/price.js";

/** 피벗 — 확정 고점 또는 구간 저점(2026-08-31 재정식화, 정의는 detectGrid 본문 주석). 시각은 KST 자정기준 분(int). */
export interface GridPivot {
    kind: "high" | "low";
    /** 극값 발생 시각(분). */
    min: number;
    /** 극값(그 날 원주가, 원). */
    price: number;
    /** 고점: −zigzagPct 터치로 소급 확정된 봉 시각 — 항상 존재(미확정 고점은 안 싣는다, outcome 시뮬
     *  진입선의 장래 소비처). 저점: null 고정(확정 개념 없음 — 저점 확정은 소비처 0 실측). */
    confirmedMin: number | null;
    /** 직전 피벗 다음 봉부터 이 피벗 봉까지(포함) 누적 거래대금(원, 무손실 string). 첫 피벗은 세션 첫 봉부터,
     *  마지막 저점 이후 잔여는 어디에도 안 실린다(소비자 0). */
    legAmount: string;
    /** 고점 전용 — 직전 확정 고점 가격을 처음 넘은 봉(strict >, 포함)부터 이 고점 봉까지 누적 대금
     *  ("전고점 돌파 후 실린 추격 대금"). 갱신 경계는 순수 가격 사건(볼륨 무관). 첫 확정 고점(전고점 없음)과
     *  저점은 null — 기준선 크로싱으로 대체하지 않는다(결손은 결손). 불변식: 0 < renewalAmount ≤ legAmount.
     *  저점→갱신 전 눌림 조각은 legAmount − renewalAmount 파생(별도 저장 없음). */
    renewalAmount: string | null;
}

/** 신고가 캔들 — 세션 창 안 당일 러닝 최고가를 갱신했고 tv ≥ floor 인 봉. Point 후보의 전체 모집합.
 *  OHLC 를 절대가(그 날 원주가, 원)로 완결 수록한다 — %(몸통·꼬리·종가위치)는 분모 선택이 정책이라
 *  굽지 않고 전부 읽기 층 파생(양봉 여부도 close > open 파생 — bullOnly 노브가 읽는다). */
export interface GridNewHigh {
    /** 시각(분). */
    min: number;
    /** 그 봉 시가(원주가, 원). */
    open: number;
    /** 그 봉 고가 = 갱신된 러닝 최고가(원주가, 원). */
    high: number;
    /** 그 봉 저가(원주가, 원). */
    low: number;
    /** 그 봉 종가(원주가, 원). */
    close: number;
    /** 그 봉 거래대금(원, string) — 수록·게이트 기준 모두 자기 봉 대금(직전 봉 max 구제는 2026-08-31 폐기). */
    tv: string;
}

/**
 * 그 하루의 가격 사실 둘 — 검출기가 계산할 수 없어 호출자가 넘긴다(둘 다 그 날 원주가 스케일).
 * **이름을 헷갈리지 말 것**: `base` 는 사람이 그은 기준선(앵커 파생), `prevBase` 는 전일 종가다.
 */
export interface GridDayPrices {
    /** 확정 기준선 가격. 못 구하면 null(터치·기준선 파생 불가). */
    base: number | null;
    /** 그날 기준가 = 이벤트 보정 전일 종가(UN, `basePricesOf`). 못 구하면 null — 폴백은 없다. */
    prevBase: number | null;
}

/** 자동 타점 격자 — 앵커 차트(종목,날짜) 하나의 압축물. 직렬화 그대로 파일 캐시에 실린다. */
export interface PointGrid {
    /** 확정 기준선 가격(그 날 원주가 스케일, 원). 호출자가 못 넘기면 null(터치·기준선 파생 불가). */
    base: number | null;
    /** 기준선 첫 터치(고가 ≥ base) 시각(분). 볼륨 무관 — floor 에 걸러질 수 있어 명시 저장. 미터치면 null. */
    touchMin: number | null;
    /** 피벗(시간 오름차순). 구조 불변식: 항상 high 로 시작해 low 로 끝나는 교대·짝수 길이
     *  (확정 고점 뒤엔 터치 봉이 반드시 있어 구간 저점이 절대 결손 안 남). 확정 고점 0개인 날은 빈 배열(무사건 — 정상). */
    pivots: GridPivot[];
    /** 신고가 캔들 목록(시간 오름차순). */
    newHighs: GridNewHigh[];
    /**
     * 그날 기준가(이벤트 보정 전일 종가, UN — 그 날 원주가 스케일). 없으면 null = **결손**이고
     * 폴백(당일 첫 시가)은 두지 않는다: 격자엔 세션 첫 봉이 없고, 지어내지 않는 게 원칙이다.
     * 검출에는 안 쓰인다 — "당일 %" 를 클라가 격자만으로 파생하게 하는 재료다(축 공급자 재배치).
     */
    prevBase: number | null;
}

/** 검출기 파라미터 — 전부 격자에 구워진다(바꾸면 version 상향 + 재계산). */
export interface GridDetectOptions {
    /** zigzag 확정 임계(%). 기본 2 — 이보다 잔 구조는 격자에 없다(하한). */
    zigzagPct?: number;
    /** 신고가 목록 수록 하한(억원). 기본 20 — 읽기 층 게이트(50/30억)는 이 위에서만 조절 가능. */
    floorEok?: number;
    /** 세션 창 시작(자정기준 분, 이상). 기본 480 = 08:00(프리마켓 포함). */
    sessionStartMin?: number;
    /** 세션 창 끝(자정기준 분, 이하). 기본 1200 = 20:00(NXT 애프터마켓 포함). */
    sessionEndMin?: number;
}

export const DEFAULT_GRID_OPTIONS: Required<GridDetectOptions> = {
    zigzagPct: 2,
    floorEok: 20,
    sessionStartMin: 8 * 60,
    sessionEndMin: 20 * 60,
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
 * 격자 검출. 입력은 그 종목·그 날의 raw 분봉(존재하는 봉만, 시간 오름차순) — dense 화는 여기서 하고,
 * 봉 우주는 **dense 분봉**이다(호출측마다 갈리지 않게 한 곳에 고정). 채움봉(거래량 0·직전 종가 평탄)은
 * 신고가·legAmount 에 영향 없지만 **피벗에는 참여한다** — 저가(=직전 종가)가 "그 분의 서 있던 가격"으로서
 * 터치 확정·구간 최저가 될 수 있다(거래 없음 ≠ 가격 없음. 넓은 봉 다음 빈 분이 그 종가로 확정하는 케이스).
 * 분봉이 없거나 세션 창에 한 봉도 없으면 null(재료 없음 — 캐시 층이 "무사건 격자"와 구분해 안 굽는다).
 */
export function detectGrid(
    rawMinutes: MinuteCandle[],
    prices: GridDayPrices,
    options: GridDetectOptions = {},
): PointGrid | null {
    const { base, prevBase } = prices;
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

    // ── 피벗: 확정 고점 + 구간 저점 ──────────────────────────────────────────
    // 상태기계 없음 — 정의를 그대로 계산한다(2026-08-31 재정식화, decisions.md "자동 타점 격자" 절):
    //  · 확정 고점 = 세션 러닝 최고가를 갱신한 봉(strict >) 중, **더 높은 고가가 나오기 전에** 뒤 봉의
    //    저가가 그 고가 대비 −zigzagPct(≤) 내려간 것. confirmedMin = 그 터치 봉 시각.
    //    같은 봉에 터치와 상향 갱신이 동시면 **갱신이 이긴다**(확정 아님 — 봉 내부 순서 증명 불가):
    //    아래 루프의 "초과 검사 먼저 → continue" 순서가 이 규칙의 실현이다. 자기 봉 확정 금지도
    //    같은 continue 가 내장한다. 갱신 전 터치가 없어 소멸한 고점(미확정 꼬리 포함)은 싣지 않는다.
    //  · 저점 = (확정 고점 봉, 그 고점 가격의 크로싱 봉) **열린 구간**의 봉 최저 1개 — 크로싱이 끝내
    //    없으면(꼬리) ~세션 마지막 봉까지. 동가 tie 는 이른 봉. 양끝이 열려 있어 고점 봉·크로싱 봉의
    //    저가는 자연히 빠진다(봉 내부 순서 증명 불가). 첫 확정 고점 이전 선행 저점은 없다.
    //    ⚠ "인접 확정 고점 사이 최저" 단축은 동치가 아니다 — 크로싱 뒤 넓은 갱신 봉(깊은 저가+새 고가,
    //    갱신 승리로 터치 생략)이 최저를 차지하면 저점이 크로싱 뒤로 가 renewal ≤ leg 가 깨진다(실측 1건).
    //  구조 불변식(정의에서 따라 나옴): 확정 고점의 터치 봉은 크로싱 봉보다 앞이므로(터치 저가 ≤
    //  0.98×고점인데 크로싱 이후는 확정 아니면 갱신뿐) 구간 저점 후보가 절대 비지 않는다 → 피벗은 항상
    //  high 시작·low 끝·교대·짝수 길이, 구간 저점 봉 < 크로싱 봉 → 0 < renewalAmount ≤ legAmount.
    const down = 1 - o.zigzagPct / 100;
    const confirmedHighs: { idx: number; confirmIdx: number; crossIdx: number }[] = [];
    let sessMax = -Infinity;
    let candIdx = -1; // 현재 러닝 최고가 봉(확정 대기). -1 = 확정 직후(다음 갱신 대기)
    let crossIdx = -1; // 직전 확정 고점 가격을 처음 넘은 봉(이 구간의 갱신 봉). 첫 구간은 세션 첫 봉
    for (let i = 0; i < n; i++) {
        if (highs[i] > sessMax) {
            if (crossIdx < 0) crossIdx = i;
            sessMax = highs[i];
            candIdx = i;
            continue; // 갱신 승리 — 이 봉의 터치는 검사하지 않는다
        }
        if (candIdx >= 0 && lows[i] <= highs[candIdx] * down) {
            confirmedHighs.push({ idx: candIdx, confirmIdx: i, crossIdx });
            candIdx = -1;
            crossIdx = -1;
        }
    }
    const tailCrossIdx = crossIdx; // 마지막 확정 고점 뒤의 크로싱 봉(소멸 후보의 것) — 꼬리 저점 후보 제외용

    const pivots: GridPivot[] = [];
    let prevKeptIdx = -1;
    for (let k = 0; k < confirmedHighs.length; k++) {
        const h = confirmedHighs[k];
        pivots.push({
            kind: "high",
            min: mins[h.idx],
            price: highs[h.idx],
            confirmedMin: mins[h.confirmIdx],
            legAmount: legAmount(prevKeptIdx, h.idx),
            // 첫 확정 고점은 전고점이 없어 null(crossIdx 는 세션 첫 봉일 뿐 크로싱 사건이 아니다).
            renewalAmount: k === 0 ? null : legAmount(h.crossIdx - 1, h.idx),
        });
        prevKeptIdx = h.idx;

        // 저점 구간 = (이 고점 봉, 이 고점 가격의 크로싱 봉) — 다음 확정 고점의 crossIdx 가 곧 그 크로싱.
        // 꼬리에서 크로싱이 있었다면(소멸 후보) 거기서 끝, 없었으면 세션 끝까지.
        const crossEnd = k + 1 < confirmedHighs.length ? confirmedHighs[k + 1].crossIdx : tailCrossIdx >= 0 ? tailCrossIdx : n;
        let lowIdx = -1;
        for (let j = h.idx + 1; j < crossEnd; j++) {
            if (lowIdx < 0 || lows[j] < lows[lowIdx]) lowIdx = j;
        }
        // 불변식 위반은 침묵 오염 대신 즉사 — 터치 봉이 항상 후보라 도달 불가(위 구조 불변식 주석).
        if (lowIdx < 0) throw new Error(`detectGrid: 구간 저점 결손(고점 min=${mins[h.idx]}) — 정의 불변식 위반`);
        pivots.push({
            kind: "low",
            min: mins[lowIdx],
            price: lows[lowIdx],
            confirmedMin: null,
            legAmount: legAmount(prevKeptIdx, lowIdx),
            renewalAmount: null,
        });
        prevKeptIdx = lowIdx;
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
        if (tvs[i] < floorWon) continue;
        newHighs.push({
            min: mins[i],
            open: Number(bars[i].un.open),
            high: highs[i],
            low: lows[i],
            close: Number(bars[i].un.close),
            tv: tvs[i].toString(),
        });
    }

    return { base, touchMin, pivots, newHighs, prevBase };
}
