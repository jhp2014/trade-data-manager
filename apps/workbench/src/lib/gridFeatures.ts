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
// ⚠ 축 규칙 2 = **시그널(Point) 봉까지만**(decisions.md "시그널 결과", 2026-09-04 렌즈 폐지로 재개정):
//   Point 봉 이후를 보는 값은 축이 아니라 **결과(outcome)**라 피드에 싣지 않는다 — 옛 고점 판·다리 축
//   (grid-high-*/grid-leg-*)은 은퇴했고 그 정보는 결과 패널(useOutcomes)이 진다(과거/미래 패널 경계).
import type { ComputedAxisFeed, ComputedAxisPoint } from "@trade-data-manager/wire";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { computedAxisId } from "./computedAxis.js";
import type { AutoPointsView } from "./usePointGrids.js";

const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * 축 **정의**(키·이름·표시) — 값은 `gridFeatureFeeds` 가 채운다. 키 목록은 여기서 **파생**한다: 격자 축은 잠깐 숨을 수
 * 있어서(고점 렌즈 축은 갱신 렌즈에서, 격자 축 전부는 격자 로딩 전에 목록에 없다) 서랍 청소(`pruneDrawer`)·시트 열
 * 청소(`pruneAxisKeys`)·순서 덮어쓰기(`moveAxis`/`reorder`)가 유령으로 오인해 사용자 설정을 지우지 않게 보호 목록으로
 * 넘긴다. 정의와 목록이 두 벌이면 축을 하나 더할 때 보호가 빠져 그 사고가 조용히 재발한다.
 *
 * 앞 둘(`baseline-position`·`daily-change-un`)은 **옛 서버 축에서 승계한 키** — 저장된 열 설정·필터가 이 주소를 든다.
 */
const BASE_SPECS = [
    { key: "baseline-position", name: "기준선 대비 %", strongerWhen: "higher", display: { suffix: "%", decimals: 1, signed: true } },
    { key: "daily-change-un", name: "당일 % (UN)", strongerWhen: "higher", display: { suffix: "%", decimals: 1, signed: true } },
    { key: "grid-prior-levels", name: "직전 마디 수", strongerWhen: "higher", display: { suffix: "개", decimals: 0, signed: false } },
    { key: "grid-daily-change-krx", name: "당일 % (KRX)", strongerWhen: "higher", display: { suffix: "%", decimals: 1, signed: true } },
    // 큰 값 우측(2026-09-02 사용자 확정 — 얕음→깊음이 좌→우로 읽히게)
    { key: "grid-pullback-pct", name: "눌림 깊이", strongerWhen: "higher", display: { suffix: "%", decimals: 1, signed: false } },
    // 큰 값 우측(짧음→긺이 좌→우)
    // 이름에서 "(분)" 을 뗀 건 표기가 `1h 34m` 이라서다 — 값의 계약은 여전히 분이다(formatAxisValue 의 단위 규칙).
    { key: "grid-renewal-elapsed", name: "재돌파 경과", strongerWhen: "higher", display: { suffix: "분", decimals: 0, signed: false } },
    // 1 에 가까울수록 = 늦게까지 눌리다 곧장 갱신(V자, 잠정)
    { key: "grid-pullback-pos", name: "눌림 저점 위치", strongerWhen: "higher", display: { suffix: "", decimals: 2, signed: false } },
] as const satisfies readonly Omit<ComputedAxisFeed, "values">[];
type BaseKey = (typeof BASE_SPECS)[number]["key"];

/** 클라 축 id(`c:` 접두) — 서랍·시트 열·순서 pref 가 드는 주소. 청소·덮어쓰기의 **보호 목록**은 격자 축 전부다.
 *  옛 고점·다리 키(grid-high-·grid-leg- 접두)는 은퇴(2026-09-04) — 목록에서 빠져 그 키의 저장 설정은 죽은 축 청소를 탄다(의도). */
export const GRID_AXIS_IDS: readonly string[] = BASE_SPECS.map((s) => computedAxisId(s.key));

/** Point 가 넘은 레벨(마디)에서 Point 캔들까지의 최저 저점 피벗 — 없으면 null(breakout 등, 결손은 결손).
 *  눌림 깊이·저점 위치 두 특징이 **같은 저점**을 봐야 해서 선정 규칙은 이 한 곳이다(두 벌이면 두 축이
 *  다른 저점을 말한다). 동가 tie 는 이른 봉(격자가 시간 오름차순이라 strict < 비교가 그 규칙).
 *  저점의 confirmedMin 은 안 본다 — 가격 자체는 Point 시각 이전에 일어난
 *  사실이라 미래 누출이 아니고, 묻는 것이 "그 구간을 지나며 실제로 어디까지 빠졌나"이기 때문.
 *  v9 경로 뷰로 국소 저점 피벗이 더 들어와도 창 안 최솟값은 같다(§2.6 ② tie 클래스 제외) — 코드 무변경.
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
 * 자동 Point 전체 → 특징 피드 7개. 자리는 useRankAxesValue 가 서버 피드 뒤에 이어 붙인다.
 * 값 없는 Point 는 values 에 없다 = 그 축에 미배치(계산 축 계약 그대로).
 */
