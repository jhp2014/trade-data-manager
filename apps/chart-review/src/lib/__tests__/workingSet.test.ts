import { beforeEach, describe, expect, it, vi } from "vitest";

// 외부 의존(쿠키/env/Google Sheets)을 모킹해 dedupe 로직만 검증한다.
vi.mock("@/lib/readSheetConfig", () => ({
  getReadSheetConfig: vi.fn(),
  hasSheetsCredentials: vi.fn(),
}));
vi.mock("@/actions/sheet", () => ({
  fetchSheetRowsAction: vi.fn(),
}));

import { resolveWorkingSetKeys, rowsToReviewLoadKeys } from "@/lib/workingSet";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { fetchSheetRowsAction } from "@/actions/sheet";

const mockedConfig = vi.mocked(getReadSheetConfig);
const mockedCreds = vi.mocked(hasSheetsCredentials);
const mockedFetch = vi.mocked(fetchSheetRowsAction);

type Config = ReturnType<typeof getReadSheetConfig>;
type Rows = Awaited<ReturnType<typeof fetchSheetRowsAction>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rowsToReviewLoadKeys", () => {
  it("(code,date) 기준 dedupe 하고 빈 값 행은 건너뛴다", () => {
    expect(
      rowsToReviewLoadKeys([
        { stockCode: "005930", tradeDate: "2026-05-27" },
        { stockCode: "005930", tradeDate: "2026-05-27" }, // 중복
        { stockCode: "", tradeDate: "2026-05-27" }, // code 없음
        { stockCode: "000660", tradeDate: "" }, // date 없음
        { stockCode: "000660", tradeDate: "2026-05-27" },
      ]),
    ).toEqual([
      { stockCode: "005930", tradeDate: "2026-05-27" },
      { stockCode: "000660", tradeDate: "2026-05-27" },
    ]);
  });
});

describe("resolveWorkingSetKeys", () => {
  it("시트 미설정(spreadsheetId 없음)이면 null", async () => {
    mockedConfig.mockReturnValue({ spreadsheetId: null, tab: "review" } as unknown as Config);
    mockedCreds.mockReturnValue(true);
    expect(await resolveWorkingSetKeys()).toBeNull();
  });

  it("자격증명이 없으면 null", async () => {
    mockedConfig.mockReturnValue({ spreadsheetId: "sid", tab: "review" } as unknown as Config);
    mockedCreds.mockReturnValue(false);
    expect(await resolveWorkingSetKeys()).toBeNull();
  });

  it("(code,date) 기준 dedupe 하고 빈 값 행은 건너뛴다", async () => {
    mockedConfig.mockReturnValue({ spreadsheetId: "sid", tab: "review" } as unknown as Config);
    mockedCreds.mockReturnValue(true);
    mockedFetch.mockResolvedValue([
      { stockCode: "005930", tradeDate: "2026-05-27" },
      { stockCode: "005930", tradeDate: "2026-05-27" }, // 중복
      { stockCode: "", tradeDate: "2026-05-27" }, // code 없음 → skip
      { stockCode: "000660", tradeDate: "2026-05-27" },
    ] as unknown as Rows);

    expect(await resolveWorkingSetKeys()).toEqual([
      { stockCode: "005930", tradeDate: "2026-05-27" },
      { stockCode: "000660", tradeDate: "2026-05-27" },
    ]);
  });
});
