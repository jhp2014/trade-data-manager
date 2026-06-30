ALTER TABLE "market"."daily_issues" DROP CONSTRAINT "uq_daily_issues_natural";--> statement-breakpoint
ALTER TABLE "market"."daily_issues" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "market"."daily_issues" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "market"."daily_issues" ADD CONSTRAINT "daily_issues_trade_date_stock_code_issue_pk" PRIMARY KEY("trade_date","stock_code","issue");