export function gridFeatureFeeds(
    view: AutoPointsView,
    gridOf: (code: string, date: string) => PointGrid | undefined,
): ComputedAxisFeed[] {
    // 값 통은 정의에서 파생(축마다 배열 변수를 두면 정의와 두 벌이 된다).
    const baseValues = new Map<BaseKey, ComputedAxisPoint[]>(BASE_SPECS.map((s) => [s.key, []]));
    const pushBase = (k: BaseKey, p: ComputedAxisPoint): void => {
        baseValues.get(k)!.push(p);
    };
    for (const a of view.points) {
        const key = { stockCode: a.stockCode, date: a.date, time: a.time };
        const grid = gridOf(a.stockCode, a.date);
        if (!grid) continue;
        // 분자는 **Point 봉 종가** — 옛 서버 축("타점 시각 이하 마지막 UN 종가")과 같은 값이다(그 봉이
        // 곧 타점 봉이므로). 고가로 재면 이름만 같고 값이 다른 축이 된다.
        if (grid.base !== null && grid.base > 0) pushBase("baseline-position", { ...key, value: r2(((a.point.close - grid.base) / grid.base) * 100) });
        // 당일 % — 분모는 격자에 구운 그날 기준가(basePricesOf = 차트 D 가격선과 같은 것). 없으면 결손.
        // KRX 판은 분모만 KRX 짝 — 분자는 둘 다 UN 종가다(격자 신고가는 UN 만 굽는다: 장중 가격은 통합가 하나,
        // 두 판을 가르는 정보는 전일 종가 쪽이라는 판단. 2026-09-02 사용자 확정).
        if (grid.prevBase !== null && grid.prevBase > 0) pushBase("daily-change-un", { ...key, value: r2(((a.point.close - grid.prevBase) / grid.prevBase) * 100) });
        if (grid.prevBaseKrx !== null && grid.prevBaseKrx > 0) pushBase("grid-daily-change-krx", { ...key, value: r2(((a.point.close - grid.prevBaseKrx) / grid.prevBaseKrx) * 100) });
        pushBase("grid-prior-levels", { ...key, value: a.point.levelIdx });
        const low = pullbackLowPivot(grid, a.point.levelMin, a.point.min);
        if (low !== null && a.point.levelPrice > 0) pushBase("grid-pullback-pct", { ...key, value: r2(((a.point.levelPrice - low.price) / a.point.levelPrice) * 100) });
        // 재돌파 전용 둘 — breakout(= levelMin null: 기준선 슬롯 1)은 자연 결손("기준선 돌파는 해당 없음").
        // ⚠ 슬롯 2(2026-09-05 저녁)부터 이 축들의 모수에 **워터마크 재돌파**가 들어온다: levelMin =
        // 워터마크 봉(슬롯 1 캔들)이라 "넘은 고가 발생 → 재돌파까지"라는 정의는 그대로인데, 그 고가가
        // 마디가 아니라 밴드 안 워터마크일 수 있고 경과 분이 짧다(실측 p50 2분). 눌림 깊이(grid-pullback-pct)
        // 의 분모도 슬롯 2 에선 워터마크다 — 결과 걷기의 "고점 대비 %"(마디 분모)와 자가 다르다(의도,
        // decisions.md 슬롯 2 항목).
        if (a.point.levelMin !== null) {
            const span = a.point.min - a.point.levelMin; // 넘은 고가(마디 또는 워터마크) 발생 → 재돌파(Point 봉)까지 경과 분
            if (span > 0) {
                pushBase("grid-renewal-elapsed", { ...key, value: span });
                // 저점 위치 — 마디 시각을 0, Point 시각을 1 로 놓은 구간에서 눌림 저점이 어디쯤인가.
                if (low !== null) pushBase("grid-pullback-pos", { ...key, value: r2(Math.max(0, Math.min(1, (low.min - a.point.levelMin) / span))) });
            }
        }
    }
    return BASE_SPECS.map((s): ComputedAxisFeed => ({ ...s, values: baseValues.get(s.key)! }));
}
