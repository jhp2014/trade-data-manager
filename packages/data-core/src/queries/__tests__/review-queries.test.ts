import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  resetReviewTables,
  seedPoint,
  seedTarget,
  type TestDb,
} from "../../test-support/testDb";
import { findLatestReviewTradeDate, findReviewLoadTargets } from "../review-load.query";
import { findReviewExportRows } from "../review-export.query";
import { findReviewTargetsWithPointsByCodes } from "../review-bundle.query";

let h: TestDb;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetReviewTables(h.db);
});

const D1 = "2026-05-26";
const D2 = "2026-05-27";
const D3 = "2026-05-28";

describe("findReviewLoadTargets", () => {
  it("keys 가 빈 배열이면 빈 결과", async () => {
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    const rows = await findReviewLoadTargets(h.db, { keys: [] });
    expect(rows).toEqual([]);
  });

  it("정확한 (code,date) 쌍만 로드한다 (cartesian over-fetch 후 쌍 필터)", async () => {
    // 같은 코드의 다른 날짜, 다른 코드의 같은 날짜를 섞어 둔다.
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D1 });
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    await seedTarget(h.db, { stockCode: "000660", tradeDate: D1 });

    const rows = await findReviewLoadTargets(h.db, {
      keys: [
        { stockCode: "005930", tradeDate: D1 },
        { stockCode: "000660", tradeDate: D1 },
      ],
    });

    const got = rows.map((r) => `${r.stockCode}|${r.tradeDate}`).sort();
    // (005930,D2) 는 code/date IN 으로 끌려오지만 쌍 필터에서 제외되어야 한다.
    expect(got).toEqual(["000660|2026-05-26", "005930|2026-05-26"]);
  });

  it("keys 없으면 전체를 tradeDate desc, stockCode asc 로 반환하고 limit 을 적용한다", async () => {
    await seedTarget(h.db, { stockCode: "000660", tradeDate: D1 });
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    await seedTarget(h.db, { stockCode: "000660", tradeDate: D2 });

    const all = await findReviewLoadTargets(h.db, {});
    expect(all.map((r) => `${r.stockCode}|${r.tradeDate}`)).toEqual([
      "000660|2026-05-27",
      "005930|2026-05-27",
      "000660|2026-05-26",
    ]);

    const limited = await findReviewLoadTargets(h.db, { limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("keys 없이 from/to 가 주어지면 tradeDate 범위로 제한한다", async () => {
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D1 });
    await seedTarget(h.db, { stockCode: "000660", tradeDate: D2 });
    await seedTarget(h.db, { stockCode: "035420", tradeDate: D3 });

    const rows = await findReviewLoadTargets(h.db, { from: D2, to: D3 });

    expect(rows.map((r) => `${r.stockCode}|${r.tradeDate}`)).toEqual([
      "035420|2026-05-28",
      "000660|2026-05-27",
    ]);
  });

  it("가장 최근 tradeDate 를 반환하고 타깃이 없으면 null 을 반환한다", async () => {
    expect(await findLatestReviewTradeDate(h.db)).toBeNull();

    await seedTarget(h.db, { stockCode: "005930", tradeDate: D1 });
    await seedTarget(h.db, { stockCode: "000660", tradeDate: D3 });
    await seedTarget(h.db, { stockCode: "035420", tradeDate: D2 });

    expect(await findLatestReviewTradeDate(h.db)).toBe(D3);
  });

  it("타깃의 포인트를 tradeTime asc 로 중첩하고 payload·lineTargets 를 보존한다", async () => {
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2, stockName: "삼성전자", lineTargets: [9010, 9450] });
    await seedPoint(h.db, { stockCode: "005930", tradeDate: D2, tradeTime: "10:30:00", payload: { result: "bad" } });
    await seedPoint(h.db, { stockCode: "005930", tradeDate: D2, tradeTime: "09:12:00", payload: { result: "good", tag: ["a", "b"] } });

    const [row] = await findReviewLoadTargets(h.db, { keys: [{ stockCode: "005930", tradeDate: D2 }] });
    expect(row.stockName).toBe("삼성전자");
    expect(row.lineTargets).toEqual([9010, 9450]);
    expect(row.points.map((p) => p.tradeTime)).toEqual(["09:12:00", "10:30:00"]);
    expect(row.points[0].payload).toEqual({ result: "good", tag: ["a", "b"] });
    // 피처 시드가 없으면 features 는 빈 객체.
    expect(row.points[0].features).toEqual({});
  });
});

