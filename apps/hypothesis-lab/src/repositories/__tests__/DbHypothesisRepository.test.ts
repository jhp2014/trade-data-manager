import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DbHypothesisRepository } from "@/repositories/DbHypothesisRepository";
import {
    createTestDb,
    resetHypothesisTables,
    type TestDb,
} from "@/test-support/testDb";

let testDb: TestDb;
let repo: DbHypothesisRepository;

beforeAll(async () => {
    testDb = await createTestDb();
    repo = new DbHypothesisRepository(testDb.db);
});

afterAll(async () => {
    await testDb.close();
});

beforeEach(async () => {
    await resetHypothesisTables(testDb.db);
});

const CASE = {
    caseId: "055550-2026-06-05-0911",
    stockCode: "055550",
    stockName: "신한지주",
    tradeDate: "2026-06-05",
    tradeTime: "09:11",
};

describe("createHypothesis", () => {
    it("표시코드 H1 을 반환하고 스냅샷에 반영된다", async () => {
        const { id, code } = await repo.createHypothesis({
            text: "끼 안좋고 대금 애매한 종목",
        });
        expect(code).toBe("H1");

        const snap = await repo.loadSnapshot();
        expect(snap.hypotheses).toHaveLength(1);
        expect(snap.hypotheses[0]).toMatchObject({
            id,
            code: "H1",
            text: "끼 안좋고 대금 애매한 종목",
            status: "draft",
        });
    });

    it("연속 생성 시 코드가 증가한다", async () => {
        const a = await repo.createHypothesis({ text: "A" });
        const b = await repo.createHypothesis({ text: "B" });
        expect(a.code).toBe("H1");
        expect(b.code).toBe("H2");
    });
});

describe("updateHypothesis", () => {
    it("text/status 를 부분 갱신한다", async () => {
        const { id } = await repo.createHypothesis({ text: "초안" });
        await repo.updateHypothesis({ id, status: "active" });

        const snap = await repo.loadSnapshot();
        expect(snap.hypotheses[0]).toMatchObject({ text: "초안", status: "active" });
    });
});

describe("ensureCase", () => {
    it("insert-if-absent — 두 번째 호출은 기존 값을 덮지 않는다", async () => {
        await repo.ensureCase(CASE);
        await repo.ensureCase({ ...CASE, stockName: "다른이름" });

        const snap = await repo.loadSnapshot();
        expect(snap.cases).toHaveLength(1);
        expect(snap.cases[0].stockName).toBe("신한지주");
        expect(snap.cases[0].tradeTime).toBe("09:11");
    });

    it("시각 없는 case(tradeTime null)도 허용한다", async () => {
        await repo.ensureCase({
            caseId: "055550-2026-06-05",
            stockCode: "055550",
            tradeDate: "2026-06-05",
        });
        const snap = await repo.loadSnapshot();
        expect(snap.cases[0].tradeTime).toBeNull();
    });
});

describe("refreshCaseStockName", () => {
    it("stockName 만 명시적으로 갱신한다", async () => {
        await repo.ensureCase(CASE);
        await repo.refreshCaseStockName({ caseId: CASE.caseId, stockName: "신한지주(신)" });

        const snap = await repo.loadSnapshot();
        expect(snap.cases[0].stockName).toBe("신한지주(신)");
    });
});

describe("upsertCaseLink", () => {
    it("연결을 만들고 note 를 on-conflict 로 갱신한다", async () => {
        const { id } = await repo.createHypothesis({ text: "H" });
        await repo.ensureCase(CASE);

        await repo.upsertCaseLink({ hypothesisId: id, caseId: CASE.caseId, note: "관찰" });
        await repo.upsertCaseLink({ hypothesisId: id, caseId: CASE.caseId, note: "반응 약함" });

        const snap = await repo.loadSnapshot();
        expect(snap.hypothesisCases).toHaveLength(1);
        expect(snap.hypothesisCases[0]).toMatchObject({
            hypothesisId: id,
            caseId: CASE.caseId,
            note: "반응 약함",
        });
    });
});

describe("setCaseOutcome", () => {
    it("케이스 레벨 outcome 을 설정하고 null 로 해제한다", async () => {
        await repo.ensureCase(CASE);

        await repo.setCaseOutcome({ caseId: CASE.caseId, outcome: "win" });
        let snap = await repo.loadSnapshot();
        expect(snap.cases[0].outcome).toBe("win");

        await repo.setCaseOutcome({ caseId: CASE.caseId, outcome: null });
        snap = await repo.loadSnapshot();
        expect(snap.cases[0].outcome).toBeNull();
    });
});

