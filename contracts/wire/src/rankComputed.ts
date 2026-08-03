// /rank-axes/computed 계약 — 계산 축(수식으로 나오는 축)의 타점별 수치.
// 판단 축(/rank-axes + /placements)과 달리 배치(slot·orderKey)를 서버가 만들지 않는다: 값만 준다.
// 줄 세우기(정렬·타이 묶기)와 순위·백분위는 **클라가 질의 시점에** 한다 — 모집단(필터 결과)이 화면마다 다르고,
// "전체 중 7등"과 "이 조건 안에서 3등"은 다른 값이라 서버가 미리 구우면 안 된다.
import type { AxisDisplay } from "@trade-data-manager/market";

export type { AxisDisplay };

export interface ComputedAxisPoint {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    value: number;
    /**
     * 상한이 안 잡힌 값(우측 절단) — `value` 는 참값이 아니라 하한이다. 자리(실측 최대 다음 칸)와 표기(∞)는
     * 모집단을 아는 **클라가** 정한다: 서버가 큰 상수로 굳히면 척도가 찌그러지고 모르는 걸 아는 척하게 된다.
     */
    saturated?: boolean;
}

export interface ComputedAxisFeed {
    /** 안정 식별자. 클라 축 id 는 `c:${key}` — 판단 축 id(DB bigserial)와 절대 겹치지 않게. */
    key: string;
    name: string;
    /** 강한 쪽(rank 1)이 큰 값인지 작은 값인지 — 클라가 orderKey 부호를 정한다. */
    strongerWhen: "higher" | "lower";
    /** 값 표시 규격(단위·자릿수·부호). 생략 = 등락률 모양 — 클라에 축별 단위 분기를 두지 않으려고 내려온다. */
    display?: AxisDisplay;
    /** 값이 있는 타점만. 결손 타점은 여기 없다 = 그 축에 미배치. */
    values: ComputedAxisPoint[];
}
