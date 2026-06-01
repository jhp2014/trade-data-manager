CREATE TABLE "review_point" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"review_target_id" bigint NOT NULL,
	"trade_time" time NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_review_point_target_time" UNIQUE("review_target_id","trade_time")
);
--> statement-breakpoint
CREATE TABLE "review_target" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"stock_name" varchar(100),
	"line_targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_file" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_review_target_code_date" UNIQUE("stock_code","trade_date")
);
--> statement-breakpoint
ALTER TABLE "review_point" ADD CONSTRAINT "review_point_review_target_id_review_target_id_fk" FOREIGN KEY ("review_target_id") REFERENCES "public"."review_target"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_review_point_target" ON "review_point" USING btree ("review_target_id");--> statement-breakpoint
CREATE INDEX "idx_review_target_trade_date" ON "review_target" USING btree ("trade_date");