import {
    bigint,
    bigserial,
    date,
    index,
    jsonb,
    time,
    timestamp,
    unique,
    varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pgTable } from "./market";

export const reviewTargets = pgTable("review_target", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    stockCode: varchar("stock_code", { length: 10 }).notNull(),
    tradeDate: date("trade_date").notNull(),
    stockName: varchar("stock_name", { length: 100 }),
    lineTargets: jsonb("line_targets").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    sourceFile: varchar("source_file", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
}, (table) => [
    unique("uq_review_target_code_date").on(table.stockCode, table.tradeDate),
    index("idx_review_target_trade_date").on(table.tradeDate),
]);

export const reviewPoints = pgTable("review_point", {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    reviewTargetId: bigint("review_target_id", { mode: "bigint" })
        .notNull()
        .references(() => reviewTargets.id, { onDelete: "cascade" }),
    tradeTime: time("trade_time").notNull(),
    payloadJson: jsonb("payload_json")
        .$type<Record<string, string | string[]>>()
        .notNull()
        .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
}, (table) => [
    unique("uq_review_point_target_time").on(table.reviewTargetId, table.tradeTime),
    index("idx_review_point_target").on(table.reviewTargetId),
]);

export type ReviewTarget = typeof reviewTargets.$inferSelect;
export type ReviewTargetInsert = typeof reviewTargets.$inferInsert;
export type ReviewPoint = typeof reviewPoints.$inferSelect;
export type ReviewPointInsert = typeof reviewPoints.$inferInsert;
