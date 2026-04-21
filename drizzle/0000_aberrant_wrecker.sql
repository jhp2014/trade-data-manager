CREATE TABLE "daily_candles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"source" varchar(20) DEFAULT 'KRX' NOT NULL,
	"open_price" numeric(18, 0) NOT NULL,
	"high_price" numeric(18, 0) NOT NULL,
	"low_price" numeric(18, 0) NOT NULL,
	"close_price" numeric(18, 0) NOT NULL,
	"trading_volume" bigint NOT NULL,
	"trading_amount" numeric(18, 0) NOT NULL,
	"prev_close_krx" numeric(18, 0),
	"prev_close_nxt" numeric(18, 0),
	"change_value" numeric(18, 0),
	"market_cap" bigint,
	"listed_shares" bigint,
	"floating_shares" bigint,
	CONSTRAINT "uq_daily_candles_date_stock_source" UNIQUE("trade_date","stock_code","source")
);
--> statement-breakpoint
CREATE TABLE "daily_theme_mappings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"theme_id" bigint NOT NULL,
	"daily_candle_id" bigint NOT NULL,
	CONSTRAINT "uq_daily_theme_mapping" UNIQUE("theme_id","daily_candle_id")
);
--> statement-breakpoint
CREATE TABLE "intraday_program_trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"daily_candle_id" bigint NOT NULL,
	"trade_time" time NOT NULL,
	"sell_amount" numeric(18, 0) NOT NULL,
	"buy_amount" numeric(18, 0) NOT NULL,
	"net_buy_amount" numeric(18, 0) NOT NULL,
	CONSTRAINT "uq_intraday_program_time" UNIQUE("daily_candle_id","trade_time")
);
--> statement-breakpoint
CREATE TABLE "minute_candles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"daily_candle_id" bigint NOT NULL,
	"trade_time" time NOT NULL,
	"open_price" numeric(18, 0) NOT NULL,
	"high_price" numeric(18, 0) NOT NULL,
	"low_price" numeric(18, 0) NOT NULL,
	"close_price" numeric(18, 0) NOT NULL,
	"trading_volume" bigint NOT NULL,
	"trading_amount" numeric(18, 0) NOT NULL,
	"open_rate_krx" numeric(8, 4),
	"high_rate_krx" numeric(8, 4),
	"low_rate_krx" numeric(8, 4),
	"close_rate_krx" numeric(8, 4),
	"open_rate_nxt" numeric(8, 4),
	"high_rate_nxt" numeric(8, 4),
	"low_rate_nxt" numeric(8, 4),
	"close_rate_nxt" numeric(8, 4),
	CONSTRAINT "uq_minute_candles_candle_time" UNIQUE("daily_candle_id","trade_time")
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"stock_code" varchar(10) PRIMARY KEY NOT NULL,
	"stock_name" varchar(100) NOT NULL,
	"market_type" varchar(20),
	"market_name" varchar(50),
	"is_nxt_available" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"theme_id" bigserial PRIMARY KEY NOT NULL,
	"theme_name" varchar(100) NOT NULL,
	CONSTRAINT "themes_theme_name_unique" UNIQUE("theme_name")
);
--> statement-breakpoint
ALTER TABLE "daily_candles" ADD CONSTRAINT "daily_candles_stock_code_stocks_stock_code_fk" FOREIGN KEY ("stock_code") REFERENCES "public"."stocks"("stock_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_theme_mappings" ADD CONSTRAINT "daily_theme_mappings_theme_id_themes_theme_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("theme_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_theme_mappings" ADD CONSTRAINT "daily_theme_mappings_daily_candle_id_daily_candles_id_fk" FOREIGN KEY ("daily_candle_id") REFERENCES "public"."daily_candles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intraday_program_trades" ADD CONSTRAINT "intraday_program_trades_daily_candle_id_daily_candles_id_fk" FOREIGN KEY ("daily_candle_id") REFERENCES "public"."daily_candles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_candles" ADD CONSTRAINT "minute_candles_daily_candle_id_daily_candles_id_fk" FOREIGN KEY ("daily_candle_id") REFERENCES "public"."daily_candles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_candles_date" ON "daily_candles" USING btree ("trade_date");--> statement-breakpoint
CREATE INDEX "idx_daily_candles_stock_code" ON "daily_candles" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "idx_daily_theme_mapping_candle" ON "daily_theme_mappings" USING btree ("daily_candle_id");--> statement-breakpoint
CREATE INDEX "idx_program_trades_time" ON "intraday_program_trades" USING btree ("trade_time");--> statement-breakpoint
CREATE INDEX "idx_minute_candles_daily_id" ON "minute_candles" USING btree ("daily_candle_id");