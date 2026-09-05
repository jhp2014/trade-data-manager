// core/market/domain/grid — 자동 타점 격자 검출(순수, I/O 0). 규칙 전문: .claude/decisions.md "자동 타점 격자" 절.
//
// 격자 = 앵커 차트(종목,날짜) 하나의 분봉을 "읽기 층이 Point 의미론을 자유 조절할 수 있는 최소 압축물"로
// 구운 것: **사건 봉의 목록 + 각 봉의 세션 누적 거래대금** — ① 피벗 = **양방향 zigzag 경로 뷰**(국소
// 고·저점 교대 열, 2026-09-05 v9 — 마디 뷰는 levelView.ts 읽기 파생, 레벨 고점엔 직전 레벨의 크로싱 봉)
// ② floor 이상 대금의 기준 밴드 사건 캔들 목록(newHighs) ③ 기준선 첫 터치 봉. 경로 뷰를 굽는 이유:
// 결과 트랙(익절/손절 레이스·고점 미달 반등·꼬리 고점)이 격자만으로 정확히 답해야 해서다 — 마디만 구우면
// 전고점 미달 반등이 격자에 없다. tie 규칙(§2.3, 피벗 루프 주석)은 정보 손실을 어디에 둘지의 선택 하나.
// 대금 **창**(leg·갱신·돌파·Point→고점)은 굽지 않는다 — 두 기록 봉의 누적 차로 읽기 층(windows.ts)이
// 낸다(2026-09-02, 옛 legAmount/renewalAmount 굽기를 뒤집음: 창을 굽으면 창 하나마다 재굽기가 따라온다).
// 누적 관례 = **그 봉 포함**. 자기 봉 tv 는 창의 시작이 될 수 있는 봉(크로싱·터치·신고가)만 든다.
// Point 판정·게이트(50억/30억)·제외 창·축약 병합은 여기 없다 — points.ts(읽기 층)가
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

/** 창의 **시작**이 될 수 있는 기록 봉 — 크로싱 봉·기준선 터치 봉. 시각 + 자기 봉 대금 + 세션 누적(그 봉 포함).
 *  포함 창 [이 봉 .. 끝 봉] = 끝.cum − cum + tv (windows.ts `amountFrom`). */
export interface GridBarMark {
    /** 시각(자정기준 분). */
    min: number;
    /** 자기 봉 거래대금(원, 무손실 string). */
    tv: string;
    /** 세션 첫 봉부터 이 봉까지(포함) 누적 거래대금(원, 무손실 string). */
    cum: string;
}

/** 피벗 — 양방향 zigzag 의 국소 극값(경로 뷰, 2026-09-05 v9 — 정의는 detectGrid 본문 주석). 시각은 KST 자정기준 분(int).
 *  세션 러닝 최고가 고점(마디·레벨)은 이 열의 부분집합이고, 마디 저점(레벨 구간 봉 최저)은 읽기 파생이다
 *  (levelView.ts `levelViewOf`) — 레벨 구조를 묻는 코드는 이 배열을 직접 순회하지 않는다. */
export interface GridPivot {
    kind: "high" | "low";
    /** 극값 발생 시각(분). */
    min: number;
    /** 극값(그 날 원주가, 원). */
    price: number;
    /** 확정 봉 시각(±zigzagPct 반대 방향 도달로 소급 확정) — 항상 극값 봉보다 뒤.
     *  null = **꼬리(미확정)** — 있다면 배열 마지막 1개뿐이다. ⚠ v8 의 "저점은 항상 null" 은 폐기 —
     *  저점도 확정 시각을 든다(v9 경로 뷰). */
    confirmedMin: number | null;
    /** 세션 첫 봉부터 이 피벗 봉까지(포함) 누적 거래대금(원, 무손실 string). 옛 legAmount 는
     *  `cum − 직전피벗.cum` 파생(windows.ts). 마지막 저점 이후 잔여는 어디에도 안 실린다(소비자 0). */
    cum: string;
    /** **레벨**(확정 고점 중 이전 모든 고점 피벗보다 가격이 큰 것, §2.5)인 고점에만 — 직전 레벨 가격을
     *  처음 넘은 봉(strict >, 순수 가격 사건·볼륨 무관)의 기록. 신고가 목록은 floor 로 걸러져 저대금
     *  크로싱 봉이 빠지므로 여기 승격 수록한다 — 재돌파 창(크로싱→고점)과 병합된 레벨의 크로싱 창,
     *  그리고 levelViewOf 의 저점 구간 경계가 이걸로 선다.
     *  첫 레벨·국소 고점·저점은 null — 기준선 터치로 대체하지 않는다(돌파 창은 `touch` 가 따로). */
    cross: GridBarMark | null;
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
    /** 세션 첫 봉부터 이 봉까지(포함) 누적 거래대금(원, string) — Point 봉→고점 창의 시작 재료. */
    cum: string;
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
    /** 그날 기준가의 KRX 짝(`basePricesOf(...).base.krx`) — "당일 %(KRX)" 특징의 분모. 못 구하면 null. */
    prevBaseKrx: number | null;
}

