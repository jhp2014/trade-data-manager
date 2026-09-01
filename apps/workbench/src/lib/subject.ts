// 선택 대상(subject) 단일 계약 — "패널들이 지금 무엇을 보여줘야 하나"의 답 한 곳.
//
// subject.time = focus.time 이 **그 차트의 자동 타점**일 때 그 시각, 아니면 null(하루 선택).
// 이 판정을 패널마다 재현하면 "무엇이 선택인가"의 답이 패널 수만큼 생긴다 — 그래서 훅 하나가 진다.
//
// 옛 `activePoint`(선택을 따로 저장하던 상태)는 2026-09-01 폐지됐다. 타점이 격자 파생물이 되면서
// 저장할 것이 없어졌기 때문이다 — 정의 노브를 돌려 그 타점이 사라지면 선택도 조용히 하루로 내려간다
// (정직한 동작). a/d 로 봉을 옮기다 자동 타점 위에 서면 그 순간 타점 선택이 된다.
//
// time 이 null 인 subject 는 **하루 선택**이다 — 하루는 타점의 일종이 아니라 별도 상태다
// (소비자는 time 으로 갈라 읽는다).
//
// 상태(status)는 3치다 — 패널마다 정의역(그릴 수 있는 집합)이 달라서, subject 가 정의역 밖일 때
// "왜 안 보이나"를 구분해 말해야 한다:
//   · shown    — 지금 이 패널에 그려져 있다(배지 없음)
//   · filtered — 재료는 있는데 지금 필터에서 빠졌다
//   · absent   — 재료 자체가 없다(타점 없음·골격 미작성·결손 — 패널이 말을 고른다)
// 판정 재료(전체·표시 집합)는 패널이 이미 들고 있으므로 여기는 **불리언 둘 → 3치** 접기만 소유한다.
import { useMemo } from "react";
import { minuteToHms } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import { autoPointsOfChart, useAutoPoints } from "./PointGridsContext.js";
import { chartKeyOf, pointKeyOf } from "./pointKey.js";

export interface Subject {
    code: string;
    date: string; // YYYY-MM-DD
    /** null = 하루 선택(타점 아님). */
    time: string | null;
}

/**
 * focus 의 (종목,날짜) + 시각 판정. 종목이 비어 있으면 null(초기 상태).
 * ⚠ 격자(PointGridsProvider)에 의존한다 — 로딩 중엔 하루로 보였다가 타점으로 바뀐다(무해).
 */
export function useSubject(): Subject | null {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const time = useWorkbench((s) => s.focus.time);
    const auto = useAutoPoints();
    const derived = autoPointsOfChart(auto, code, date);
    return useMemo(() => {
        if (!code) return null;
        // **분 절단으로 비교**한다 — 단면 조회(useRankSections)와 같은 자를 써야 초가 붙은 setTime
        // 호출자(뉴스 점프 등)의 시각이 조용히 "타점 아님"으로 떨어지지 않는다.
        const isPoint = time !== null && derived.some((p) => minuteToHms(p.min).slice(0, 5) === time.slice(0, 5));
        return { code, date, time: isPoint ? time : null };
    }, [code, date, time, derived]);
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
