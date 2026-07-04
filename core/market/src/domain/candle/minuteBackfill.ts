// core/market/domain/minuteBackfill — 분봉 빈 분 채움(backfill). 순수함수(외부 import 0).
//
// 키움/KIS 분봉은 "체결 있는 분만" 반환 → 무거래·VI(변동성완화장치) 정지 등으로 장중에 빈 분이 생긴다.
// densifyMinutes 는 그 내부 갭을 "직전 종가 그대로(O=H=L=C) + 거래량 0" 으로 채워 연속 시계열을 만든다.
//
// 합의된 경계(opt-in): 수집 어댑터/provider 는 *존재하는 봉만* 정직하게 반환(DB엔 요청한 그대로 적재),
// 연속 시계열이 필요한 소비자(복기/지표)가 이 함수를 호출한다.
//
// 채움 정책 = **내부 갭만(interior fill)**, 시장(KRX/UN)별 독립:
//  - 각 시장의 *첫 봉~마지막 봉 사이*에 빠진 분만 채운다(거래달력 없이 동작 — 반장·휴장 무관).
//  - 선두 갭(개장 후 첫 체결 전)은 직전 가격이 없어 못 채운다(정상).
//  - KRX 범위 *밖*(NXT 프리마켓·시간외)은 구조적 부재라 krx=null 유지. UN 은 항상 존재하니 그 범위로.
//    → "krx===null 이 프리마켓(구조적)인지 장중 VI(채울 갭)인지"가 KRX 범위 규칙으로 자동 구분된다.
//
// 주의: 세션 간 빈 구간(예 정규장 마감~시간외 단일가 사이)도 내부 갭으로 보고 flat-fill 될 수 있으나,
// 채움봉은 거래량 0이라 거래대금·누적 등 vol 가중 지표엔 무영향(직전가 반복)이라 무해하다.
// ⚠ 이 채움 정책은 day-reduction 캐시 출력에 반영된다 — 바꾸면 DAY_REDUCTION_VERSION 을 +1.
import type { MinuteBar, MinuteCandle } from "./model.js";

/** "HH:MM:SS" → 자정 기준 분(分). 초는 분봉상 항상 00 이라 무시. */
function toMinutes(time: string): number {
    const [h, m] = time.split(":");
    return Number(h) * 60 + Number(m);
}

/** 분(分) → "HH:MM:00". */
function toTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(h)}:${p(m)}:00`;
}

/** 직전 봉을 거래량 0의 평탄봉(O=H=L=C=직전 종가)으로 복제. */
function flat(prev: MinuteBar): MinuteBar {
    return { open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume: "0" };
}

/**
 * 분봉 시계열의 내부 갭을 채워 dense(분 단위 연속) 시계열로 만든다.
 * 입력은 시간 오름차순 가정(어댑터 계약). 반환도 시간 오름차순.
 * 입력이 비었으면 빈 배열을 그대로 돌려준다.
 */
export function densifyMinutes(candles: MinuteCandle[]): MinuteCandle[] {
    if (candles.length === 0) return [];

    const byTime = new Map<number, MinuteCandle>();
    for (const c of candles) byTime.set(toMinutes(c.time), c);

    const unMinutes = [...byTime.keys()].sort((a, b) => a - b);
    const unStart = unMinutes[0];
    const unEnd = unMinutes[unMinutes.length - 1];

    // KRX 내부 범위 = krx!=null 인 봉의 첫~마지막. 이 범위 밖은 구조적 부재(null 유지).
    const krxMinutes = candles.filter((c) => c.krx !== null).map((c) => toMinutes(c.time));
    const hasKrx = krxMinutes.length > 0;
    const krxStart = hasKrx ? Math.min(...krxMinutes) : 0;
    const krxEnd = hasKrx ? Math.max(...krxMinutes) : -1;

    const { stockCode, date } = candles[0];
    const out: MinuteCandle[] = [];
    let prevUn: MinuteBar | null = null;
    let prevKrx: MinuteBar | null = null;

    for (let t = unStart; t <= unEnd; t++) {
        const existing = byTime.get(t);

        // UN: 존재하면 그대로(직전 갱신), 없으면 직전 종가 평탄봉.
        const un: MinuteBar = existing ? existing.un : flat(prevUn!);
        prevUn = un;

        // KRX: krx 범위 안에서만 채운다. 밖이면 null.
        let krx: MinuteBar | null = null;
        if (hasKrx && t >= krxStart && t <= krxEnd) {
            if (existing && existing.krx !== null) {
                krx = existing.krx;
                prevKrx = krx;
            } else {
                krx = flat(prevKrx!);
            }
        }

        out.push({ stockCode, date, time: toTime(t), krx, un });
    }

    return out;
}
