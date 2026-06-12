/**
 * ReviewExportRow[] → Google Sheet/CSV 2차원 문자열 매트릭스 (앱 전용 Sheet 계층).
 * DB 조회(findReviewExportRows)는 data-core 가, 시트 표현 변환은 이 모듈이 담당한다.
 */

import { FEATURE_COLUMNS, type ReviewExportRow } from "@trade-data-manager/data-core";
import { MANUAL_VALUE_SEP, joinManualValue } from "@/lib/manualValue";
import { FIXED_COLUMNS, toManualHeader } from "@/lib/sheetColumns";

export type BuildSheetMatrixOptions = {
  /** 주어지면 'reviewUrl' 컬럼을 추가해 각 타점의 앱 링크를 채운다. */
  baseUrl?: string;
  /**
   * 주어지면(비어있지 않으면) 전체 컬럼 대신 이 키 목록만 이 순서대로 출력한다.
   * 헤더는 키 그대로 쓰며('f' 쓰기 append 와 동일), 매칭되지 않는 키는 빈 컬럼이 된다.
   * 미지정/빈 배열이면 기존 전체 컬럼 동작을 유지한다(하위 호환).
   */
  fieldKeys?: string[];
};

export function buildSheetMatrix(
  rows: ReviewExportRow[],
  options: BuildSheetMatrixOptions = {},
): string[][] {
  const full = buildFullMatrix(rows, options.baseUrl);
  if (!options.fieldKeys || options.fieldKeys.length === 0) return full;
  return projectColumns(full, options.fieldKeys);
}

/** 전체 컬럼(FIXED + reviewUrl? + FEATURE + manual) 매트릭스. */
function buildFullMatrix(rows: ReviewExportRow[], baseUrlRaw?: string): string[][] {
  const manualKeys = collectManualKeys(rows);
  const baseUrl = baseUrlRaw?.trim().replace(/\/+$/, "");
  const headers = [
    ...FIXED_COLUMNS,
    ...(baseUrl ? (["reviewUrl"] as const) : []),
    ...FEATURE_COLUMNS,
    ...manualKeys.map(toManualHeader),
  ];

  return [
    [...headers],
    ...rows.map((row) => [
      buildGroupId(row),
      row.reviewId ?? "",
      row.stockCode,
      row.stockName ?? "",
      row.tradeDate,
      formatTime(row.tradeTime),
      row.lineTargets.join(MANUAL_VALUE_SEP),
      ...(baseUrl ? [buildReviewUrl(baseUrl, row)] : []),
      ...FEATURE_COLUMNS.map((column) => row.features[column] ?? ""),
      ...manualKeys.map((key) => formatPayloadValue(row.payload[key])),
    ]),
  ];
}

/**
 * 전체 매트릭스를 fieldKeys 순서대로 컬럼 투영한다.
 * 헤더 행은 fieldKeys 를 그대로 출력하고, 데이터 행은 해당 컬럼 값을 채운다.
 * 전체 헤더에 없는 키는 빈 컬럼으로 둔다.
 */
function projectColumns(matrix: string[][], fieldKeys: string[]): string[][] {
  const header = matrix[0] ?? [];
  const indices = fieldKeys.map((key) => header.indexOf(key));
  const dataRows = matrix
    .slice(1)
    .map((row) => indices.map((idx) => (idx >= 0 ? row[idx] ?? "" : "")));
  return [[...fieldKeys], ...dataRows];
}

/** 복붙 탐색용 GroupId. "종목코드-거래일"(예: 005930-20240115). */
function buildGroupId(row: ReviewExportRow): string {
  return `${row.stockCode}-${row.tradeDate}`;
}

/** 앱 리뷰 화면 링크. tradeTime 이 없으면 09:00 으로 대체(앱 라우트 기본값과 동일). */
function buildReviewUrl(baseUrl: string, row: ReviewExportRow): string {
  const time = (row.tradeTime ?? "").slice(0, 5) || "09:00";
  return `${baseUrl}/review/${row.stockCode}/${row.tradeDate}/${time}`;
}

function collectManualKeys(rows: ReviewExportRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.payload)) {
      keys.add(key);
    }
  }
  return Array.from(keys).sort((a, b) => toManualHeader(a).localeCompare(toManualHeader(b)));
}

function formatPayloadValue(value: string | string[] | undefined): string {
  return value === undefined ? "" : joinManualValue(value);
}

function formatTime(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 5);
}
