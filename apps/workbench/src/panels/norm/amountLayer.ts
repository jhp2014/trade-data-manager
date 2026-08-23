// 거래대금 층의 **재료** — 정규화 겹치기에서 "그 분에 돈이 얼마나 들어왔나".
//
// ⚠ 캔들 층과 성격이 다르다. 캔들은 상태 하나에 매달린 독립 층이라 통째로 떨어졌지만, 여기 조회기는
// **세 소비자가 나눠 쓴다**: 골격선 굵기 · 테마선 굵기 · 세로선 판독 칩(누적 대금). 그래서 이 파일은
// "층"이 아니라 **공용 재료**다 — 셋 중 하나를 떼어 옮겨도 나머지 둘이 같은 자를 계속 쓴다.
//
// 조회기가 함수를 돌려주는 이유(맵이 아니라): 종목마다 시각 색인을 만드는 비용이 있는데 실제로 값을
// 묻는 종목은 화면에 뜬 몇 개뿐이다. 코드별로 **처음 물을 때 만들고 캐시**해 안 쓰는 종목은 안 짓는다.
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import type { DayReplay } from "@trade-data-manager/wire";
import { minuteAmountOf, minuteIndexOf } from "./overlay.js";
// 굵기 척도는 canvas 공용(테이프와 같은 자) — 재수출해 이 디렉터리의 소비자는 여기 하나만 본다.
export { amountLevelOf, runWidth } from "../canvas/amountScale.js";

/** 분당 거래대금 조회기 — 없으면 null(그날 유니버스 밖). 있는 것만 값을 준다. */
export type MinuteAmountAt = ((minute: number) => number | null) | null;

/**
 * 금액 라벨의 자리 규칙(화면 px). `w` = 가로 격자 한 칸이자 **겹침 판정 밴드 폭**(라벨 폭과 같게 잡아
 * 한 밴드 안은 반드시 겹치고 밴드끼리는 안 겹치게), `gap` = 세로로 벌릴 때의 최소 간격.
 */
export const AMOUNT_LABEL_CELL = { w: 52, gap: 12 };

export interface AmountLookup {
    /** 종목코드 → 분당 거래대금 조회기. 골격 선과 테마 선이 같은 자를 쓴다. */
    amountAt: (code: string) => MinuteAmountAt;
    /** 종목코드 → **누적** 거래대금 조회기. 판독 칩을 뽑는 기준(그 시각까지 돈이 얼마나 몰렸나). */
    cumAt: (code: string) => MinuteAmountAt;
}

/**
 * 그날 스냅샷에서 두 조회기를 만든다. 스냅샷이 바뀔 때만 새로 — 캐시가 그 안에 살아서 같은 스냅샷
 * 동안은 종목당 색인을 한 번만 짓는다.
 *
 * 순수 함수다(훅이 아니다) — 부르는 쪽이 `useMemo(() => amountLookupOf(snap), [snap])` 로 감싼다.
 * 스냅샷을 어디서 얻는지(쿼리·조건부 로딩)는 화면의 사정이라 여기 안 들인다.
 */
export function amountLookupOf(snapshot: DayReplay | undefined): AmountLookup {
    const perMinute = new Map<string, MinuteAmountAt>();
    const cumulative = new Map<string, MinuteAmountAt>();
    const stockOf = (code: string): DayReplay["stocks"][number] | undefined =>
        snapshot?.stocks.find((x) => x.code === code);

    return {
        amountAt: (code) => {
            const hit = perMinute.get(code);
            if (hit !== undefined) return hit;
            const st = stockOf(code);
            // 그날 유니버스 밖(거래대금·등락률 조건 미달) — 없는 값을 0으로 지어내지 않는다.
            const fn = st ? minuteAmountOf(minuteIndexOf(st.times, minuteOfDayOf), st.cumAmount) : null;
            perMinute.set(code, fn);
            return fn;
        },
        cumAt: (code) => {
            const hit = cumulative.get(code);
            if (hit !== undefined) return hit;
            const st = stockOf(code);
            const idx = st ? minuteIndexOf(st.times, minuteOfDayOf) : null;
            const fn = st && idx
                ? (m: number): number | null => {
                    const i = idx.get(m);
                    return i == null ? null : st.cumAmount[i];
                }
                : null;
            cumulative.set(code, fn);
            return fn;
        },
    };
}
