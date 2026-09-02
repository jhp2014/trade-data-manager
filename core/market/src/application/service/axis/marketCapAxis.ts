// 계산 축 — "시가총액": 그 하루의 시총(억원).
//
//   값 = daily_market_cap(차트 날짜) / 1e8 — **억원 단위 숫자를 축이 직접 낸다**(AxisDisplay 에 배율이 없다).
//
// 뜻: 이 상황이 벌어진 그릇의 크기. 축은 줄을 세우는 물건이라 %가 관례지만 시총은 그 자체가
// 종목 독립 단위(원)라 절대값으로 선다.
//
// grain 이 day 인 이유: 재료인 daily_market_cap(D) = 원주가 KRX 종가(D-1) × 주식수(D) 라
// **그 하루가 시작하기 전에 이미 확정된 값**이다(규칙 2가 데이터 정의로 지켜진다). params 도 없다 —
// 사람 입력(앵커)과 무관하게 시장 데이터로 완결된다.
//   ⚠ 그래서 이 축의 캐시 항목은 지문이 빈 문자열이라 **영구 히트**한다(prevDayHighAxis 와 동일).
//     시총 테이블을 백필로 소급 수정하면 자동 무효화가 없다 — version 상향이 유일한 처방이다.
//
// 결손(값을 지어내지 않는다, 규칙 3):
//  · 그 날짜 행 없음 — 미백필·신규상장 직후(실측 2026-09-02: 앵커 차트 6,017 중 38건).
//  · 값이 0 이하 — 재료 오염(주식수·종가 0). 그대로 내면 줄의 왼쪽 끝을 가짜가 차지한다.
import type { ChartRef } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import type { AxisDeps, DayAxisValue, DayComputedAxisDef } from "./axis.js";

/** 원 → 억원. */
const EOK = 1e8;
/** 날짜 동시 읽기 상한 — 다른 축과 같은 이유(커넥션 풀 포화 방지). 조회 낟알이 (종목,날)이 아니라 날짜라 넉넉하다. */
const DATE_CONCURRENCY = 8;

export function marketCapAxis(): DayComputedAxisDef {
    return {
        key: "market-cap",
        name: "시가총액",
        version: 1,
        strongerWhen: "higher", // 큰 값이 우측(2026-09-02 사용자 확정 — 레일 좌→우 = 작은→큰 통일)
        grain: "day",
        display: { suffix: "억", decimals: 0, signed: false },
        inputs: ["marketCap"],
        compute: computeMarketCap,
    };
}

async function computeMarketCap(charts: readonly ChartRef[], deps: AxisDeps): Promise<DayAxisValue[]> {
    // 날짜별 배치 — 리더가 (날짜, 코드들) 낟알이라 종목 루프로 돌리면 차트 수만큼 쿼리가 된다.
    const byDate = new Map<string, string[]>();
    for (const c of charts) {
        const list = byDate.get(c.date);
        if (list) list.push(c.stockCode);
        else byDate.set(c.date, [c.stockCode]);
    }
    const per = await mapWithConcurrency([...byDate.entries()], DATE_CONCURRENCY, async ([date, codes]): Promise<DayAxisValue[]> => {
        const rows = await deps.marketCap.getByDateAndCodes(date, codes);
        return rows.flatMap((r) => {
            const value = Number(r.marketCap) / EOK;
            if (!Number.isFinite(value) || !(value > 0)) return [];
            return [{ stockCode: r.stockCode, date, value }];
        });
    });
    return per.flat();
}
