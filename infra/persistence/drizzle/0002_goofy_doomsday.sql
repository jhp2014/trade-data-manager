CREATE TABLE "market"."daily_issues" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market"."daily_issues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trade_date" date NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"issue" varchar(100) DEFAULT '미분류' NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_daily_issues_natural" UNIQUE("trade_date","stock_code","issue")
);
--> statement-breakpoint
CREATE INDEX "idx_daily_issues_date_issue" ON "market"."daily_issues" USING btree ("trade_date","issue");--> statement-breakpoint
CREATE INDEX "idx_daily_issues_stock" ON "market"."daily_issues" USING btree ("stock_code");