/** 자동 타점 격자 — 앵커 차트(종목,날짜) 하나의 압축물. 직렬화 그대로 파일 캐시에 실린다. */
export interface PointGrid {
    /** 확정 기준선 가격(그 날 원주가 스케일, 원). 호출자가 못 넘기면 null(터치·기준선 파생 불가). */
    base: number | null;
    /** 기준선 첫 터치(고가 ≥ base) 봉. 볼륨 무관 — floor 에 걸러질 수 있어 명시 저장. 미터치면 null.
     *  돌파 창(터치→고점)의 시작 봉이라 시각만이 아니라 대금·누적도 든다. */
    touch: GridBarMark | null;
    /** 피벗 = 경로 뷰(시간 강한 오름차순, kind 교대). 구조 불변식(v9): 첫 항목은 high/low 둘 다 가능
     *  (선행 저점 허용), 미확정(confirmedMin null)은 있다면 마지막 1개(꼬리). 확정 사건 0개인 날은
     *  빈 배열(무사건 — 정상). 옛 "high 시작·low 끝·짝수" 규칙은 폐기 — 마디 뷰는 levelViewOf 파생. */
    pivots: GridPivot[];
    /** 신고가 캔들 목록(시간 오름차순). */
    newHighs: GridNewHigh[];
    /**
     * 그날 기준가(이벤트 보정 전일 종가, UN — 그 날 원주가 스케일). 없으면 null = **결손**이고
     * 폴백(당일 첫 시가)은 두지 않는다: 격자엔 세션 첫 봉이 없고, 지어내지 않는 게 원칙이다.
     * 검출에는 안 쓰인다 — "당일 %" 를 클라가 격자만으로 파생하게 하는 재료다(축 공급자 재배치).
     */
    prevBase: number | null;
    /** prevBase 의 KRX 짝 — "당일 %(KRX)" 의 분모(2026-09-02, 같은 원칙: 사실만 굽고 폴백 없음). */
    prevBaseKrx: number | null;
    /**
     * 세션 최고가 = 세션 창 안 러닝 최고가의 **최종값**(그 봉의 시각·고가, 원주가). 순수 사실이라 굽는다
     * (2026-09-04 — 옛 "미확정 꼬리 고점은 굽지 않는다" 기각을 뒤집음: 결과 트랙이 소비자로 생겼다).
     * 마지막 확정 고점보다 높으면 그 초과분은 반드시 꼬리(마지막 사건 이후)의 것 — 이 한 값으로
     * ① 무눌림·꼬리 시그널의 "어디까지 올라갔는지"가 정확해지고 ② 마지막 저점의 회복 여부
     * (세션 최고가 > 그 고점가 ⟺ 재크로싱 발생, 볼륨 무관)가 판정된다(outcome.ts).
     */
    sessionHigh: { min: number; price: number };
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
 * 신고가·누적 대금에 영향 없지만 **피벗에는 참여한다** — 저가(=직전 종가)가 "그 분의 서 있던 가격"으로서
 * 터치 확정·구간 최저가 될 수 있다(거래 없음 ≠ 가격 없음. 넓은 봉 다음 빈 분이 그 종가로 확정하는 케이스).
 * 분봉이 없거나 세션 창에 한 봉도 없으면 null(재료 없음 — 캐시 층이 "무사건 격자"와 구분해 안 굽는다).
 */
export function detectGrid(
    rawMinutes: MinuteCandle[],
    prices: GridDayPrices,
    options: GridDetectOptions = {},
): PointGrid | null {
    const { base, prevBase, prevBaseKrx } = prices;
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
    // prefix[i] = tvs[0..i] 누적(BigInt 무손실) — 기록 봉마다 이 값을 그대로 싣는다(포함 관례).
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
    const markOf = (i: number): GridBarMark => ({ min: mins[i], tv: tvs[i].toString(), cum: prefix[i].toString() });

    // ── 피벗: 양방향 zigzag(경로 뷰, 2026-09-05 v9 — 명세 .claude/specs/2026-09-05-grid-swings-v9.md §2) ──
    // 국소 고점·저점의 교대 열을 굽는다. 임계는 고·저 대칭 zigzagPct 하나(굽는 하한 — 상승 3% 축약 등은
    // 읽기 층). 마디 뷰(레벨 쌍)는 levelViewOf(levelView.ts) 읽기 파생이다.
    //
    // **tie 규칙 하나(§2.3)**: 세션 최고가를 갱신한 봉(renew)에서만 고가가 이기고, 그 밖 모든 봉에서는
    // 저가가 이긴다. 갱신 봉은 러닝 최고가라는 상태값의 사건이라 그 고가를 잃으면 마디가 사라지고(v8 도
    // 이 봉을 저점 구간 밖에 뒀다), 그 밖의 봉은 눌림 깊이가 정보다(트레일링 스탑은 이미 선 최고가
    // 기준이라 국소 갱신 여부와 무관하게 저가가 아래면 맞은 것) — 시뮬의 비관적 타이브레이크와 같은 말.
    // 아래 분기 순서 넷이 이 규칙의 실현이다:
    //   dir=up   + renew   → runHigh 갱신 후 continue(터치 검사 생략)         ← 고가 우선
    //   dir=up   + 비갱신  → 터치 확정을 국소 runHigh 갱신보다 먼저           ← 저가 우선
    //   dir=down + renew   → 저점 확정(그 봉의 더 낮은 저가는 버림)           ← 고가 우선
    //   dir=down + 비갱신  → 저가 갱신을 저점 확정보다 먼저                   ← 저가 우선
    // 자기 봉 확정 금지는 `!== i` 검사와 continue 가 내장 — 확정 시각은 항상 극값 봉보다 뒤다.
    // 갱신 전 반대 극값 도달 없이 소멸한 후보는 안 싣고, 루프 끝의 미확정 후보 1개만 꼬리로 덧붙인다.
    const up = 1 + o.zigzagPct / 100;
    const down = 1 - o.zigzagPct / 100;
    interface RawPivot {
        kind: "high" | "low";
        idx: number;
        confirmIdx: number | null;
    }
    const raw: RawPivot[] = [];
    let dir: "none" | "up" | "down" = "none";
    let runHigh = 0; // 현재 상승 스윙(또는 dir=none 세션 전체)의 러닝 최고가 봉
    let runLow = 0; // 현재 하락 스윙(또는 dir=none 세션 전체)의 러닝 최저가 봉
    let sessMax = -Infinity;
    for (let i = 0; i < n; i++) {
        const renew = highs[i] > sessMax; // tie 스위치 — sessMax 갱신보다 먼저 판정
        if (renew) sessMax = highs[i];
        if (dir === "none") {
            // 첫 스윙 전 — 세션 극값 둘을 다 추적한다(선행 저점 허용).
            if (highs[i] > highs[runHigh]) runHigh = i;
            if (lows[i] < lows[runLow]) runLow = i;
            if (renew) {
                // 고가 우선 — 고점 판정은 없다(runHigh = 자기 봉). 저점 확정만 검사.
                if (runLow !== i && highs[i] >= lows[runLow] * up) {
                    raw.push({ kind: "low", idx: runLow, confirmIdx: i });
                    dir = "up";
                    runHigh = i;
                }
            } else if (runHigh !== i && lows[i] <= highs[runHigh] * down) {
                raw.push({ kind: "high", idx: runHigh, confirmIdx: i });
                dir = "down";
                runLow = i;
            } else if (runLow !== i && highs[i] >= lows[runLow] * up) {
                raw.push({ kind: "low", idx: runLow, confirmIdx: i });
                dir = "up";
                runHigh = i;
            }
        } else if (dir === "up") {
            if (renew) {
                runHigh = i;
                continue; // 고가 우선 — v8 고점 규칙 그대로(터치 검사 생략)
            }
            if (lows[i] <= highs[runHigh] * down) {
                raw.push({ kind: "high", idx: runHigh, confirmIdx: i });
                dir = "down";
                runLow = i;
            } else if (highs[i] > highs[runHigh]) {
                runHigh = i; // 국소 갱신(세션 최고가 아님)
            }
        } else {
            if (renew) {
                // 고가 우선 — 이 조건은 항상 참이다: lows[runLow] ≤ down×직전 확정 고점 ≤ down×sessMax
                // < down×highs[i] 이고 up×down = 0.9996 < 1. 거짓이면 불변식 위반이므로 즉사.
                if (!(highs[i] >= lows[runLow] * up)) {
                    throw new Error(`detectGrid: dir=down 갱신 봉(min=${mins[i]})에서 저점 확정 불가 — §2.2 불변식 위반`);
                }
                raw.push({ kind: "low", idx: runLow, confirmIdx: i });
                dir = "up";
                runHigh = i;
            } else if (lows[i] < lows[runLow]) {
                runLow = i; // 저가 우선 — 저가 갱신을 저점 확정보다 먼저
            } else if (highs[i] >= lows[runLow] * up) {
                raw.push({ kind: "low", idx: runLow, confirmIdx: i });
                dir = "up";
                runHigh = i;
            }
        }
    }
    // 꼬리 — 미확정 극값 1개(있다면 항상 마지막). dir=none 이면 무사건(빈 배열).
    if (dir === "up") raw.push({ kind: "high", idx: runHigh, confirmIdx: null });
    else if (dir === "down") raw.push({ kind: "low", idx: runLow, confirmIdx: null });

    // ── cross 스캔: 레벨(확정 고점 중 이전 모든 고점 피벗보다 가격이 큰 것, §2.5)에만 직전 레벨
    //    가격을 처음 넘은 봉(strict >)을 붙인다 — v8 crossIdx 와 같은 값. 스캔 구간이 레벨 사이로
    //    서로 겹치지 않아 전체 O(n). 미확정 꼬리 고점은 레벨이 아니다(넘을 대상 아님, v8 유지).
    let maxHighPrice = -Infinity; // 지금까지의 고점 피벗 가격 최대(레벨 판정 자)
    let prevLevelIdx = -1;
    let prevLevelPrice = 0;
    const pivots: GridPivot[] = raw.map((r) => {
        const price = r.kind === "high" ? highs[r.idx] : lows[r.idx];
        let cross: GridBarMark | null = null;
        if (r.kind === "high") {
            if (r.confirmIdx !== null && price > maxHighPrice) {
                if (prevLevelIdx >= 0) {
                    let j = prevLevelIdx + 1;
                    while (j < n && !(highs[j] > prevLevelPrice)) j++;
                    // 이 레벨 봉 자신이 직전 레벨보다 높아 j ≤ r.idx 가 보장된다(도달 불가 가드).
                    if (j >= n) throw new Error(`detectGrid: 레벨(min=${mins[r.idx]}) 크로싱 결손 — §2.5 불변식 위반`);
                    cross = markOf(j);
                }
                prevLevelIdx = r.idx;
                prevLevelPrice = price;
            }
            if (price > maxHighPrice) maxHighPrice = price;
        }
        return {
            kind: r.kind,
            min: mins[r.idx],
            price,
            confirmedMin: r.confirmIdx === null ? null : mins[r.confirmIdx],
            cum: prefix[r.idx].toString(),
            cross,
        };
    });

    // ── 신고가 캔들 목록 + 기준선 첫 터치 ────────────────────────────────────
    const floorWon = BigInt(o.floorEok) * KRW_PER_EOK;
    const newHighs: GridNewHigh[] = [];
    let touch: GridBarMark | null = null;
    let runningMax = -Infinity;
    let maxIdx = 0; // 세션 최고가를 세운 봉 — floor 무관(순수 가격 사실)
    for (let i = 0; i < n; i++) {
        if (base !== null && touch === null && highs[i] >= base) touch = markOf(i);
        if (highs[i] <= runningMax) continue;
        runningMax = highs[i];
        maxIdx = i;
        if (tvs[i] < floorWon) continue;
        newHighs.push({
            min: mins[i],
            open: Number(bars[i].un.open),
            high: highs[i],
            low: lows[i],
            close: Number(bars[i].un.close),
            tv: tvs[i].toString(),
            cum: prefix[i].toString(),
        });
    }

    return { base, touch, pivots, newHighs, prevBase, prevBaseKrx, sessionHigh: { min: mins[maxIdx], price: highs[maxIdx] } };
}
