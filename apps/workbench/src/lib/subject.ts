// 선택 대상(subject) 단일 계약 — "패널들이 지금 무엇을 보여줘야 하나"의 답 한 곳.
//
// subject = activePoint(타점을 골랐다) ?? focus 의 (종목,날짜)(하루만 골랐다). 이 폴백을 패널마다
// 재현하면 "타점이 없을 때 무엇이 선택인가"의 답이 패널 수만큼 생긴다 — 그래서 훅 하나가 조립한다.
//
// time 이 null 인 subject 는 **하루 선택**이다. ActivePoint 의 time 을 nullable 로 넓히지 않은 것과
// 같은 이유로, 여기서도 하루는 타점의 일종이 아니라 별도 상태다(소비자는 time 으로 갈라 읽는다).
//
// 상태(status)는 3치다 — 패널마다 정의역(그릴 수 있는 집합)이 달라서, subject 가 정의역 밖일 때
// "왜 안 보이나"를 구분해 말해야 한다:
//   · shown    — 지금 이 패널에 그려져 있다(배지 없음)
//   · filtered — 재료는 있는데 지금 필터에서 빠졌다
//   · absent   — 재료 자체가 없다(타점 없음·골격 미작성·결손 — 패널이 말을 고른다)
// 판정 재료(모집단·표시 집합)는 패널이 이미 들고 있으므로 여기는 **불리언 둘 → 3치** 접기만 소유한다.
import { useMemo } from "react";
import { useWorkbench } from "../store/workbench.js";
import { chartKeyOf, pointKeyOf } from "./pointKey.js";

export interface Subject {
    code: string;
    date: string; // YYYY-MM-DD
    /** null = 하루 선택(타점 아님). */
    time: string | null;
}

/** activePoint 우선, 없으면 focus 의 하루. 종목이 비어 있으면 null(초기 상태). */
export function useSubject(): Subject | null {
    const activePoint = useWorkbench((s) => s.activePoint);
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    return useMemo(() => {
        if (activePoint) return { code: activePoint.code, date: activePoint.date, time: activePoint.time };
        return code ? { code, date, time: null } : null;
    }, [activePoint, code, date]);
}

export type SubjectStatus = "shown" | "filtered" | "absent";

/** 불리언 둘 → 3치. shown ⊆ inData 가 전제다(그려져 있는데 재료가 없을 수는 없다). */
export const subjectStatus = (inData: boolean, shown: boolean): SubjectStatus =>
    shown ? "shown" : inData ? "filtered" : "absent";

/** subject 의 차트 키 — 차트 단위 정의역(골격 일봉 등)과의 대조용. */
export const subjectChartKey = (s: Subject): string => chartKeyOf(s.code, s.date);

/**
 * subject 의 타점 키들 — 타점 단위 정의역(시트·골격 분봉)과의 대조용.
 * 하루 선택이면 **그날 전 타점**이 곧 선택이다(사용자 확정: 분봉 골격에서 그 날짜의 골격 모두 선택).
 */
export const subjectPointKeys = (s: Subject, timesOfChart: readonly string[]): string[] =>
    s.time !== null ? [pointKeyOf(s.code, s.date, s.time)] : timesOfChart.map((t) => pointKeyOf(s.code, s.date, t));
