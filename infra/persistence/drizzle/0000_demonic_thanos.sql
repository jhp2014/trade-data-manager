CREATE SCHEMA "market";
--> statement-breakpoint
CREATE TABLE "market"."daily_candles" (
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"open_krx" integer NOT NULL,
	"high_krx" integer NOT NULL,
	"low_krx" integer NOT NULL,
	"close_krx" integer NOT NULL,
	"volume_krx" bigint NOT NULL,
	"amount_krx" bigint NOT NULL,
	"open_un" integer NOT NULL,
	"high_un" integer NOT NULL,
	"low_un" integer NOT NULL,
	"close_un" integer NOT NULL,
	"volume_un" bigint NOT NULL,
	"amount_un" bigint NOT NULL,
	CONSTRAINT "daily_candles_trade_date_stock_code_pk" PRIMARY KEY("trade_date","stock_code")
);
--> statement-breakpoint
CREATE TABLE "market"."daily_market_cap" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"market_cap" bigint NOT NULL,
	CONSTRAINT "daily_market_cap_stock_code_trade_date_pk" PRIMARY KEY("stock_code","trade_date")
);
--> statement-breakpoint
CREATE TABLE "market"."minute_candles" (
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_time" time NOT NULL,
	"open_un" integer NOT NULL,
	"high_un" integer NOT NULL,
	"low_un" integer NOT NULL,
	"close_un" integer NOT NULL,
	"volume_un" bigint NOT NULL,
	"open_krx" integer,
	"high_krx" integer,
	"low_krx" integer,
	"close_krx" integer,
	"volume_krx" bigint,
	CONSTRAINT "minute_candles_stock_code_trade_date_trade_time_pk" PRIMARY KEY("stock_code","trade_date","trade_time")
) PARTITION BY RANGE ("trade_date");
--> statement-breakpoint
-- 분봉 월별 파티션을 온디맨드로 생성하는 헬퍼(멱등). target 이 속한 달의 파티션이 없으면 만든다.
-- 적재 경로(DrizzleMinuteCandleRepository.saveMinuteCandles)가 INSERT 전에 호출한다.
-- 미리 N년치를 박지 않으므로 "기한 만료" 없이 데이터가 들어오는 달만큼 자동 확장된다.
CREATE OR REPLACE FUNCTION "market"."ensure_minute_partition"(target date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	m date := date_trunc('month', target)::date;
	pname text := 'minute_candles_' || to_char(m, 'YYYYMM');
BEGIN
	EXECUTE format(
		'CREATE TABLE IF NOT EXISTS "market".%I PARTITION OF "market"."minute_candles" FOR VALUES FROM (%L) TO (%L)',
		pname, m, (m + interval '1 month')::date
	);
END $$;
--> statement-breakpoint
CREATE TABLE "market"."stock_master" (
	"stock_code" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"market" varchar(20) NOT NULL,
	"listing_date" date,
	"ipo_price" integer
);
--> statement-breakpoint
CREATE INDEX "idx_daily_candles_date" ON "market"."daily_candles" USING btree ("trade_date");--> statement-breakpoint
CREATE INDEX "idx_daily_candles_stock" ON "market"."daily_candles" USING btree ("stock_code");