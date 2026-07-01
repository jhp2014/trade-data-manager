CREATE TABLE "curation"."daily_issues" (
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"issue" varchar(100) DEFAULT '미분류' NOT NULL,
	"comment" text,
	"author" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_issues_trade_date_stock_code_issue_pk" PRIMARY KEY("trade_date","stock_code","issue")
);
--> statement-breakpoint
CREATE TABLE "curation"."price_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"price" integer NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "curation"."review_points" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time NOT NULL,
	"memo" text,
	CONSTRAINT "review_points_stock_code_trade_date_trade_time_pk" PRIMARY KEY("stock_code","trade_date","trade_time")
);
--> statement-breakpoint
CREATE INDEX "idx_daily_issues_date_issue" ON "curation"."daily_issues" USING btree ("trade_date","issue");--> statement-breakpoint
CREATE INDEX "idx_daily_issues_stock" ON "curation"."daily_issues" USING btree ("stock_code");--> statement-breakpoint
CREATE INDEX "idx_price_lines_chart" ON "curation"."price_lines" USING btree ("stock_code","trade_date");