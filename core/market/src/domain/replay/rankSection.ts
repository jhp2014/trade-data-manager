// 순위 단면 — 어느 (날짜, 분)의 그날 유니버스 전 종목 등락률·거래대금 **서수 전체**(순수, I/O 0).
//
// N/M(top-N 컷)은 여기 없다 — 서수 원료만 굽고 존(zone)·테마 강도·임계값은 전부 소비자의 읽기 시점
// 파생이다(decisions.md "테마 강도·순위 단면"). 그래서 캐시가 N/M 에 불변이고, 시트 테마 멤버십처럼
// 가변인 것도 여기 안 들어온다.
//
// **서버가 굽는 서수와 클라가 /day-replay 로 즉석 계산하는 서수는 이 한 벌이어야 한다** — 갈리면 같은
// 화면에서 N/M 이 두 개가 된다(minuteOfDayOf 를 유일 변환자로 묶은 것과 같은 이유). 그래서:
//  · 시점 값 = lastIndexAtOrBefore(carry-forward) — 그 분 이전 데이터가 하나라도 있으면 참가(마지막 값),
//    없으면 결손(null, 분모 제외). 복기 보드의 snapshotAt 이 이미 이 규칙이다 — 정지 종목이 분모에서
//    빠지면 두 화면의 M 이 갈린다.
//  · 시각 → t 변환 = kstToUnix — times[i] 가 kstToUnix(date, time) 산(産)이라(deriveMinutes) 같은
//    함수로 되짚으면 오프셋 산술 자체가 없다.
import type { MinuteDerived } from "./dayReplay.js";
import { kstToUnix } from "../kst.js";

/** times 에서 t 이하 마지막 인덱스(이진탐색). 없으면 -1. 복기 보드 시점 스냅샷과 같은 자다. */
export function lastIndexAtOrBefore(times: readonly number[], t: number): number {
    let lo = 0;
    let hi = times.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

/**
 * 내림차순 서수(1-base) — 입력 순서를 보존한 배열로 돌려준다(입력[i]의 순위 = 출력[i]).
 * 동점은 **경쟁 순위**(같은 서수, 다음 서수 건너뜀 — 1,1,3): rate 는 소수 2자리 반올림 값이라 동점이
 * 실제로 나는데, 코드 사전순 따위로 억지로 가르면 "테마 내 3위 이내" 같은 조건이 임의로 갈린다.
 * null·비유한값 = 결손 — 서수도 null 이고 분모에서 빠진다(다른 값의 서수를 밀지 않는다).
 */
export function descendingOrdinals(values: readonly (number | null)[]): (number | null)[] {
    const present: { v: number; i: number }[] = [];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v !== null && Number.isFinite(v)) present.push({ v, i });
    }
    present.sort((a, b) => b.v - a.v);
    const out = new Array<number | null>(values.length).fill(null);
    for (let k = 0; k < present.length; k++) {
        out[present[k].i] = k > 0 && present[k].v === present[k - 1].v ? out[present[k - 1].i] : k + 1;
    }
    return out;
}

/** 단면 하나 — 배열들은 입력 stocks 와 같은 길이·같은 순서(코드 테이블은 호출측이 든다). */
export interface RankSection {
    /** 단면 시각 "HH:MM" — 타점 시각의 분 절단(그 분 봉의 종가 기준). */
    time: string;
    /** 분모 — 등락률 서수의 non-null 수(deriveMinutes 산 값은 전부 유한이라 "참가 종목 수"와 동치). */
    n: number;
    /** 등락률 서수(1=최고 등락률). null = 결손. */
    rate: (number | null)[];
    /** 누적 거래대금 서수(1=최대). null = 결손. */
    amount: (number | null)[];
}

/**
 * (날짜, 분)의 순위 단면. `time` 은 "HH:MM" 또는 "HH:MM:SS" — **분으로 절단해** 계산·표기한다
 * (타점 HH:MM:SS 를 그대로 넣어도 같은 분 타점들이 단면 하나를 나눠 쓴다. 절단을 호출측에 맡기면
 * "09:30:00:00" 같은 합성이 NaN 으로 새어 전부 결손인 **정상 모양의 틀린 단면**이 조용히 나온다).
 * stocks 는 쓰는 필드만 Pick — 서버(DaySnapshotFile)와 클라(와이어 ReplayStock) 어느 쪽 모양으로도 호출 가능.
 */
export function rankSectionOf(
    stocks: readonly Pick<MinuteDerived, "code" | "times" | "rate" | "cumAmount">[],
    date: string,
    time: string,
): RankSection {
    const hhmm = time.slice(0, 5);
    const t = kstToUnix(date, `${hhmm}:00`);
    const rateVals = new Array<number | null>(stocks.length);
    const amountVals = new Array<number | null>(stocks.length);
    for (let k = 0; k < stocks.length; k++) {
        const s = stocks[k];
        const i = lastIndexAtOrBefore(s.times, t);
        if (i < 0) {
            rateVals[k] = null;
            amountVals[k] = null;
            continue;
        }
        rateVals[k] = s.rate[i];
        amountVals[k] = s.cumAmount[i];
    }
    const rate = descendingOrdinals(rateVals);
    let n = 0;
    for (const v of rate) if (v !== null) n++;
    return { time: hhmm, n, rate, amount: descendingOrdinals(amountVals) };
}
