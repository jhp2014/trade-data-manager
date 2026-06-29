CREATE TABLE "market"."stock_news" (
	"published_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"srno" bigint NOT NULL,
	"published_time" time NOT NULL,
	"title" text NOT NULL,
	"source_code" varchar(4) NOT NULL,
	"source_name" varchar(40) NOT NULL,
	"category_code" varchar(12) NOT NULL,
	CONSTRAINT "stock_news_stock_code_published_date_srno_pk" PRIMARY KEY("stock_code","published_date","srno")
) PARTITION BY RANGE ("published_date");
--> statement-breakpoint
-- 뉴스 월별 파티션을 온디맨드로 생성하는 헬퍼(멱등). target 이 속한 달의 파티션이 없으면 만든다.
-- 적재 경로(DrizzleStockNewsRepository.saveHeadlines)가 INSERT 전에 호출한다. 분봉 ensure_minute_partition 미러.
CREATE OR REPLACE FUNCTION "market"."ensure_stock_news_partition"(target date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	m date := date_trunc('month', target)::date;
	pname text := 'stock_news_' || to_char(m, 'YYYYMM');
BEGIN
	EXECUTE format(
		'CREATE TABLE IF NOT EXISTS "market".%I PARTITION OF "market"."stock_news" FOR VALUES FROM (%L) TO (%L)',
		pname, m, (m + interval '1 month')::date
	);
END $$;
