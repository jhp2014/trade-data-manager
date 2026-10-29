// core/market/domain/ghostTrade — NXT 단독 시간의 유령 체결을 걷은 UN 시가·고가·저가(순수 함수, 외부 import 0).
//
// NXT 장 시작(대개 08:00 첫 체결)에 거래 없이 동떨어진 값이 한두 건 찍혀 UN 일봉의 고가·저가·시가를 오염시킨다.
// 판정은 가격만 본다(2026-10-29 실데이터 — 걸린 쪽 거래량은 다음 10분 중앙값의 3%, 안 걸린 쪽 229% 로 저절로 갈렸다):
//   · 그날 최고가 분봉이 NXT 단독 시간이고, 그 분의 종가가 **다음 분봉 시가보다 3% 이상 높으면** 유령 → 그 분을 걷는다.
//   · 걷은 뒤 남은 분으로 되풀이 — 연속으로 튄 분(08:02·08:04 …)은 "다음 분"이 차례로 뒤로 밀려 함께 걷힌다.
//     극값이 여러 분에 같은 값으로 있으면 그중 걸리는 분부터 걷는다(남은 분이 같은 값이면 극값은 그대로).
//   · 저가는 거꾸로(종가가 다음 시가보다 3% 이상 낮으면).
//   · NXT 단독 = 정규장 밖(09:00 전·15:30 뒤)이고 그 분에 KRX 체결이 없다. 장중에 KRX 체결 없이 NXT 만 찍힌 분은 진짜
//     체결이라 보지 않는다(거래 드문 종목은 장중 분 사이 3% 도 흔하다). VI 뒤 단일가 체결도 장중이라 자연히 빠진다.
//   · 같은 분 안에서 튀고 내려온 꼴(시가=고가, 종가는 정상)은 걷지 않는다 — 종가 vs 다음 시가만 본다(사용자 결정).
//   · 그날 마지막 분이 극값이면 비교할 다음 분이 없어 걷지 않는다.
// 값은 분봉 그대로(원주가 스케일) — 일봉(수정주가)에 얹는 환산·범위 맞춤은 호출자 몫.
import type { MinuteCandle } from "./model.js";

/** 유령 판정 폭(%) — 종가와 다음 분봉 시가의 차이. */
export const GHOST_GAP_PCT = 3;

/** 걷어 낸 뒤의 UN 값(원주가 스케일). 걷힌 쪽만 값이 있다 — 없는 칸은 일봉 그대로. */
export interface GhostFix {
    open?: string;
    high?: string;
    low?: string;
    /** 걷은 분(HH:MM:SS) — 진단·표시용. */
    removed: string[];
}

/** 정규장 밖이고 KRX 체결이 없는 분. */
const nxtOnly = (c: MinuteCandle): boolean => c.krx === null && (c.time < "09:00:00" || c.time > "15:30:00");

/**
 * 그날 분봉(시간 오름차순, 채움 전 원본) → 유령을 걷은 UN 시가·고가·저가. 걷을 것이 없으면 null.
 * 일봉 UN 값과 비교하지 않는다 — 분봉이 말하는 것만 돌려주고, 일봉에 얹는 건 호출자가 한다.
 */
export function ghostFixOf(minutes: readonly MinuteCandle[], gapPct: number = GHOST_GAP_PCT): GhostFix | null {
    let m = minutes.filter((c) => Number(c.un.volume) > 0); // 무거래 채움 봉은 체결이 아니다
    const removed: MinuteCandle[] = [];
    let highHit = false;
    let lowHit = false;

    // 극값 분봉 중 유령이 있으면 하나 걷고 true. side 가 "high" 면 최고가, "low" 면 최저가.
    const tryRemove = (side: "high" | "low"): boolean => {
        if (m.length < 2) return false;
        const vals = m.map((c) => Number(c.un[side]));
        const ext = side === "high" ? Math.max(...vals) : Math.min(...vals);
        for (let i = 0; i < m.length - 1; i++) {
            if (vals[i] !== ext || !nxtOnly(m[i])) continue;
            const close = Number(m[i].un.close);
            const nextOpen = Number(m[i + 1].un.open);
            if (!(nextOpen > 0)) continue;
            // gap% ≥ gapPct 를 곱셈으로(경계 3.0% 에서 부동소수 나눗셈이 흔들리지 않게)
            const diff = side === "high" ? close - nextOpen : nextOpen - close;
            if (diff * 100 < gapPct * nextOpen) continue;
            removed.push(m[i]);
            m = m.filter((_, j) => j !== i);
            return true;
        }
        return false;
    };

    for (let changed = true; changed; ) {
        changed = false;
        if (tryRemove("high")) changed = highHit = true;
        if (tryRemove("low")) changed = lowHit = true;
    }
    if (removed.length === 0) return null;

    const fix: GhostFix = { removed: removed.map((c) => c.time).sort() };
    if (highHit) fix.high = m.reduce((a, c) => (Number(c.un.high) > Number(a) ? c.un.high : a), m[0].un.high);
    if (lowHit) fix.low = m.reduce((a, c) => (Number(c.un.low) < Number(a) ? c.un.low : a), m[0].un.low);
    // 시가 = 첫 체결. 첫 분이 걷혔으면 남은 첫 분의 시가.
    const first = minutes.find((c) => Number(c.un.volume) > 0);
    if (first && removed.includes(first)) fix.open = m[0].un.open;
    return fix;
}
