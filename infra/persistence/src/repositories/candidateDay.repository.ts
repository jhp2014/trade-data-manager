import { sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import type { CandidateDay, CandidateDayReader, CandidateTrace } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { chartAnchors, chartTags, mapPlacements, reviewPoints } from "../schema/curation.js";

/**
 * Drizzle 구현 — 후보 하루 = 큐레이션 편집물들의 (종목, 날짜) **합집합**.
 * 저장하지 않고 매번 파생한다(별도 테이블을 두면 흔적이 늘고 줄 때마다 동기화 사고가 난다 — 규칙은
 * domain/review/candidateDay.ts).
 *
 * 갈래마다 DISTINCT 한 뒤 UNION ALL 로 **한 번에** 받는다(갈래별 왕복 4회가 아니라 1회 — Supabase 왕복이
 * 아깝고, 갈래가 늘어도 왕복은 그대로다). 접기는 앱에서: 갈래별 DISTINCT 라 (종목·날짜·근거)가 유일하므로
 * 키당 traces 는 중복 없이 쌓인다.
 *
 * ⚠ 갈래를 추가·삭제할 때 여기와 CandidateTrace 를 같이 고칠 것 — 유니버스는 단일 출처라는 게 규칙의 절반이다.
 * (`chart_anchors` 는 param 이 baseline·skeleton·skeleton-minute 을 다 담는 단일 테이블이라 갈래 하나로 족하다.)
 */
export class DrizzleCandidateDayRepository implements CandidateDayReader {
    constructor(private readonly db: Database) {}

    async listCandidateDays(): Promise<CandidateDay[]> {
        const rows = await unionAll(
            this.db
                .selectDistinct({ stockCode: chartAnchors.stockCode, date: chartAnchors.tradeDate, trace: sql<string>`'anchor'` })
                .from(chartAnchors),
            this.db
                .selectDistinct({ stockCode: chartTags.stockCode, date: chartTags.tradeDate, trace: sql<string>`'chartGroup'` })
                .from(chartTags),
            this.db
                .selectDistinct({ stockCode: reviewPoints.stockCode, date: reviewPoints.tradeDate, trace: sql<string>`'reviewPoint'` })
                .from(reviewPoints),
            this.db
                .selectDistinct({ stockCode: mapPlacements.stockCode, date: mapPlacements.tradeDate, trace: sql<string>`'mapPlacement'` })
                .from(mapPlacements),
        );

        const byKey = new Map<string, CandidateDay>();
        for (const r of rows) {
            const key = `${r.stockCode}|${r.date}`;
            const hit = byKey.get(key);
            if (hit) hit.traces.push(r.trace as CandidateTrace);
            else byKey.set(key, { stockCode: r.stockCode, date: r.date, traces: [r.trace as CandidateTrace] });
        }
        // 정렬을 서버가 고정한다(날짜 내림차순 → 종목) — 화면마다 순서가 흔들리지 않게.
        return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.stockCode.localeCompare(b.stockCode));
    }
}
