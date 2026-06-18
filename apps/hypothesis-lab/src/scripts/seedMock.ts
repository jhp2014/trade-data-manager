import { sql } from "drizzle-orm";
import { composeCaseId } from "../domain/caseId";
import {
    cases,
    hypotheses,
    hypothesisCases,
    hypothesisRelations,
    hypothesisTags,
    tags,
} from "../db/schema";
import { clearMock, connect, MOCK_MARKER, rowsOf, type Db } from "./_mock";

/**
 * review_target(종목·일자) + 그 안의 타점 시각들.
 * code 는 실데이터(uq_review_target_code_date)와 절대 충돌하지 않도록 합성 코드(MK####)를 쓴다.
 */
const REVIEW = [
    { code: "MK0001", name: "신한지주", date: "2026-06-05", times: ["09:11", "10:30"] },
    { code: "MK0002", name: "삼성전자", date: "2026-06-10", times: ["09:00", "13:20"] },
    { code: "MK0003", name: "카카오", date: "2026-06-12", times: ["09:45"] },
    { code: "MK0004", name: "에코프로", date: "2026-05-28", times: ["10:05", "14:00"] },
    { code: "MK0005", name: "에코프로비엠", date: "2026-06-15", times: ["09:30", "11:15"] },
    { code: "MK0003", name: "카카오", date: "2026-06-18", times: ["09:05"] },
    { code: "MK0001", name: "신한지주", date: "2026-06-18", times: ["13:40"] },
    { code: "MK0002", name: "삼성전자", date: "2026-06-19", times: ["09:10"] },
];

const HYPOTHESES = [
    { key: "H1", text: "끼 안좋고 대금 애매한 종목", status: "active" },
    { key: "H2", text: "대금은 약하지만 고점 유지 좋음", status: "active" },
    { key: "H3", text: "테마 대장 유지하며 눌림 지지", status: "active" },
    { key: "H4", text: "갭상승 후 첫 눌림 지지", status: "active" },
    { key: "H5", text: "장초반 급등 후 되돌림(관망)", status: "draft" },
    { key: "H6", text: "대금 부족 계열 (상위 개념)", status: "active" },
    { key: "H7", text: "고점 돌파 재시도", status: "draft" },
    { key: "H8", text: "분할 매도 구간", status: "archived" },
];

const TAGS = ["대금애매", "끼없음", "고점유지", "테마대장", "PASS후보"];

const HYP_TAGS: [string, string][] = [
    ["H1", "대금애매"], ["H1", "끼없음"],
    ["H2", "대금애매"], ["H2", "고점유지"],
    ["H3", "테마대장"], ["H3", "고점유지"],
    ["H4", "고점유지"],
    ["H5", "PASS후보"],
    ["H6", "대금애매"],
    ["H7", "고점유지"],
    ["H8", "PASS후보"],
];

const RELATIONS: { from: string; type: string; to: string; note: string | null }[] = [
    { from: "H2", type: "better_than", to: "H1", note: "고점 유지가 더 좋음" },
    { from: "H3", type: "better_than", to: "H1", note: null },
    { from: "H4", type: "better_than", to: "H2", note: "갭 지지가 더 강함" },
    { from: "H6", type: "parent_of", to: "H1", note: null },
    { from: "H6", type: "parent_of", to: "H3", note: null },
    { from: "H4", type: "similar_to", to: "H3", note: null },
    { from: "H7", type: "conflicts_with", to: "H8", note: "동시 성립 어려움" },
];

const LINKS: { h: string; case: string; outcome: string | null; note: string | null }[] = [
    { h: "H1", case: "MK0001-2026-06-05-0911", outcome: "fail", note: "대금 애매, 반응 약함" },
    { h: "H6", case: "MK0001-2026-06-05-0911", outcome: "watch", note: null },
    { h: "H2", case: "MK0002-2026-06-10-0900", outcome: "watch", note: "고점 유지 관찰" },
    { h: "H4", case: "MK0002-2026-06-10-1320", outcome: "good", note: "갭 후 첫 눌림 지지" },
    { h: "H3", case: "MK0002-2026-06-10-1320", outcome: "good", note: null },
    { h: "H3", case: "MK0004-2026-05-28-1005", outcome: "watch", note: null },
    { h: "H5", case: "MK0005-2026-06-15-0930", outcome: "pass", note: "되돌림 약함" },
    { h: "H7", case: "MK0002-2026-06-19-0910", outcome: "watch", note: null },
];

