import Papa from "papaparse";
import type { ReviewTargetSeed } from "@trade-data-manager/data-core";

type CsvRow = Record<string, string>;

function stripBom(value: string): string {
  return value.replace(/^﻿/, "");
}

function isBlankRow(row: CsvRow): boolean {
  return Object.values(row).every((value) => value.trim().length === 0);
}

/** 헤더 기반 CSV 파싱. BOM 제거 + 공백 trim + 빈 행 제거. */
export function parseCsvRows(content: string): CsvRow[] {
  const parsed = Papa.parse<CsvRow>(stripBom(content), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => stripBom(header).trim(),
    transform: (value) => value.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV 파싱 오류 (row ${first.row}): ${first.message}`);
  }

  return parsed.data.filter((row) => !isBlankRow(row));
}

/** 엑셀 텍스트 가드(') 제거 후 종목코드 반환. */
export function parseStockCode(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^'/, "");
}

/** "9010 | 9450" → [9010, 9450]. 콤마/공백 제거 후 숫자만. */
export function parseLineTargets(raw: string | undefined): number[] {
  const value = (raw ?? "").trim();
  if (!value) return [];
  return value
    .split("|")
    .map((part) => Number(part.trim().replace(/,/g, "")))
    .filter((part) => Number.isFinite(part));
}

/**
 * Capture CSV(타겟 전용)를 ReviewTargetSeed[] 로 파싱한다.
 * - stockCode/tradeDate 가 비면 스킵.
 * - 동일 (stockCode, tradeDate) 중복 시 마지막 행 우선(bulk upsert 충돌 회피).
 */
export function parseCaptureCsv(content: string, sourceFile: string): ReviewTargetSeed[] {
  const rows = parseCsvRows(content)
    .map((row) => ({
      stockCode: parseStockCode(row.stockCode),
      tradeDate: row.tradeDate ?? "",
      stockName: row["_종목명"] || undefined,
      lineTargets: parseLineTargets(row.line_TARGET),
      sourceFile,
    }))
    .filter((row) => row.stockCode.length > 0 && row.tradeDate.length > 0);

  const deduped = new Map<string, ReviewTargetSeed>();
  for (const row of rows) {
    deduped.set(`${row.stockCode}|${row.tradeDate}`, row);
  }
  return [...deduped.values()];
}
