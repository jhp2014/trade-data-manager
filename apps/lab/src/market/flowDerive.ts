// /day-flow(분당 원값) → 보드가 쓰는 % 공간 파생 — 계약 원칙 "서버 = 분당 사실 + 기준가, 표현(%·누적·기준
// 전환)은 전부 클라"(결정 로그 「trade-lab 편입」)의 클라 쪽 절반. %·누적 계산은 전부 여기 한 곳이다 —
// 판 코드에 나눗셈이 흩어지지 않게.
// 파생은 UN 기준 **한 벌**이다 — 유니버스 선정·주도주·1분 신호의 잣대는 통합(UN) % 로 고정돼 있어(테마 보드
// 규칙) 기준 토글이 측정을 바꾸면 안 된다. KRX/UN 토글 = 클라의 base 선택이고, 표시층은 % 위의
// rebasePct(base 가 원값이라 수학적으로 그냥 나눗셈과 동치)로 그 선택을 하므로 두 벌을 만들지 않는다(메모리 2배).
// %·누적 수식은 core 와 같은 함수(pctOfBase·pctSeriesOf) — 서버 deriveMinutes 와 단일 출처(새로 적지 않는다).
// 브라우저 코드라 /domain 서브패스만 쓴다(루트 index 는 service 층까지 끌고 온다 — workbench 관례).
import { pctSeriesOf } from "@trade-data-manager/market/domain";
import type { DayFlow, DayFlowStock } from "./types.js";

/** 분당 원값에서 파생한 % 공간 시계열(UN 기준 한 벌) — 옛 % 계약과 같은 모양. 보드·단면은 이것만 본다. */
export interface DerivedFlowStock {
    code: string;
    times: number[]; // unix seconds(UTC)
    rate: number[]; // 분당 종가 등락률 %
    high: number[]; // 그 분까지의 고가 %(누적 최대)
    low: number[]; // 그 분까지의 저가 %(누적 최소)
    open: number; // 당일 시가 %
    cumAmount: number[]; // 그 분까지의 누적 거래대금(원)
    basePrice: DayFlowStock["basePrice"]; // KRX 재기저(rebasePct)·결손 판정용으로 그대로 들고 간다
    marketCap: string | null;
}

export function deriveFlowStock(s: DayFlowStock): DerivedFlowStock {
    // 기준가 폴백(없으면 당일 시가)·러닝 고저·누적 대금·반올림 전부 core pctSeriesOf 몫 — 서버와 같은 함수.
    const d = pctSeriesOf({ close: s.close, high: s.high, low: s.low, amount: s.amount }, s.open, s.basePrice.un);
    return {
        code: s.code,
        times: s.times,
        rate: d.rate,
        high: d.high,
        low: d.low,
        open: d.open,
        cumAmount: d.cumAmount,
        basePrice: s.basePrice,
        marketCap: s.marketCap,
    };
}

// 파생은 flow 객체당 한 벌 — 패널 여러 개·테마 소속 refetch 가 같은 flow 를 다시 파생하지 않게(react-query
// 캐시의 flow 수명과 동행하는 WeakMap). 파생 한 벌 ≈ 배열 4개 × 종목 × 분이라 패널마다 만들면 수십 MB.
const derivedByFlow = new WeakMap<DayFlow, ReadonlyMap<string, DerivedFlowStock>>();

export function deriveFlow(flow: DayFlow): ReadonlyMap<string, DerivedFlowStock> {
    let m = derivedByFlow.get(flow);
    if (!m) {
        m = new Map(flow.stocks.map((s) => [s.code, deriveFlowStock(s)]));
        derivedByFlow.set(flow, m);
    }
    return m;
}
