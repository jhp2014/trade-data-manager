ALTER TABLE "daily_candles" DROP CONSTRAINT "uq_daily_candles_date_stock_source";--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "open_krx" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "high_krx" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "low_krx" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "close_krx" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "open_nxt" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "high_nxt" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "low_nxt" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "close_nxt" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "trading_volume_krx" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "trading_amount_krx" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "trading_volume_nxt" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "trading_amount_nxt" numeric(18, 0) NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "change_value_krx" numeric(18, 0);--> statement-breakpoint
ALTER TABLE "daily_candles" ADD COLUMN "change_value_nxt" numeric(18, 0);--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "open_price";--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "high_price";--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "low_price";--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "close_price";--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "trading_volume";--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "trading_amount";--> statement-breakpoint
ALTER TABLE "daily_candles" DROP COLUMN "change_value";--> statement-breakpoint
ALTER TABLE "stocks" DROP COLUMN "market_type";--> statement-breakpoint
ALTER TABLE "daily_candles" ADD CONSTRAINT "uq_daily_candles_date_stock" UNIQUE("trade_date","stock_code");