type CaseInfo = { caseId: string; stockCode: string; stockName: string; tradeDate: string; tradeTime: string };

function buildCaseInfo(): Map<string, CaseInfo> {
    const map = new Map<string, CaseInfo>();
    for (const t of REVIEW) {
        for (const time of t.times) {
            const caseId = composeCaseId({ stockCode: t.code, tradeDate: t.date, tradeTime: time });
            map.set(caseId, {
                caseId,
                stockCode: t.code,
                stockName: t.name,
                tradeDate: t.date,
                tradeTime: time,
            });
        }
    }
    return map;
}

async function seedReview(db: Db): Promise<void> {
    for (const t of REVIEW) {
        const res = await db.execute(sql`
            INSERT INTO public.review_target (stock_code, trade_date, stock_name, source_file)
            VALUES (${t.code}, ${t.date}, ${t.name}, ${MOCK_MARKER}) RETURNING id`);
        const targetId = rowsOf<{ id: string }>(res)[0].id;
        for (const time of t.times) {
            await db.execute(sql`
                INSERT INTO public.review_point (review_target_id, trade_time)
                VALUES (${targetId}, ${`${time}:00`})`);
        }
    }
}

async function seedHypothesis(db: Db, caseInfo: Map<string, CaseInfo>): Promise<void> {
    const tagId = new Map<string, bigint>();
    for (const name of TAGS) {
        const [row] = await db.insert(tags).values({ name }).returning({ id: tags.id });
        tagId.set(name, row.id);
    }

    const hypId = new Map<string, bigint>();
    for (const h of HYPOTHESES) {
        const [row] = await db
            .insert(hypotheses)
            .values({ text: h.text, status: h.status })
            .returning({ id: hypotheses.id });
        hypId.set(h.key, row.id);
    }

    for (const [h, tag] of HYP_TAGS) {
        await db.insert(hypothesisTags).values({ hypothesisId: hypId.get(h)!, tagId: tagId.get(tag)! });
    }

    for (const r of RELATIONS) {
        await db.insert(hypothesisRelations).values({
            fromHypothesisId: hypId.get(r.from)!,
            toHypothesisId: hypId.get(r.to)!,
            relationType: r.type,
            note: r.note,
        });
    }

    // 연결되는 case 만 스냅샷으로 입력(나머지는 review 후보로만 존재).
    const linkedCaseIds = [...new Set(LINKS.map((l) => l.case))];
    for (const caseId of linkedCaseIds) {
        const info = caseInfo.get(caseId);
        if (!info) throw new Error(`[mock] unknown linked caseId: ${caseId}`);
        await db.insert(cases).values({
            caseId: info.caseId,
            stockCode: info.stockCode,
            stockName: info.stockName,
            tradeDate: info.tradeDate,
            tradeTime: info.tradeTime,
        });
    }

    for (const l of LINKS) {
        await db.insert(hypothesisCases).values({
            hypothesisId: hypId.get(l.h)!,
            caseId: l.case,
            outcome: l.outcome,
            note: l.note,
        });
    }
}

async function main(): Promise<void> {
    const { db, close } = connect();
    try {
        await clearMock(db);
        const caseInfo = buildCaseInfo();
        await seedReview(db);
        await seedHypothesis(db, caseInfo);

        const points = REVIEW.reduce((n, t) => n + t.times.length, 0);
        const linked = new Set(LINKS.map((l) => l.case)).size;
        console.log(
            `[mock] seeded: review ${points}개(후보, 연결 ${linked}/미연결 ${points - linked}), ` +
                `가설 ${HYPOTHESES.length} · 태그 ${TAGS.length} · 관계 ${RELATIONS.length} · 연결 ${LINKS.length}`,
        );
    } finally {
        await close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
