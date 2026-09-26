// 순위 단면 — 어느 (날짜, 분)의 그날 유니버스 전 종목 등락률·거래대금 **서수 전체**(순수, I/O 0).
//
// N/M(top-N 컷)은 여기 없다 — 서수 원료만 굽고 존(zone)·테마 판정·임계값은 전부 소비자의 읽기 시점
// 파생이다(decisions.md "테마 술어·순위 단면"). 그래서 계산이 N/M 에 불변이고, 시트 테마 멤버십처럼
// 가변인 것도 여기 안 들어온다. (옛 서버 사전계산은 2026-09-26 은퇴 — 소비자는 클라 /day-replay 즉석 계산 하나.)
//
// **이 서수를 쓰는 모든 화면(테마 순위 판·타점 정보·셀 엔진)은 이 한 벌을 봐야 한다** — 재계산기가
// 갈리면 같은 화면에서 N/M 이 두 개가 된다(minuteOfDayOf 를 유일 변환자로 묶은 것과 같은 이유). 그래서:
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

/** 시점 값 단면 — 서수를 매기기 전의 원값(carry-forward 적용). 배열은 stocks 순서. */
export interface SectionValues {
    /** 단면 시각 "HH:MM". */
    time: string;
    /** 등락률 %(전일 종가 대비). null = 결손(그 분 이전 데이터 없음). */
    rate: (number | null)[];
    /** 당일 누적 거래대금(원). null = 결손. */
    cumAmount: (number | null)[];
}

/** 단면에 넣는 종목 모양 — 서버(DaySnapshotFile)·클라(와이어 ReplayStock) 공용 Pick. */
export type SectionStock = Pick<MinuteDerived, "code" | "times" | "rate" | "cumAmount">;

const truncMin = (time: string): string => time.slice(0, 5);

/**
 * (날짜, 분)의 시점 값 단면 — rankSectionOf 의 값 층을 그대로 노출한다(값 산점·창 계산의 재료).
 * carry-forward·분 절단·kstToUnix 규칙은 서수 단면과 한 벌이다(여기서 갈리면 자리와 값이 어긋난다).
 */
export function sectionValuesOf(stocks: readonly SectionStock[], date: string, time: string): SectionValues {
    const hhmm = truncMin(time);
    const t = kstToUnix(date, `${hhmm}:00`);
    const rate = new Array<number | null>(stocks.length);
    const cumAmount = new Array<number | null>(stocks.length);
    for (let k = 0; k < stocks.length; k++) {
        const s = stocks[k];
        const i = lastIndexAtOrBefore(s.times, t);
        if (i < 0) {
            rate[k] = null;
            cumAmount[k] = null;
            continue;
        }
        rate[k] = s.rate[i];
        cumAmount[k] = s.cumAmount[i];
    }
    return { time: hhmm, rate, cumAmount };
}

/**
 * T-창 누적 거래대금(원) — 그 분까지의 누적에서 T분 전까지의 누적을 뺀 값(창 = (t−T, t], 봉 T개).
 * 시작 경계는 **0 기준**(2026-09-16 확정): t−T 가 그 종목 첫 봉보다 이르면 당일 누적 전체다 —
 * 장 초반을 결손으로 만들면 "아침/오후 공정 비교"라는 창의 존재 이유가 아침을 잃는다.
 * 결손(그 분 이전 데이터 자체가 없음) = null. 클라 표시와 서버 굽기가 **이 함수 하나**를 쓴다
 * (서수 출처 단일화의 연장 — 여기서 두 벌이 되면 "타점 분에서만 미묘하게 다른 값"이 재발한다).
 */
export function windowedAmounts(
    stocks: readonly SectionStock[],
    date: string,
    time: string,
    windowMin: number,
): (number | null)[] {
    const t = kstToUnix(date, `${truncMin(time)}:00`);
    const t0 = t - windowMin * 60;
    const out = new Array<number | null>(stocks.length);
    for (let k = 0; k < stocks.length; k++) {
        const s = stocks[k];
        const i = lastIndexAtOrBefore(s.times, t);
        if (i < 0) {
            out[k] = null;
            continue;
        }
        const j = lastIndexAtOrBefore(s.times, t0);
        out[k] = s.cumAmount[i] - (j >= 0 ? s.cumAmount[j] : 0);
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
    stocks: readonly SectionStock[],
    date: string,
    time: string,
): RankSection {
    const vals = sectionValuesOf(stocks, date, time);
    const rate = descendingOrdinals(vals.rate);
    let n = 0;
    for (const v of rate) if (v !== null) n++;
    return {
        time: vals.time,
        n,
        rate,
        amount: descendingOrdinals(vals.cumAmount),
    };
}
