import {
    bigserial,
    bigint,
    varchar,
    date,
    time,
    timestamp,
    jsonb,
    text,
    unique,
    index,
} from "drizzle-orm/pg-core";
import { pgTable, stocks, themes } from "@trade-data-manager/market-data";
import type { TagTreeJson } from "./types";

/* ===========================================================
 * 1. 태그 트리 정의 (JSONB 트리 구조)
 *    - 2행만 존재: scope='daily' | 'opinion'
 *    - tree 컬럼에 트리 통째로 JSONB로 보관
 * =========================================================== */
export const tagTrees = pgTable("tag_trees", {
    scope: varchar("scope", { length: 20 }).primaryKey(),
    tree: jsonb("tree").$type<TagTreeJson>().notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TagTreeRow = typeof tagTrees.$inferSelect;
export type TagTreeInsert = typeof tagTrees.$inferInsert;

/* ===========================================================
 * 2. 일봉 태그 멤버십
 *    - (stockCode, tradeDate)마다 1행
 *    - tags 컬럼은 leaf path들의 배열 (JSONB)
 * =========================================================== */
export const dailyTags = pgTable(
    "daily_tags",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        stockCode: varchar("stock_code", { length: 10 })
            .notNull()
            .references(() => stocks.stockCode),
        tradeDate: date("trade_date").notNull(),
        tags: jsonb("tags").$type<string[]>().notNull().default([]),
        memo: text("memo"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (t) => [
        unique("uq_daily_tags").on(t.stockCode, t.tradeDate),
        index("idx_daily_tags_stock_date").on(t.stockCode, t.tradeDate),
    ]
);

export type DailyTagRow = typeof dailyTags.$inferSelect;
export type DailyTagInsert = typeof dailyTags.$inferInsert;

/* ===========================================================
 * 3. 마킹 (trading_opportunities)
 *    - (tradeDate, tradeTime, stockCode, themeId) 유니크
 *    - tags 컬럼은 의견 leaf path들의 배열 (JSONB)
 *    - 일봉 태그는 daily_tags에서 별도 조회 (저장은 분리)
 * =========================================================== */
export const tradingOpportunities = pgTable(
    "trading_opportunities",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        tradeDate: date("trade_date").notNull(),
        tradeTime: time("trade_time").notNull(),
        stockCode: varchar("stock_code", { length: 10 })
            .notNull()
            .references(() => stocks.stockCode),
        themeId: bigint("theme_id", { mode: "bigint" })
            .notNull()
            .references(() => themes.themeId),
        tags: jsonb("tags").$type<string[]>().notNull().default([]),
        memo: text("memo"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (t) => [
        unique("uq_opportunities").on(
            t.tradeDate,
            t.tradeTime,
            t.stockCode,
            t.themeId
        ),
        index("idx_opp_stock_date").on(t.stockCode, t.tradeDate),
        index("idx_opp_theme_date").on(t.themeId, t.tradeDate),
    ]
);

export type TradingOpportunityRow = typeof tradingOpportunities.$inferSelect;
export type TradingOpportunityInsert =
    typeof tradingOpportunities.$inferInsert;