describe("findReviewExportRows", () => {
  it("포인트가 없는 타깃도 tradeTime/reviewId 가 null 인 1행으로 내보낸다", async () => {
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    const rows = await findReviewExportRows(h.db, { keys: [{ stockCode: "005930", tradeDate: D2 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stockCode: "005930", tradeDate: D2, tradeTime: null, reviewId: null });
  });

  it("포인트마다 1행으로 평탄화한다", async () => {
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    await seedPoint(h.db, { stockCode: "005930", tradeDate: D2, tradeTime: "09:12:00", payload: { result: "good" } });
    await seedPoint(h.db, { stockCode: "005930", tradeDate: D2, tradeTime: "10:30:00", payload: { result: "bad" } });

    const rows = await findReviewExportRows(h.db, { keys: [{ stockCode: "005930", tradeDate: D2 }] });
    expect(rows.map((r) => r.tradeTime)).toEqual(["09:12:00", "10:30:00"]);
    expect(rows.every((r) => r.reviewId !== null)).toBe(true);
  });

  it("since 가 주어지면 그 날짜 이후 타깃만 내보낸다", async () => {
    await seedTarget(h.db, { stockCode: "000660", tradeDate: D1 });
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    const rows = await findReviewExportRows(h.db, { since: D2 });
    expect(rows.map((r) => r.tradeDate)).toEqual([D2]);
  });
});

describe("findReviewTargetsWithPointsByCodes", () => {
  it("review_target 인 코드만 Map 으로 반환하고 포인트를 담는다", async () => {
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    await seedPoint(h.db, { stockCode: "005930", tradeDate: D2, tradeTime: "09:12:00", payload: { result: "good" } });

    const map = await findReviewTargetsWithPointsByCodes(h.db, {
      stockCodes: ["005930", "000660"], // 000660 은 타깃이 아님
      tradeDate: D2,
    });
    expect([...map.keys()]).toEqual(["005930"]);
    expect(map.get("005930")!.points.map((p) => p.tradeTime)).toEqual(["09:12:00"]);
  });
});

describe("계약: load·export·bundle 은 같은 keys 에 대해 동일한 포인트 집합을 본다", () => {
  it("동일 (code,date,time,payload) 집합", async () => {
    await seedTarget(h.db, { stockCode: "005930", tradeDate: D2 });
    await seedPoint(h.db, { stockCode: "005930", tradeDate: D2, tradeTime: "09:12:00", payload: { result: "good", tag: ["x"] } });
    await seedPoint(h.db, { stockCode: "005930", tradeDate: D2, tradeTime: "10:30:00", payload: { result: "bad" } });

    const norm = (rows: Array<{ tradeTime: string; payload: Record<string, string | string[]> }>) =>
      rows.map((p) => ({ tradeTime: p.tradeTime, payload: p.payload })).sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));

    const load = await findReviewLoadTargets(h.db, { keys: [{ stockCode: "005930", tradeDate: D2 }] });
    const loadPts = norm(load[0].points);

    const exportRows = await findReviewExportRows(h.db, { keys: [{ stockCode: "005930", tradeDate: D2 }] });
    const exportPts = norm(exportRows.map((r) => ({ tradeTime: r.tradeTime as string, payload: r.payload })));

    const bundle = await findReviewTargetsWithPointsByCodes(h.db, { stockCodes: ["005930"], tradeDate: D2 });
    const bundlePts = norm(bundle.get("005930")!.points);

    expect(exportPts).toEqual(loadPts);
    expect(bundlePts).toEqual(loadPts);
  });
});
