import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../schema";
import type { Database } from "../db";
import { upsertReviewTargets } from "../repositories/review-target.repository";
import { upsertReviewPoint } from "../repositories/review-point.repository";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

export type TestDb = {
  /** 프로덕션과 동일한 Database 타입으로 캐스팅된 PGlite drizzle 인스턴스. */
  db: Database;
  /** 인스턴스 정리(테스트 afterEach 에서 호출). */
  close: () => Promise<void>;
};

/**
 * 인메모리 PGlite(Postgres WASM)에 스키마 마이그레이션을 적용한 테스트 DB 를 만든다.
 * - Docker/외부 서버/실 DATABASE_URL 불필요. 인스턴스는 close() 또는 프로세스 종료 시 사라진다.
 * - 반환 db 는 프로덕션과 동일한 Database(node-postgres 기반)로 캐스팅한다:
 *   쿼리/리포 함수가 쓰는 drizzle 빌더·관계형 API 는 두 드라이버에서 런타임 동작이 동일하다.
 *
 * 호환 주의: PGlite 의 db.execute() 결과는 rowCount 를 제공하지 않는다(affectedRows 사용).
 * 따라서 그 값에 의존하는 함수(deleteManualKey/renameManualKey 의 카운트 반환)는 테스트에서
 * 카운트 대신 '상태'(레지스트리·payload 변화)를 검증한다. 실 운영(node-postgres)에서는 정상.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const drz = drizzle(client, { schema });
  await migrate(drz, { migrationsFolder: MIGRATIONS_DIR });
  return {
    db: drz as unknown as Database,
    close: () => client.close(),
  };
}

/**
 * review 관련 테이블을 비우고 serial 을 초기화한다(테스트 간 격리).
 * 파일당 createTestDb() 1회 + beforeEach 마다 이 함수를 호출하는 패턴을 권장한다
 * (migrate 비용을 테스트마다 치르지 않기 위해).
 */
export async function resetReviewTables(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE review_point, review_target, review_manual_key RESTART IDENTITY CASCADE`,
  );
}

/** review + market/feature/theme 까지 전부 비운다(피처 조인·테마 번들 테스트용). */
export async function resetAllTables(db: Database): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      review_point, review_target, review_manual_key,
      minute_candle_features, daily_theme_mappings, minute_candles, daily_candles, themes, stocks
    RESTART IDENTITY CASCADE
  `);
}

// ── 시드 헬퍼 (실제 writer 를 그대로 dogfooding) ──────────────────────────────

export async function seedTarget(
  db: Database,
  target: { stockCode: string; tradeDate: string; stockName?: string; lineTargets?: number[] },
): Promise<void> {
  await upsertReviewTargets(db, [
    {
      stockCode: target.stockCode,
      tradeDate: target.tradeDate,
      stockName: target.stockName,
      lineTargets: target.lineTargets ?? [],
    },
  ]);
}

export async function seedPoint(
  db: Database,
  point: {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
    payload?: Record<string, string | string[]>;
  },
): Promise<string> {
  const { id } = await upsertReviewPoint(db, {
    stockCode: point.stockCode,
    tradeDate: point.tradeDate,
    tradeTime: point.tradeTime,
    payload: point.payload ?? {},
  });
  return id;
}
