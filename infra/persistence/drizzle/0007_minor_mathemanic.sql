CREATE TABLE "market"."daily_candles_raw" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
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
	CONSTRAINT "daily_candles_raw_stock_code_trade_date_pk" PRIMARY KEY("stock_code","trade_date")
);