describe("addTag", () => {
    it("이름으로 태그를 보장하고 연결하며 중복 연결은 무시한다", async () => {
        const { id } = await repo.createHypothesis({ text: "H" });
        await repo.addTag({ hypothesisId: id, tagName: "대금애매" });
        await repo.addTag({ hypothesisId: id, tagName: "대금애매" });

        const snap = await repo.loadSnapshot();
        expect(snap.tags).toHaveLength(1);
        expect(snap.tags[0].name).toBe("대금애매");
        expect(snap.hypothesisTags).toHaveLength(1);
    });

    it("같은 태그를 다른 가설들이 공유한다", async () => {
        const a = await repo.createHypothesis({ text: "A" });
        const b = await repo.createHypothesis({ text: "B" });
        await repo.addTag({ hypothesisId: a.id, tagName: "공유" });
        await repo.addTag({ hypothesisId: b.id, tagName: "공유" });

        const snap = await repo.loadSnapshot();
        expect(snap.tags).toHaveLength(1);
        expect(snap.hypothesisTags).toHaveLength(2);
    });
});

describe("upsertRelation", () => {
    it("관계를 만들고 note 를 on-conflict 로 갱신한다", async () => {
        const a = await repo.createHypothesis({ text: "A" });
        const b = await repo.createHypothesis({ text: "B" });

        await repo.upsertRelation({
            fromHypothesisId: b.id,
            toHypothesisId: a.id,
            relationType: "better_than",
            note: "초기",
        });
        await repo.upsertRelation({
            fromHypothesisId: b.id,
            toHypothesisId: a.id,
            relationType: "better_than",
            note: "수정",
        });

        const snap = await repo.loadSnapshot();
        expect(snap.hypothesisRelations).toHaveLength(1);
        expect(snap.hypothesisRelations[0]).toMatchObject({
            fromHypothesisId: b.id,
            toHypothesisId: a.id,
            relationType: "better_than",
            note: "수정",
        });
    });
});

describe("cascade 삭제", () => {
    it("가설 삭제 시 연결(tags/cases/relations)이 함께 사라진다", async () => {
        const a = await repo.createHypothesis({ text: "A" });
        const b = await repo.createHypothesis({ text: "B" });
        await repo.ensureCase(CASE);
        await repo.upsertCaseLink({ hypothesisId: a.id, caseId: CASE.caseId });
        await repo.addTag({ hypothesisId: a.id, tagName: "t" });
        await repo.upsertRelation({
            fromHypothesisId: a.id,
            toHypothesisId: b.id,
            relationType: "similar_to",
        });

        await repo.deleteHypothesis(a.id);

        const snap = await repo.loadSnapshot();
        expect(snap.hypotheses).toHaveLength(1);
        expect(snap.hypothesisCases).toHaveLength(0);
        expect(snap.hypothesisTags).toHaveLength(0);
        expect(snap.hypothesisRelations).toHaveLength(0);
        // case snapshot 자체는 남는다(가설과 독립).
        expect(snap.cases).toHaveLength(1);
    });

    it("case 삭제 시 연결도 cascade 된다", async () => {
        const { id } = await repo.createHypothesis({ text: "H" });
        await repo.ensureCase(CASE);
        await repo.upsertCaseLink({ hypothesisId: id, caseId: CASE.caseId });

        await repo.removeCase(CASE.caseId);

        const snap = await repo.loadSnapshot();
        expect(snap.cases).toHaveLength(0);
        expect(snap.hypothesisCases).toHaveLength(0);
    });
});

describe("loadSnapshot.warnings", () => {
    it("better_than 순환을 경고로 표면화한다(저장은 막지 않음)", async () => {
        const a = await repo.createHypothesis({ text: "A" });
        const b = await repo.createHypothesis({ text: "B" });
        await repo.upsertRelation({
            fromHypothesisId: a.id,
            toHypothesisId: b.id,
            relationType: "better_than",
        });
        await repo.upsertRelation({
            fromHypothesisId: b.id,
            toHypothesisId: a.id,
            relationType: "better_than",
        });

        const snap = await repo.loadSnapshot();
        // 저장 자체는 성공한다.
        expect(snap.hypothesisRelations).toHaveLength(2);
        expect(snap.warnings.map((w) => w.code)).toContain("cycle_better_than");
    });
});
