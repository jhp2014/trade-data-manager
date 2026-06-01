import { describe, expect, it } from "vitest";
import { parseCaptureCsv } from "../parseCapture";
import { parseMainCsv } from "../parseMain";
import { parseLineTargets, parseStockCode } from "../parsers";

describe("review ingest parsers", () => {
  it("parses line targets", () => {
    expect(parseLineTargets("")).toEqual([]);
    expect(parseLineTargets("172000")).toEqual([172000]);
    expect(parseLineTargets("9010 | 9450")).toEqual([9010, 9450]);
  });

  it("parses excel-guarded stock code", () => {
    expect(parseStockCode("'009150")).toBe("009150");
  });

  it("parses Capture CSV as targets and skips blank separator rows", () => {
    const csv = [
      "tradeDate,stockCode,_종목명,tradeTime,_명령어 옵션,line_TARGET",
      "2026-05-27,'009150,삼성전기,15:30, -pl,1621000",
      ",,,,,",
      "2026-05-27,'000660,SK하이닉스,15:30, -pl,",
    ].join("\n");

    expect(parseCaptureCsv(csv, "Capture-2026-05-27.csv")).toEqual([
      {
        stockCode: "009150",
        tradeDate: "2026-05-27",
        stockName: "삼성전기",
        lineTargets: [1621000],
        sourceFile: "Capture-2026-05-27.csv",
      },
      {
        stockCode: "000660",
        tradeDate: "2026-05-27",
        stockName: "SK하이닉스",
        lineTargets: [],
        sourceFile: "Capture-2026-05-27.csv",
      },
    ]);
  });

  it("dedupes duplicate (stockCode, tradeDate) keeping the last row", () => {
    const csv = [
      "tradeDate,stockCode,_종목명,tradeTime,_명령어 옵션,line_TARGET",
      "2026-05-27,'009150,삼성전기,15:30, -pl,100",
      "2026-05-27,'009150,삼성전기,15:30, -pl,200 | 300",
    ].join("\n");

    expect(parseCaptureCsv(csv, "Capture-2026-05-27.csv")).toEqual([
      {
        stockCode: "009150",
        tradeDate: "2026-05-27",
        stockName: "삼성전기",
        lineTargets: [200, 300],
        sourceFile: "Capture-2026-05-27.csv",
      },
    ]);
  });

  it("parses main CSV targets, optional points, and payload", () => {
    const csv = [
      "\uFEFFtradeDate,stockCode,_종목명,tradeTime,_명령어 옵션,line_TARGET,skipReason,entryType,themeRank,themeStrength,dailyChart,result,_done",
      "2026-05-11,'000990,DB하이텍,09:04, -pl,172000,✅,분봉 재돌파(S-V) | 분봉 재돌파(L-1),후발(강),💯,신고가(S),❌,☑️",
      "2026-05-11,'009540,HD한국조선해양,, -pl,487500,,추세,,,,,",
    ].join("\n");

    const parsed = parseMainCsv(csv, "main-2026-05.csv");

    expect(parsed.targets).toHaveLength(2);
    expect(parsed.points).toHaveLength(1);
    expect(parsed.points[0].point).toEqual({
      tradeTime: "09:04:00",
      payloadJson: {
        skipReason: "✅",
        entryType: ["분봉 재돌파(S-V)", "분봉 재돌파(L-1)"],
        themeRank: "후발(강)",
        themeStrength: "💯",
        dailyChart: "신고가(S)",
        result: "❌",
        _done: "☑️",
      },
    });
  });
});
