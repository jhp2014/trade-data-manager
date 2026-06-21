import { config } from "dotenv";
import { resolve } from "path";
import dayjs from "dayjs";
import {
  findLatestReviewTradeDate,
  findReviewLoadTargets,
  type ReviewLoadKey,
  type ReviewLoadTarget,
} from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { resolveWorkingSetKeys, rowsToReviewLoadKeys } from "@/lib/workingSet";
import { flattenManualPayload, MANUAL_VALUE_SEP } from "@/lib/manualValue";
import { fetchSheetRowsAction } from "@/actions/sheet";
import { mockSheetRows } from "@/mock/sheetRows";
import type { DbDateRange, ReviewRow } from "@/types/review";

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
export async function loadReviewRows(): Promise<ReviewRow[]> {
  // 작업셋 = 읽기 시트(쿠키/env)의 키. null 이면 DB 모드(기본 날짜 범위).
  const workingKeys = await resolveWorkingSetKeys();
  let keys: ReviewLoadKey[] | undefined;
  let range: DbDateRange = null;

  if (workingKeys === null) {
    range = await resolveDbDateRange();
    console.info(
      range
        ? `[review] no read sheet; DB mode default range ${range.from}~${range.to}`
        : "[review] no read sheet; loading all targets from DB",
    );
  } else {
    if (workingKeys.length === 0) {
      console.warn("[review] connected sheet has no rows; nothing to load");
      return [];
    }
    console.info(`[review] work-set resolved from sheet: ${workingKeys.length} targets`);
    keys = workingKeys;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.warn("[review] DATABASE_URL missing; using mock rows");
    return mockSheetRows;
  }

  const db = getDb();
  const targets = await findReviewLoadTargets(db, { keys, from: range?.from, to: range?.to });
  return targets.flatMap(toReviewRows);
}

export type { DbDateRange };

/**
 * DB 모드 작업셋의 날짜 범위를 해석한다.
 * - all=true → null(전체 로드).
 * - from/to 둘 다 주어지면 그 범위(명시 입력).
 * - 그 외(기본/프리셋) → 최신 tradeDate 기준 최근 N개월(months, 기본 1). DB 비었으면 null.
 */
export async function resolveDbDateRange(
  params: { from?: string; to?: string; all?: boolean; months?: number } = {},
): Promise<DbDateRange> {
  if (params.all) return null;
  if (params.from && params.to) return { from: params.from, to: params.to };
  if (!process.env.DATABASE_URL?.trim()) return null;
  const latest = await findLatestReviewTradeDate(getDb());
  if (!latest) return null;
  const months = params.months && params.months > 0 ? params.months : 1;
  return { from: dayjs(latest).subtract(months, "month").format("YYYY-MM-DD"), to: latest };
}

/**
 * DB Target 을 로드한다. 시트 설정 무관.
 * - range 가 주어지면 tradeDate 범위로 제한, null 이면 전체.
 * 시트가 비어있거나 미설정 시 fallback, 또는 DB 모드 직접 전환에 사용.
 */
export async function loadReviewRowsFromDb(range: DbDateRange = null): Promise<ReviewRow[]> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.warn("[review] DATABASE_URL missing; using mock rows (DB mode)");
    return mockSheetRows;
  }
  const db = getDb();
  const targets = await findReviewLoadTargets(db, {
    keys: undefined,
    from: range?.from,
    to: range?.to,
  });
  return targets.flatMap(toReviewRows);
}

/**
 * 특정 탭의 작업셋을 로드한다. API 라우트(탭별 전환)에서 사용.
 * spreadsheetId + tab 을 직접 받아 resolveWorkingSetKeys 를 우회한다.
 */
export async function loadReviewRowsForTab(
  spreadsheetId: string,
  tab: string,
): Promise<ReviewRow[]> {
  const rows = await fetchSheetRowsAction({ spreadsheetId, tab });
  const keys = rowsToReviewLoadKeys(rows);
  if (keys.length === 0) return [];
  const db = getDb();
  const targets = await findReviewLoadTargets(db, { keys });
  return targets.flatMap(toReviewRows);
}

/**
 * 저장 직후 단일 타점의 서버 파생 feature(amount 등 + lineTargets)를 resolve 한다.
 * 낙관적 갱신이 manual 만 채우는 한계를 보완해, 저장 응답으로 features 를 함께 돌려주기 위함.
 * DB 미연결·미스매치 시 빈 객체.
 */
export async function resolvePointFeatures(
  stockCode: string,
  tradeDate: string,
  tradeTime: string,
): Promise<Record<string, string>> {
  if (!process.env.DATABASE_URL?.trim()) return {};
  const db = getDb();
  const targets = await findReviewLoadTargets(db, { keys: [{ stockCode, tradeDate }] });
  const hhmm = tradeTime.slice(0, 5);
  const match = targets
    .flatMap(toReviewRows)
    .find((row) => row.reviewId && row.tradeTime.slice(0, 5) === hhmm);
  return match?.features ?? {};
}

let syntheticRow = 0;

/** DB 로드 결과(Target+Points)를 앱이 쓰는 ReviewRow 형태로 매핑. */
function toReviewRows(target: ReviewLoadTarget): ReviewRow[] {
  const lineTargets = target.lineTargets.join(MANUAL_VALUE_SEP);

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
    manual: flattenManualPayload(point.payload),
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

