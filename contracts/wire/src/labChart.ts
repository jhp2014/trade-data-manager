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

/**
 * lab 저장 선 — 사용자가 차트(종목, 날짜)에서 저장한 선 하나(lab-api `/chart-lines`, 파일 정본 — workbench 기준선의 후계).
 * **가격이 아니라 좌표**: 값은 보일 때 그 봉에서 읽는다(수정계수·UN* 보정이 바뀌어도 따라간다).
 * anchorTime 이 null 이면 일봉 선, 값이면 분봉 선(market 은 un 고정 — 분봉 KRX 는 NXT 단독 시간에 없다).
 * 정체 = (chartDate, anchorDate, anchorTime, field, market) — 같은 좌표는 하나뿐.
 */
export interface LabChartLine {
    /** 주인 차트의 날짜(그 날짜 차트에서만 보인다). */
    chartDate: string;
    /** 선을 만든 봉의 날짜. chartDate 이하. */
    anchorDate: string;
    /** 분봉 선이면 그 봉의 시각(HH:MM:SS), 일봉 선이면 null. */
    anchorTime: string | null;
    field: "O" | "H" | "L" | "C";
    market: "un" | "krx";
}
