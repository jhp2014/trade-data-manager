// 층위 변환 법칙 — **판정은 집합의 고유 층위에서, 표시는 패널 층위로.**
//
//   · 내림(day→point) = **전개(∀)**: 하루 항목은 그날 타점 전부로 — 하루 조건은 전 타점에 같은 값이라
//     정직한 반복이다(무손실). 타점 0인 하루는 대표가 없어 결과에서 빠진다 — 조용한 소멸이 아니라
//     패널 사이드바의 "표현 안 됨" 칸이 받는 결손이다.
//   · 올림(point→day) = **투영(∃)**: 타점 항목은 제 하루로 접힌다 — "멤버 타점이 사는 날"이지 그 날이
//     통째로 멤버라는 뜻이 아니다. **손실**이므로 접힌 낱알 수(pointCount)를 병기해야 한다
//     (전개했다 투영하면 원본보다 커지는 걸 눈이 잡을 수 있게).
//
// 깔때기의 "AND 판정은 가장 가는 grain, 표시는 지금 보는 칸"과 같은 규칙의 집합 일반화다.
import { funnelKey, type FunnelItem } from "@trade-data-manager/market/domain";
import { chartKey } from "./pointKey.js";

/**
 * 전개 — 항목들을 타점 층위로 내린다. 시각 있는 항목은 그대로, 하루 항목은 그날 타점 전부로.
 * 같은 타점이 두 경로로 오면(하루 전개 + 타점 직접) 하나로 접는다.
 */
export function expandToPointItems(
    items: readonly FunnelItem[],
    timesOf: (item: { stockCode: string; date: string }) => readonly string[],
): FunnelItem[] {
    const seen = new Set<string>();
    const out: FunnelItem[] = [];
    const push = (i: FunnelItem): void => {
        const k = funnelKey(i);
        if (seen.has(k)) return;
        seen.add(k);
        out.push(i);
    };
    for (const it of items) {
        if (it.time !== undefined) push(it);
        else for (const t of timesOf(it)) push({ stockCode: it.stockCode, date: it.date, time: t });
    }
    return out;
}

/** 투영된 하루 한 장 — pointCount = 이 날로 접힌 타점 수(0 = 원래부터 하루 항목, 손실 없음). */
export interface DayFold {
    stockCode: string;
    date: string;
    pointCount: number;
}

/**
 * 투영 — 항목들을 하루 층위로 올린다(∃). 첫 등장 순서를 지킨다(호출부의 정렬을 존중).
 * 하루 항목과 그날 타점이 같이 오면 한 장으로 접히고 pointCount 는 타점 쪽만 센다.
 */
export function projectToDayFolds(items: readonly FunnelItem[]): DayFold[] {
    const byChart = new Map<string, DayFold>();
    const out: DayFold[] = [];
    for (const it of items) {
        const k = chartKey(it);
        let fold = byChart.get(k);
        if (!fold) {
            fold = { stockCode: it.stockCode, date: it.date, pointCount: 0 };
            byChart.set(k, fold);
            out.push(fold);
        }
        if (it.time !== undefined) fold.pointCount++;
    }
    return out;
}
