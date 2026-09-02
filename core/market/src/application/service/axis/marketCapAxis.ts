// 계산 축 — "시가총액": 그 하루의 시총(억원).
//
//   값 = daily_market_cap(차트 날짜의 **직전 거래일**) / 1e8 — **억원 단위 숫자를 축이 직접 낸다**
//   (AxisDisplay 에 배율이 없다).
//
// 뜻: 이 상황이 벌어진 그릇의 크기. 축은 줄을 세우는 물건이라 %가 관례지만 시총은 그 자체가
// 종목 독립 단위(원)라 절대값으로 선다.
//
// grain 이 day 인 이유 + **왜 D-1 행인가**: 저장값은 KRX 정의라 그 날 종가 × 그 날 주식수(당일 기준)다.
// 그걸 D 칸에 그대로 쓰면 그날 등락이 시총에 섞여 **규칙 2(하루 시작 전 재료만)를 깬다** — 필터 경계는
// 값(`{kind:"value"}`)이라 로그 척도로 가려지지도 않고, "시총 500억 이하" 모수가 그날 결과에 의존하게 된다.
// D-1 행 = 전일 종가 × 전일 상장주식수 = 아침에 이미 정해져 있는 그릇 크기다. 계산은 여전히 0(다른 날 행을
// 읽을 뿐). params 도 없다 — 사람 입력(앵커)과 무관하게 시장 데이터로 완결된다.
//   ⚠ 그래서 이 축의 캐시 항목은 지문이 빈 문자열이라 **영구 히트**한다(prevDayHighAxis 와 동일).
//     시총 테이블을 백필로 소급 수정하면 자동 무효화가 없다 — version 상향이 유일한 처방이다.
//
// 결손(값을 지어내지 않는다, 규칙 3):
//  · 직전 거래일 행 없음 — 상장 첫날(그 전이 없다)·미수집 구간.
//  · 값이 0 이하 — 재료 오염. KRX 소스 전환 후 실측 0건이지만 가드는 남긴다(가짜가 줄의 왼쪽 끝을 차지한다).
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
        version: 2, // 1→2: 값 정의가 당일 행 → **직전 거래일 행**으로 바뀌었다(캐시 영구 히트라 상향이 유일한 무효화)
        strongerWhen: "higher", // 큰 값이 우측(2026-09-02 사용자 확정 — 레일 좌→우 = 작은→큰 통일)
        grain: "day",
        // 값이 1억~수천만억으로 수만 배 갈린다 — 선형 레일이면 소형주 전 구간이 왼쪽 픽셀 몇 개에 뭉개진다.
        // 이 축은 0 이하를 결손 처리하므로 로그의 정의역(양수)이 계산에서 보장된다.
        display: { suffix: "억", decimals: 0, signed: false, scale: "log" },
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
        // D-1 행을 읽는다. 돌아오는 r.date 는 직전 거래일이라 쓰지 않고, 값은 차트 날짜(date) 칸에 실린다.
        const rows = await deps.marketCap.getPreviousByDateAndCodes(date, codes);
        return rows.flatMap((r) => {
            const value = Number(r.marketCap) / EOK;
            if (!Number.isFinite(value) || !(value > 0)) return [];
            return [{ stockCode: r.stockCode, date, value }];
        });
    });
    return per.flat();
}
