DROP TABLE "curation"."daily_issues" CASCADE;--> statement-breakpoint
CREATE TABLE "curation"."daily_comments" (
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"comment" text NOT NULL,
	"author" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_comments_trade_date_stock_code_pk" PRIMARY KEY("trade_date","stock_code")
);
--> statement-breakpoint
CREATE INDEX "idx_daily_comments_stock" ON "curation"."daily_comments" USING btree ("stock_code");
