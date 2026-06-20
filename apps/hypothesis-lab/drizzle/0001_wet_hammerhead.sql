ALTER TABLE "hypothesis"."cases" ADD COLUMN "outcome" varchar(20);--> statement-breakpoint
ALTER TABLE "hypothesis"."hypothesis_cases" DROP COLUMN "outcome";