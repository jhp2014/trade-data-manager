// 격자 특징 — 자동 Point 의 클라 파생 값을 **서버 계산 축과 같은 피드 모양**(ComputedAxisFeed)으로 낸다.
// 그 뒤는 전부 기존 경로다: computedAxisView 가 줄·값·fmt 를 만들고 레일·시트 열·axisValue 술어·밴드가
// 축 종류를 구분하지 않는다(decisions.md "클라 파생 특징은 축 문법에 앉힌다 — 새 술어 종류를 만들지 않는다").
//
// 키 둘(`baseline-position`·`daily-change-un`)은 **옛 서버 축에서 승계한 것**이다 — 키는 캐시 파일명이
// 아니라 사용자 설정이 저장되는 주소라(시트 열 폭·고정·숨김, 필터 술어, 레일 순서) 공급자가 서버에서
// 클라로 옮겨도 주소는 옮기지 않는다(decisions.md "축 키는 뜻의 주소다"). 신설 축만 `grid-` 접두를 쓴다.
// 값은 **병합(축약) 후 구조에서 계산**된다 —
// 입력이 pointsOf 의 산출물(levelIdx·levelMin이 병합 반영)이라 원칙이 구조적으로 지켜진다.
//
// ⚠ 축 규칙 2 = **그 렌즈의 결정 봉까지만**(decisions.md "시그널 렌즈"): 갱신 렌즈의 결정 봉은 Point 봉이라
//   앞 7개 특징만 서고, 고점 렌즈(결정 봉 = 그 다리의 확정 고점 봉)에서만 고점 판·다리 축 7개가 **추가로**
//   선다. 갱신 렌즈에서 그 값들은 시그널 이후 정보(outcome)라 결손이 아니라 **피드에서 빠진다**(누출 게이트는
//   필터 행이 아니라 모수 선언 층이 진다). 상속 축은 고점 렌즈에서도 갱신 시점 값 그대로다(재계산 없음).
import type { ComputedAxisFeed, ComputedAxisPoint } from "@trade-data-manager/wire";
import { legHighOf, legWindowOf, type PointGrid, type SignalLens } from "@trade-data-manager/market/domain";
import type { AutoPointsView } from "./usePointGrids.js";

const r2 = (x: number): number => Math.round(x * 100) / 100;
const r1 = (x: number): number => Math.round(x * 10) / 10;
const KRW_PER_EOK = 100_000_000;

/**
 * 고점 렌즈에서만 서는 축 키 — 렌즈를 갱신으로 되돌리면 축 목록에서 **사라지는** 키들이다.
 * 서랍 청소(`pruneDrawer`)가 이 키들을 유령으로 오인해 사용자 설정을 지우지 않게 보호 목록으로 넘긴다.
 */
export const HIGH_LENS_AXIS_KEYS: readonly string[] = [
    "grid-high-baseline-pct",
    "grid-high-daily-change-un",
    "grid-high-daily-change-krx",
    "grid-high-min",
    "grid-leg-minutes",
    "grid-leg-amount-per-min",
    "grid-leg-rise-pct",
];
const HIGH_LENS_KEY_SET = new Set(HIGH_LENS_AXIS_KEYS);
export const isHighLensAxis = (key: string): boolean => HIGH_LENS_KEY_SET.has(key);

/** Point 가 넘은 레벨(마디)에서 Point 캔들까지의 최저 저점 피벗 — 없으면 null(breakout 등, 결손은 결손).
 *  눌림 깊이·저점 위치 두 특징이 **같은 저점**을 봐야 해서 선정 규칙은 이 한 곳이다(두 벌이면 두 축이
 *  다른 저점을 말한다). 동가 tie 는 이른 봉(격자가 시간 오름차순이라 strict < 비교가 그 규칙).
 *  저점의 confirmedMin 은 안 본다(재정식화 격자에선 항상 null) — 가격 자체는 Point 시각 이전에 일어난
 *  사실이라 미래 누출이 아니고, 묻는 것이 "그 구간을 지나며 실제로 어디까지 빠졌나"이기 때문.
 *  저점 = 구간 **봉 최저**(피벗 최저가 아님)라 옛 격자보다 값이 조금 깊어질 수 있다(더 정확한 쪽). */
function pullbackLowPivot(grid: PointGrid, levelMin: number | null, pointMin: number): { min: number; price: number } | null {
    if (levelMin === null) return null;
    let low: { min: number; price: number } | null = null;
    for (const p of grid.pivots) {
        if (p.kind !== "low" || p.min <= levelMin || p.min > pointMin) continue;
        if (low === null || p.price < low.price) low = p;
    }
    return low;
}

