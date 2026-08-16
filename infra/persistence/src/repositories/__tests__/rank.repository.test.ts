import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { DrizzleRankRepository } from "../rank.repository.js";
import { DrizzleReviewPointRepository } from "../reviewPoint.repository.js";
import { rankAxes, rankSlots } from "../../schema/curation.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };
const P3 = { stockCode: "000660", date: "2026-06-30", time: "09:30:00" };

describe("DrizzleRankRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleRankRepository;

    // 줄 읽기는 전축 피드에서 그 축만 뽑아 본다(단건 조회 포트가 없음 — 소비자가 늘 전축을 본다).
    const line = async (axisName: string) => (await repo.listAllLines()).find((l) => l.axisName === axisName)?.placements ?? [];

    // slot 은 계약에 없다 — 개수 확인은 저장소 내부를 직접 들여다본다(축 이름 → id 는 여기서만).
    const slotCount = async (axisName: string): Promise<number> => {
        const [a] = await t.db.select({ id: rankAxes.id }).from(rankAxes).where(eq(rankAxes.name, axisName));
        if (!a) return 0;
        return t.db.select({ id: rankSlots.id }).from(rankSlots).where(eq(rankSlots.axisId, a.id)).then((r) => r.length);
    };

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleRankRepository(t.db);
        // 배치 대상 타점 선행 생성(rank_placements → review_points FK).
        await new DrizzleReviewPointRepository(t.db).upsert([P1, P2, P3]);
    });
    afterAll(async () => {
        await t.close();
    });

    it("createAxis — 계약엔 id 가 없다(이름이 곧 정체성) + listAxes + 이름 unique", async () => {
        const a = await repo.createAxis("일봉-형태");
        expect(Object.keys(a).sort()).toEqual(["name", "scope"]);
        expect((await repo.listAxes()).map((x) => x.name)).toContain("일봉-형태");
        await expect(repo.createAxis("일봉-형태")).rejects.toBeTruthy(); // uq_rank_axis_name
    });

    it("place between(빈 축) → order_key 0, 끝단 삽입은 ±1", async () => {
        const a = await repo.createAxis("테마");
        const s1 = await repo.place(a.name, P1, { kind: "between" }); // 빈 축 → 0
        expect(s1.orderKey).toBe(0);
        const s2 = await repo.place(a.name, P2, { kind: "between", after: P1 }); // prev=0, next 없음 → +1
        expect(s2.orderKey).toBe(1);
        const s3 = await repo.place(a.name, P3, { kind: "between", before: P1 }); // next=0, prev 없음 → -1
        expect(s3.orderKey).toBe(-1);

        const l = await line(a.name);
        expect(l.map((p) => p.stockCode)).toEqual(["000660", "005930", "005930"]); // order_key -1,0,1 오름차순
        expect(l.map((p) => p.time)).toEqual(["09:30:00", "09:11:00", "10:00:00"]);
    });

    it("place slot → 타이(같은 자리 = 같은 order_key 공유)", async () => {
        const a = await repo.createAxis("거래대금");
        const s1 = await repo.place(a.name, P1, { kind: "between" });
        const s2 = await repo.place(a.name, P2, { kind: "slot", point: P1 }); // P1 이 있는 자리에 합류
        expect(s2.orderKey).toBe(s1.orderKey);
        expect(await slotCount(a.name)).toBe(1); // 타이 1칸

        const l = await line(a.name);
        expect(l).toHaveLength(2);
        // uq_rank_slot_position 덕에 "같은 orderKey = 같은 자리"다 — 그래서 slotId 가 계약에서 빠졌다.
        expect(new Set(l.map((p) => p.orderKey))).toEqual(new Set([s1.orderKey]));
    });

    it("place 재호출 = 이동(멱등 upsert) + 비워진 옛 slot GC", async () => {
        const a = await repo.createAxis("끼");
        await repo.place(a.name, P1, { kind: "between" }); // slotA
        const s2 = await repo.place(a.name, P2, { kind: "between", after: P1 }); // slotB(혼자)
        expect(await slotCount(a.name)).toBe(2);

        // P2 를 P1 의 자리로 이동 → slotB 비어 GC, slotA 는 P1·P2 타이.
        const moved = await repo.place(a.name, P2, { kind: "slot", point: P1 });
        expect(await slotCount(a.name)).toBe(1); // slotB GC
        expect((await line(a.name)).map((p) => p.orderKey)).toEqual([moved.orderKey, moved.orderKey]);
        expect(s2.orderKey).not.toBe(moved.orderKey); // (이전 slotB 자리는 사라짐)
    });

    it("자리를 타점으로 지목한다 — 배치되지 않은 타점을 경계로 주면 거부", async () => {
        // 빈 자리는 지목할 수 없다는 규칙의 다른 얼굴. slotId 였다면 조용히 엉뚱한 자리를 가리켰을 자리다.
        const a = await repo.createAxis("미배치 경계");
        await repo.place(a.name, P1, { kind: "between" });
        await expect(repo.place(a.name, P2, { kind: "slot", point: P3 })).rejects.toThrow();
        await expect(repo.place(a.name, P2, { kind: "between", after: P3 })).rejects.toThrow();
    });

    it("unplace — 배치 제거 + 마지막 멤버면 slot GC, 없는 배치는 no-op", async () => {
        const a = await repo.createAxis("일봉-위치");
        await repo.place(a.name, P1, { kind: "between" });
        await repo.place(a.name, P2, { kind: "slot", point: P1 }); // 타이(2명)

        await repo.unplace(a.name, P1); // 아직 P2 남음 → slot 유지
        expect(await slotCount(a.name)).toBe(1);
        expect(await line(a.name)).toHaveLength(1);

        await repo.unplace(a.name, P2); // 마지막 → slot GC
        expect(await slotCount(a.name)).toBe(0);
        expect(await line(a.name)).toHaveLength(0);

        await expect(repo.unplace(a.name, P3)).resolves.toBeUndefined(); // 없는 배치 no-op
    });

    it("removeAxis — slot·placement 까지 cascade", async () => {
        const a = await repo.createAxis("삭제될 축");
        await repo.place(a.name, P1, { kind: "between" });
        await repo.place(a.name, P2, { kind: "slot", point: P1 });
        expect(await slotCount(a.name)).toBe(1);

        await repo.removeAxis(a.name);
        expect((await repo.listAxes()).some((x) => x.name === a.name)).toBe(false);
        expect(await slotCount(a.name)).toBe(0); // slot cascade
        expect(await line(a.name)).toHaveLength(0); // placement cascade
    });

    it("place between — 간격 소진 시 자동 reindex(같은 틈 반복 삽입에도 순서 보존)", async () => {
        const a = await repo.createAxis("reindex 축");
        const N = 60;
        // 비-0 앵커(top=1) 쪽으로 압착하면 ~52회쯤 double 간격 소진 → 자동 reindex 발동.
        const pts = Array.from({ length: N }, (_, i) => ({ stockCode: "100000", date: "2026-06-30", time: `09:${String(i).padStart(2, "0")}:00` }));
        await new DrizzleReviewPointRepository(t.db).upsert(pts);

        await repo.place(a.name, pts[0]!, { kind: "between" }); // key 0(최하단)
        await repo.place(a.name, pts[1]!, { kind: "between", after: pts[0]! }); // key 1(최상단, 고정 앵커)
        let inner = pts[0]!;
        for (let i = 2; i < N; i++) {
            await repo.place(a.name, pts[i]!, { kind: "between", after: inner, before: pts[1]! });
            inner = pts[i]!;
        }

        const l = await line(a.name);
        expect(l).toHaveLength(N); // 전원 배치 성공(throw·소진 없음)
        for (let i = 1; i < l.length; i++) expect(l[i]!.orderKey).toBeGreaterThan(l[i - 1]!.orderKey); // 키 순증가(중복·역전 없음)
        expect(l[0]!.time).toBe("09:00:00"); // 최하단 유지
        expect(l[l.length - 1]!.time).toBe("09:01:00"); // 최상단(top) 유지
    });

    it("place between(같은 자리 두 경계) — 타이 그룹 내부 = 그 자리 합류(중간키 불가 500 대신 정규화)", async () => {
        const a = await repo.createAxis("타이-사이");
        const s1 = await repo.place(a.name, P1, { kind: "between" }); // slotA
        await repo.place(a.name, P2, { kind: "slot", point: P1 }); // P1·P2 타이(slotA)
        expect(await slotCount(a.name)).toBe(1);

        // 타이 두 행 "사이"에 P3 를 놓음 = 두 경계가 같은 자리로 풀린다. 예외 없이 합류(3명 타이).
        const r = await repo.place(a.name, P3, { kind: "between", after: P1, before: P2 });
        expect(r.orderKey).toBe(s1.orderKey);
        expect(await slotCount(a.name)).toBe(1); // 새 slot 안 생김
        expect(await line(a.name)).toHaveLength(3); // P1·P2·P3 한 자리
    });

    it("place 는 존재하는 타점만 — 없는 타점(FK) 위반은 거부", async () => {
        const a = await repo.createAxis("FK 검증 축");
        await expect(repo.place(a.name, { stockCode: "999999", date: "2026-06-30", time: "09:00:00" }, { kind: "between" })).rejects.toBeTruthy();
    });

    it("없는 축 이름은 거부 — 이름이 키라 오타가 조용히 지나가면 안 된다", async () => {
        await expect(repo.place("없는 축", P1, { kind: "between" })).rejects.toThrow();
    });

    it("createAxis scope — 기본 point, day 저장/조회", async () => {
        const p = await repo.createAxis("scope 기본");
        expect(p.scope).toBe("point");
        const d = await repo.createAxis("scope day", "day");
        expect(d.scope).toBe("day");
        expect((await repo.listAxes()).find((x) => x.name === d.name)?.scope).toBe("day");
    });

    it("day 축 place — 그날 전 타점에 fanout(같은 자리, 미배치 타점도 끌어옴)", async () => {
        const a = await repo.createAxis("일봉(day)", "day");
        const r = await repo.place(a.name, P1, { kind: "between" }); // P1 하나로 호출 → 005930·06-30 전 타점(P1,P2)
        const l = await line(a.name);
        expect(l).toHaveLength(2); // P1·P2 둘 다 보임(point 축과 동일한 줄)
        expect(new Set(l.map((p) => p.orderKey))).toEqual(new Set([r.orderKey])); // 한 자리에 타이
        expect(l.map((p) => p.time).sort()).toEqual(["09:11:00", "10:00:00"]);
        expect(await slotCount(a.name)).toBe(1); // 다른 종목(P3)은 무관
    });

    it("day 축 이동 — 그날 타점 통째 이동 + 옛 slot GC(어느 타점으로 호출하든)", async () => {
        const a = await repo.createAxis("끼(day)", "day");
        const other = await repo.place(a.name, P3, { kind: "between" }); // 000660 day(P3) → slotA
        await repo.place(a.name, P1, { kind: "between", after: P3 }); // 005930 day(P1·P2) → slotB
        expect(await slotCount(a.name)).toBe(2);

        // 005930 day 를 slotA 로 이동 — P2 로 호출해도 그날 전체(P1·P2) 이동, slotB 비어 GC.
        const moved = await repo.place(a.name, P2, { kind: "slot", point: P3 });
        expect(moved.orderKey).toBe(other.orderKey);
        expect(await slotCount(a.name)).toBe(1);
        const l = await line(a.name);
        expect(l).toHaveLength(3); // P3·P1·P2 한 자리
        expect(new Set(l.map((p) => p.orderKey))).toEqual(new Set([other.orderKey]));
    });

    it("day 축 unplace — 그날 전 타점 제거 + slot GC(어느 타점으로 호출하든)", async () => {
        const a = await repo.createAxis("테마(day)", "day");
        await repo.place(a.name, P1, { kind: "between" }); // P1·P2 배치
        expect(await line(a.name)).toHaveLength(2);
        await repo.unplace(a.name, P2); // P2 로 호출 → 그날 전체 제거
        expect(await line(a.name)).toHaveLength(0);
        expect(await slotCount(a.name)).toBe(0);
    });

    it("listAllLines — 축별로 접어서 한 번에(배치 없는 축은 아예 안 나옴)", async () => {
        const a1 = await repo.createAxis("전축-A");
        const a2 = await repo.createAxis("전축-B");
        await repo.createAxis("전축-빈축"); // 배치 0 → 피드에 없음
        await repo.place(a1.name, P1, { kind: "between" });
        await repo.place(a1.name, P2, { kind: "between", after: P1 });
        await repo.place(a2.name, P3, { kind: "between" });

        const all = await repo.listAllLines();
        const of = (name: string) => all.find((l) => l.axisName === name);
        expect(of(a1.name)?.placements.map((p) => p.time)).toEqual(["09:11:00", "10:00:00"]); // orderKey 오름차순
        expect(of(a2.name)?.placements).toHaveLength(1);
        expect(all.some((l) => l.placements.length === 0)).toBe(false);
    });

    it("day 축 place — 그날 타점 0개면 거부", async () => {
        const a = await repo.createAxis("거래대금(day)", "day");
        await expect(repo.place(a.name, { stockCode: "005930", date: "2020-01-01", time: "09:00:00" }, { kind: "between" })).rejects.toBeTruthy();
    });
});
