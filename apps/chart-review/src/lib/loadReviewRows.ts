import { config } from "dotenv";
import { resolve } from "path";
import {
  findReviewLoadTargets,
  type ReviewLoadKey,
  type ReviewLoadTarget,
} from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { fetchSheetRowsAction } from "@/actions/sheet";
import { mockSheetRows } from "@/mock/sheetRows";
import type { SheetPointRow } from "@/types/review";

config({ path: resolve(process.cwd(), "../../.env") });

/**
 * 앱이 그릴 작업셋을 로드한다. (DB 가 진실 원천)
 *
 * - 연결된 Google Sheet 가 있으면: 시트에서 (stockCode, tradeDate) 키만 dedupe 해
 *   "어떤 Target 을 볼지" 결정하고, 실제 값(payload/feature)은 DB 에서 조회한다.
 *   시트의 tradeTime/m_/feature 컬럼은 읽기 단계에서 무시한다(Point 는 DB 가 진실).
 * - 시트 env 가 없으면: DB 의 전체 Target(최근순)을 로드한다.
 * - DB 가 비어있거나 DATABASE_URL 이 없으면: mock 으로 폴백.
 */
export async function loadReviewRows(): Promise<SheetPointRow[]> {
  let keys: ReviewLoadKey[] | undefined;

  if (hasSheetsEnv()) {
    console.info("[review] resolving work-set keys from Google Sheets");
    keys = await loadSheetKeys();
    if (keys.length === 0) {
      console.warn("[review] connected sheet has no rows; nothing to load");
      return [];
    }
  } else {
    console.info("[review] no Sheets env; loading all targets from DB");
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.warn("[review] DATABASE_URL missing; using mock rows");
    return mockSheetRows;
  }

  const db = getDb();
  const targets = await findReviewLoadTargets(db, { keys });
  return targets.flatMap(toSheetPointRows);
}

/** 시트 전체를 읽어 (stockCode, tradeDate) 쌍만 dedupe 한 선택 키 목록. */
async function loadSheetKeys(): Promise<ReviewLoadKey[]> {
  const rows = await fetchSheetRowsAction();
  const seen = new Set<string>();
  const keys: ReviewLoadKey[] = [];
  for (const row of rows) {
    if (!row.stockCode || !row.tradeDate) continue;
    const id = `${row.stockCode}|${row.tradeDate}`;
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push({ stockCode: row.stockCode, tradeDate: row.tradeDate });
  }
  return keys;
}

let syntheticRow = 0;

/** DB 로드 결과(Target+Points)를 앱이 쓰는 SheetPointRow 형태로 매핑. */
function toSheetPointRows(target: ReviewLoadTarget): SheetPointRow[] {
  const lineTargets = target.lineTargets.join(" | ");

  // Point 가 없는 Target 도 사이드바에 노출되도록 빈 tradeTime 행 1개를 둔다.
  if (target.points.length === 0) {
    return [
      {
        reviewId: "",
        rowNumber: ++syntheticRow,
        stockCode: target.stockCode,
        stockName: target.stockName ?? undefined,
        tradeDate: target.tradeDate,
        tradeTime: "",
        features: lineTargets ? { lineTargets } : {},
        manual: {},
      },
    ];
  }

  return target.points.map((point) => ({
    reviewId: point.reviewId,
    rowNumber: ++syntheticRow,
    stockCode: target.stockCode,
    stockName: target.stockName ?? undefined,
    tradeDate: target.tradeDate,
    tradeTime: point.tradeTime.slice(0, 5),
    features: toFeatures(point.features, lineTargets),
    manual: toManual(point.payload),
  }));
}

function toFeatures(
  features: Record<string, string | null>,
  lineTargets: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(features)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  if (lineTargets) out.lineTargets = lineTargets;
  return out;
}

function toManual(payload: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = Array.isArray(value) ? value.join(" | ") : value;
  }
  return out;
}

function hasSheetsEnv() {
  const hasSheet = Boolean(process.env.GOOGLE_SHEETS_ID?.trim());
  const hasKeyFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
  const hasInlineKey = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
  return hasSheet && (hasKeyFile || hasInlineKey);
}
