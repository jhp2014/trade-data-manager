import type { Database } from "../db";
import { stocks, dailyCandles, minuteCandles, themes, dailyThemeMappings } from "../schema/market";
import { minuteCandleFeatures } from "../schema/features";

// market/feature/theme 테이블 시드 헬퍼. FK 체인은
// stocks → daily_candles → minute_candles → minute_candle_features 이고,
// 테마는 themes ← daily_theme_mappings → daily_candles 로 연결된다.
// NOT NULL 컬럼만 안전한 기본값으로 채우고, 필요한 값만 override 한다.

export async function seedStock(
  db: Database,
  p: { stockCode: string; stockName?: string; regDay?: string | null },
): Promise<void> {
  await db
    .insert(stocks)
    .values({ stockCode: p.stockCode, stockName: p.stockName ?? p.stockCode, regDay: p.regDay ?? null })
    .onConflictDoNothing();
}

export async function seedDailyCandle(
  db: Database,
  p: { stockCode: string; tradeDate: string; prevCloseKrx?: string | null; prevCloseNxt?: string | null },
): Promise<bigint> {
  const [row] = await db
    .insert(dailyCandles)
    .values({
      stockCode: p.stockCode,
      tradeDate: p.tradeDate,
      openKrx: "1000", highKrx: "1100", lowKrx: "900", closeKrx: "1050",
      openNxt: "1000", highNxt: "1100", lowNxt: "900", closeNxt: "1050",
      tradingVolumeKrx: 0n, tradingAmountKrx: "0",
      tradingVolumeNxt: 0n, tradingAmountNxt: "0",
      prevCloseKrx: p.prevCloseKrx ?? null,
      prevCloseNxt: p.prevCloseNxt ?? null,
    })
    .returning({ id: dailyCandles.id });
  return row.id;
}

export async function seedMinuteCandle(
  db: Database,
  p: { dailyCandleId: bigint; stockCode: string; tradeDate: string; tradeTime: string; unixTimestamp?: number; close?: string },
): Promise<bigint> {
  const [row] = await db
    .insert(minuteCandles)
    .values({
      dailyCandleId: p.dailyCandleId,
      tradeDate: p.tradeDate,
      stockCode: p.stockCode,
      tradeTime: p.tradeTime,
      unixTimestamp: p.unixTimestamp ?? 0,
      open: "1000", high: "1100", low: "900", close: p.close ?? "1050",
      tradingVolume: 0n, tradingAmount: "0", accumulatedTradingAmount: "0",
    })
    .returning({ id: minuteCandles.id });
  return row.id;
}

export async function seedFeature(
  db: Database,
  p: {
    minuteCandleId: bigint;
    dailyCandleId: bigint;
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
    closeRateKrx?: string;
    closeRateNxt?: string;
    tradingAmount?: string;
    cumulativeTradingAmount?: string;
    dayHighRate?: string | null;
    dayHighTime?: string | null;
  },
): Promise<void> {
  // minute_candle_features 는 calculator 로 동적 생성된 컬럼(closeRateKrx 등)을 포함해
  // $inferInsert 에 그 키들이 정적으로 잡히지 않는다(런타임 insert 는 정상). 객체 리터럴
  // 초과 프로퍼티 검사를 피하려고 Record 로 만든 뒤 insert 타입으로 캐스팅한다.
  const values: Record<string, unknown> = {
    minuteCandleId: p.minuteCandleId,
    dailyCandleId: p.dailyCandleId,
    stockCode: p.stockCode,
    tradeDate: p.tradeDate,
    tradeTime: p.tradeTime,
    closeRateKrx: p.closeRateKrx ?? "0",
    closeRateNxt: p.closeRateNxt ?? "0",
    tradingAmount: p.tradingAmount ?? "0",
    cumulativeTradingAmount: p.cumulativeTradingAmount ?? "0",
    dayHighRate: p.dayHighRate ?? null,
    dayHighTime: p.dayHighTime ?? null,
  };
  await db.insert(minuteCandleFeatures).values(values as typeof minuteCandleFeatures.$inferInsert);
}

export async function seedTheme(db: Database, themeName: string): Promise<bigint> {
  const [row] = await db.insert(themes).values({ themeName }).returning({ id: themes.themeId });
  return row.id;
}

export async function seedThemeMapping(db: Database, themeId: bigint, dailyCandleId: bigint): Promise<void> {
  await db.insert(dailyThemeMappings).values({ themeId, dailyCandleId }).onConflictDoNothing();
}
