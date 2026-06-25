import type { MinuteCandle } from "./types";
import { kstMinutesOfDay } from "./chartTime";

const KRX_OPEN_MIN = 9 * 60;        // 09:00 (KRX 정규장 시작)
const KRX_CLOSE_MIN = 15 * 60 + 30; // 15:30 (KRX 정규장 종료)
const KRX_VIEW_OPEN_MIN = 8 * 60;   // 08:00 (KRX 캡처 시 NXT 종목 좌측 경계)

export interface MinuteViewRangeOptions {
    variant: "KRX" | "NXT";
    /** 첫 봉 왼쪽 여백 봉 수(분). 기본 10. */
    padBars?: number;
    /** 마지막 봉 오른쪽 여백 봉 수. 기본 2. */
    rightPadBars?: number;
}

/**
 * 분봉 캡처용 시간축 logical range(순수 계산).
 *
 *  - KRX variant이고 정규장(09:00~15:30) 밖에 봉이 있으면(= NXT 거래 종목)
 *    08:00~15:30 구간으로 클립한다(애프터마켓 꼬리 제거).
 *  - 그 외(KRX 전용 종목, NXT variant)는 전체 봉을 대상으로 한다.
 *
 * 어느 경우든 첫 봉이 화면 좌단에 붙지 않도록 `padBars`만큼 음수에서 시작해
 * 좌측 공백을 만든다(봉 인덱스 기준 = 분 단위).
 *
 * @returns lightweight-charts setVisibleLogicalRange에 넘길 {from,to}. 캔들이 없으면 null.
 */
export function computeMinuteViewRange(
    candles: MinuteCandle[],
    { variant, padBars = 10, rightPadBars = 2 }: MinuteViewRangeOptions,
): { from: number; to: number } | null {
    if (candles.length === 0) return null;

    const hasOutOfHours = variant === "KRX" &&
        candles.some((c) => {
            const m = kstMinutesOfDay(c.time);
            return m < KRX_OPEN_MIN || m > KRX_CLOSE_MIN;
        });

    let fromIdx = 0;
    let toIdx = candles.length - 1;
    if (hasOutOfHours) {
        fromIdx = candles.findIndex((c) => kstMinutesOfDay(c.time) >= KRX_VIEW_OPEN_MIN);
        if (fromIdx < 0) fromIdx = 0;
        for (let i = candles.length - 1; i >= 0; i--) {
            if (kstMinutesOfDay(candles[i].time) <= KRX_CLOSE_MIN) {
                toIdx = i;
                break;
            }
        }
    }

    return { from: fromIdx - padBars, to: toIdx + rightPadBars };
}
