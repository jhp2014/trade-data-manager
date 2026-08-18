// 사이드바의 순수 계산 — 바인딩된 집합의 멤버를 **패널 층위로 변환**하고 표현됨/안 됨으로 가른다.
//
// 패널도 소비자로서 자기 결손을 센다: 골격이 집합 30개 중 피벗 있는 12개만 그리면서 그 사실을 안
// 보여주면, "이 그룹의 형태"가 아니라 "이 그룹 중 골격 그린 것들의 형태"를 보면서 그걸 모르게 된다 —
// 깔때기의 "미배치를 조용히 떨구지 않는다"가 패널로 확장된 것이다.
//
// 층위 변환 법칙 그대로:
//   · 패널이 day  → 투영(∃): 타점들이 제 하루로 접히고 **pointCount 가 낱알을 병기**한다(손실 표식).
//   · 패널이 point → 전개(∀): 하루 항목은 그날 타점 전부로. **타점 0인 하루는 시각 없는 행으로 남아
//     "표현 안 됨"에 선다**(조용한 소멸 금지 — 그 하루가 집합의 멤버라는 사실은 변하지 않는다).
import type { FunnelItem, Grain } from "@trade-data-manager/market/domain";
import { projectToDayFolds } from "../../lib/grainView.js";
import { chartKey } from "../../lib/pointKey.js";
import type { ViewedSet } from "./useFilterFunnel.js";
import { sortItems } from "./resultRows.js";

export interface SetMember {
    stockCode: string;
    date: string;
    time?: string;
    /** 이 패널이 표현할 수 있나(그릴 재료가 있나). false 항목이 곧 이 패널의 결손 목록이다. */
    ok: boolean;
    /** day 층위 전용 — 이 날로 접힌 타점 수(투영의 손실 병기). 0 = 원래부터 하루 항목. */
    pointCount?: number;
}

export interface SetMembers {
    members: SetMember[];
    okCount: number;
    total: number;
}

/**
 * 멤버 목록 한 벌. represented = 패널별 표현가능 술어(없으면 전부 표현됨 — 항목을 직접 안 그리는 패널).
 * 목록은 결과 목록과 같은 정렬(sortItems — 최근 날짜 먼저, 같은 차트는 붙는다).
 */
export function setMembersOf(
    view: ViewedSet,
    grain: Grain,
    represented?: (item: FunnelItem) => boolean,
): SetMembers {
    const members: SetMember[] = [];
    if (grain === "day") {
        for (const f of projectToDayFolds(sortItems(view.viewedItems))) {
            const item = { stockCode: f.stockCode, date: f.date };
            members.push({ ...item, ok: represented?.(item) ?? true, pointCount: f.pointCount });
        }
    } else {
        // 전개는 viewedPointRefs 가 이미 해뒀다(뷰 계약). 타점 0인 하루만 여기서 되살린다.
        const chartsWithPoints = new Set(view.viewedPointRefs.map((p) => chartKey(p)));
        for (const p of sortItems(view.viewedPointRefs)) {
            members.push({ stockCode: p.stockCode, date: p.date, time: p.time, ok: represented?.(p) ?? true });
        }
        for (const it of sortItems(view.viewedItems)) {
            if (it.time !== undefined || chartsWithPoints.has(chartKey(it))) continue;
            members.push({ stockCode: it.stockCode, date: it.date, ok: false }); // 타점 없음 — 이 층위의 결손
        }
    }
    return { members, okCount: members.filter((m) => m.ok).length, total: members.length };
}
