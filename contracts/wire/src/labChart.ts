// lab 차트 계약 — 일봉(/daily)과 분봉(/minutes)을 따로 받는다(옛 /chart 묶음 은퇴, 결정 로그 「일봉 판단 학습」).
// 값타입(DailyCandle·MinuteCandle)은 core/market 재노출 — 여기는 lab-api 가 덧붙이는 봉투만.
import type { DailyCandle, MinuteCandle } from "@trade-data-manager/market";
import type { BasePrice } from "./chart.js";

/**
 * 유령 체결을 걷은 UN 값(**수정주가 스케일**, 정수 문자열) — 걷힌 칸만 있다(없는 칸은 un 그대로).
 * 계산은 core ghostFixOf(분봉 원주가) → 그 날 수정계수로 환산. 분봉이 없는 날은 붙지 않는다(UN 그대로 — 보정 못 함).
 */
export interface DailyUnFix {
    open?: string;
    high?: string;
    low?: string;
}

/** GET /daily 한 줄 — 수정주가 일봉 + 보정된 날만 unFix. UN* = un 에 unFix 를 덮은 값. */
export interface LabDailyCandle extends DailyCandle {
    unFix?: DailyUnFix;
}

/**
 * GET /minutes?code&date — 그 날 분봉(원주가, 무거래 채움 끝) + % 기준가 + 수정주가 환산비.
 * 수정주가(일봉 스케일) 원화 = 원주가 ÷ rawScale. 분봉이 없는 날은 minutes 가 빈 배열.
 */
export interface LabMinuteDay {
    stockCode: string;
    date: string;
    minutes: MinuteCandle[];
    /** 분봉 % 기준가(당일 원주가 스케일, core basePricesOf). 상장 첫날 등은 null. */
    basePrice: BasePrice | null;
    /** 수정주가 → 그 날 원주가 환산비(core rawScaleOf, 평상 1). */
    rawScale: number;
}