/**
 * 자동 Point 전체 → 특징 피드(갱신 렌즈 7개, 고점 렌즈 +7개). 자리는 useRankAxesValue 가 서버 피드 뒤에 이어 붙인다.
 * 값 없는 Point 는 values 에 없다 = 그 축에 미배치(계산 축 계약 그대로).
 */
export function gridFeatureFeeds(
    view: AutoPointsView,
    gridOf: (code: string, date: string) => PointGrid | undefined,
    lens: SignalLens = "renewal",
): ComputedAxisFeed[] {
    const baselinePct: ComputedAxisPoint[] = [];
    const dailyPct: ComputedAxisPoint[] = [];
    const dailyPctKrx: ComputedAxisPoint[] = [];
    const priorLevels: ComputedAxisPoint[] = [];
    const pullback: ComputedAxisPoint[] = [];
    const renewalElapsed: ComputedAxisPoint[] = [];
    const pullbackPos: ComputedAxisPoint[] = [];
    // 고점 판(분자 = 고점가) + 다리 축(창 = 레벨 크로싱 봉 → 고점 봉) — 고점 렌즈 전용.
    const highBaselinePct: ComputedAxisPoint[] = [];
    const highDailyPct: ComputedAxisPoint[] = [];
    const highDailyPctKrx: ComputedAxisPoint[] = [];
    const highMin: ComputedAxisPoint[] = [];
    const legMinutes: ComputedAxisPoint[] = [];
    const legAmountPerMin: ComputedAxisPoint[] = [];
    const legRisePct: ComputedAxisPoint[] = [];
    for (const a of view.points) {
        const key = { stockCode: a.stockCode, date: a.date, time: a.time };
        const grid = gridOf(a.stockCode, a.date);
        if (!grid) continue;
        // 분자는 **Point 봉 종가** — 옛 서버 축("타점 시각 이하 마지막 UN 종가")과 같은 값이다(그 봉이
        // 곧 타점 봉이므로). 고가로 재면 이름만 같고 값이 다른 축이 된다.
        if (grid.base !== null && grid.base > 0) baselinePct.push({ ...key, value: r2(((a.point.close - grid.base) / grid.base) * 100) });
        // 당일 % — 분모는 격자에 구운 그날 기준가(basePricesOf = 차트 D 가격선과 같은 것). 없으면 결손.
        // KRX 판은 분모만 KRX 짝 — 분자는 둘 다 UN 종가다(격자 신고가는 UN 만 굽는다: 장중 가격은 통합가 하나,
        // 두 판을 가르는 정보는 전일 종가 쪽이라는 판단. 2026-09-02 사용자 확정).
        if (grid.prevBase !== null && grid.prevBase > 0) dailyPct.push({ ...key, value: r2(((a.point.close - grid.prevBase) / grid.prevBase) * 100) });
        if (grid.prevBaseKrx !== null && grid.prevBaseKrx > 0) dailyPctKrx.push({ ...key, value: r2(((a.point.close - grid.prevBaseKrx) / grid.prevBaseKrx) * 100) });
        priorLevels.push({ ...key, value: a.point.levelIdx });
        const low = pullbackLowPivot(grid, a.point.levelMin, a.point.min);
        if (low !== null && a.point.levelPrice > 0) pullback.push({ ...key, value: r2(((a.point.levelPrice - low.price) / a.point.levelPrice) * 100) });
        // 재돌파 전용 둘 — breakout 은 levelMin === null 이라 자연 결손("기준선 돌파는 해당 없음").
        if (a.point.levelMin !== null) {
            const span = a.point.min - a.point.levelMin; // 마디(직전 고가) 발생 → 갱신(Point 봉)까지 경과 분
            if (span > 0) {
                renewalElapsed.push({ ...key, value: span });
                // 저점 위치 — 마디 시각을 0, Point 시각을 1 로 놓은 구간에서 눌림 저점이 어디쯤인가.
                if (low !== null) pullbackPos.push({ ...key, value: r2(Math.max(0, Math.min(1, (low.min - a.point.levelMin) / span))) });
            }
        }

        if (lens !== "high") continue;
        // 다리 고점 = 시그널 이후 첫 확정 고점(≤1:1). 꼬리(세션 끝까지 −2% 안 빠짐)는 전부 결손 — 눌림 시뮬에선 미체결.
        const high = legHighOf(grid, a.point.min);
        if (high === null) continue;
        const hp = high.pivot.price;
        if (grid.base !== null && grid.base > 0) highBaselinePct.push({ ...key, value: r2(((hp - grid.base) / grid.base) * 100) });
        if (grid.prevBase !== null && grid.prevBase > 0) highDailyPct.push({ ...key, value: r2(((hp - grid.prevBase) / grid.prevBase) * 100) });
        if (grid.prevBaseKrx !== null && grid.prevBaseKrx > 0) highDailyPctKrx.push({ ...key, value: r2(((hp - grid.prevBaseKrx) / grid.prevBaseKrx) * 100) });
        highMin.push({ ...key, value: high.pivot.min });
        // 다리 창 — 시작은 시그널이 넘은 레벨의 크로싱(돌파 = 터치 봉, 재돌파 = 전고점 크로싱 봉). 저대금 크로싱~Point
        // 사이 대금이 창에 섞이는 건 의도(2026-09-02 사용자 확정). 세 축이 **같은 창**을 봐야 해서 한 번만 푼다.
        const leg = legWindowOf(grid, a.point);
        if (leg === null) continue;
        legMinutes.push({ ...key, value: leg.minutes });
        // 억원/분, 분모 = 창 봉 수(minutes + 1 — 포함 창이라 봉 수와 같은 자, 0 나눗셈 없음). 값 계약(decisions).
        legAmountPerMin.push({ ...key, value: r1(Number(BigInt(leg.amount)) / KRW_PER_EOK / (leg.minutes + 1)) });
        // 돌파 행에선 레벨가 = 기준선이라 "고점 기준선 대비 %"와 정의상 같은 값 — 재돌파 행에서만 갈린다.
        if (a.point.levelPrice > 0) legRisePct.push({ ...key, value: r2(((hp - a.point.levelPrice) / a.point.levelPrice) * 100) });
    }
    const base: ComputedAxisFeed[] = [
        {
            key: "baseline-position", // 옛 서버 축에서 승계 — 저장된 열 설정·필터가 이 주소를 든다
            name: "기준선 대비 %",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: baselinePct,
        },
        {
            key: "daily-change-un", // 승계(위와 같은 이유)
            name: "당일 % (UN)",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: dailyPct,
        },
        {
            key: "grid-prior-levels",
            name: "직전 마디 수",
            strongerWhen: "higher",
            display: { suffix: "개", decimals: 0, signed: false },
            values: priorLevels,
        },
        {
            key: "grid-daily-change-krx",
            name: "당일 % (KRX)",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: dailyPctKrx,
        },
        {
            key: "grid-pullback-pct",
            name: "눌림 깊이",
            strongerWhen: "higher", // 큰 값 우측(2026-09-02 사용자 확정 — 얕음→깊음이 좌→우로 읽히게)
            display: { suffix: "%", decimals: 1, signed: false },
            values: pullback,
        },
        {
            key: "grid-renewal-elapsed",
            name: "재돌파 경과(분)",
            strongerWhen: "higher", // 큰 값 우측(2026-09-02 사용자 확정 — 짧음→긺이 좌→우)
            display: { suffix: "분", decimals: 0, signed: false },
            values: renewalElapsed,
        },
        {
            key: "grid-pullback-pos",
            name: "눌림 저점 위치",
            strongerWhen: "higher", // 1 에 가까울수록 = 늦게까지 눌리다 곧장 갱신(V자, 잠정)
            display: { suffix: "", decimals: 2, signed: false },
            values: pullbackPos,
        },
    ];
    if (lens !== "high") return base;
    const high: ComputedAxisFeed[] = [
        {
            key: "grid-high-baseline-pct",
            name: "고점 기준선 대비 %",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: highBaselinePct,
        },
        {
            key: "grid-high-daily-change-un",
            name: "고점 당일 % (UN)",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: highDailyPct,
        },
        {
            key: "grid-high-daily-change-krx",
            name: "고점 당일 % (KRX)",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: highDailyPctKrx,
        },
        {
            key: "grid-high-min",
            name: "고점 시각(분)",
            strongerWhen: "higher", // 자정기준 분 — 이름·표시가 시각으로 바뀌어도 값 계약은 분 정수(필터 경계의 뜻)
            display: { suffix: "분", decimals: 0, signed: false },
            values: highMin,
        },
        {
            key: "grid-leg-minutes",
            name: "다리 시간(분)",
            strongerWhen: "higher", // 큰 값 우측(짧음→긺)
            display: { suffix: "분", decimals: 0, signed: false },
            values: legMinutes,
        },
        {
            key: "grid-leg-amount-per-min",
            name: "다리 대금/분",
            strongerWhen: "higher",
            display: { suffix: "억/분", decimals: 1, signed: false },
            values: legAmountPerMin,
        },
        {
            key: "grid-leg-rise-pct",
            name: "다리 상승 %",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: legRisePct,
        },
    ];
    return [...base, ...high];
}
