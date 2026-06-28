CREATE SCHEMA "market";
--> statement-breakpoint
CREATE TABLE "market"."daily_candles" (
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"open_krx" numeric(18, 0) NOT NULL,
	"high_krx" numeric(18, 0) NOT NULL,
	"low_krx" numeric(18, 0) NOT NULL,
	"close_krx" numeric(18, 0) NOT NULL,
	"volume_krx" numeric(20, 0) NOT NULL,
	"amount_krx" numeric(22, 0) NOT NULL,
	"open_un" numeric(18, 0) NOT NULL,
	"high_un" numeric(18, 0) NOT NULL,
	"low_un" numeric(18, 0) NOT NULL,
	"close_un" numeric(18, 0) NOT NULL,
	"volume_un" numeric(20, 0) NOT NULL,
	"amount_un" numeric(22, 0) NOT NULL,
	CONSTRAINT "daily_candles_trade_date_stock_code_pk" PRIMARY KEY("trade_date","stock_code")
);
--> statement-breakpoint
CREATE TABLE "market"."daily_market_cap" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"market_cap" numeric(22, 0) NOT NULL,
	CONSTRAINT "daily_market_cap_stock_code_trade_date_pk" PRIMARY KEY("stock_code","trade_date")
);
--> statement-breakpoint
CREATE TABLE "market"."minute_candles" (
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_time" time NOT NULL,
	"open_un" numeric(18, 0) NOT NULL,
	"high_un" numeric(18, 0) NOT NULL,
	"low_un" numeric(18, 0) NOT NULL,
	"close_un" numeric(18, 0) NOT NULL,
	"volume_un" numeric(20, 0) NOT NULL,
	"open_krx" numeric(18, 0),
	"high_krx" numeric(18, 0),
	"low_krx" numeric(18, 0),
	"close_krx" numeric(18, 0),
	"volume_krx" numeric(20, 0),
	CONSTRAINT "minute_candles_trade_date_stock_code_trade_time_pk" PRIMARY KEY("trade_date","stock_code","trade_time")
);
--> statement-breakpoint
CREATE TABLE "market"."stock_master" (
	"stock_code" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"market" varchar(20) NOT NULL,
	"listing_date" date,
	"ipo_price" numeric(18, 0)
);
--> statement-breakpoint
CREATE INDEX "idx_daily_candles_date" ON "market"."daily_candles" USING btree ("trade_date");--> statement-breakpoint
CREATE INDEX "idx_daily_candles_stock" ON "market"."daily_candles" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "idx_minute_candles_search" ON "market"."minute_candles" USING btree ("stock_code","trade_date","trade_time");