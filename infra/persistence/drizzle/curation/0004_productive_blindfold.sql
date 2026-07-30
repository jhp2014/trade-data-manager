CREATE TABLE "curation"."review_point_tags" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "review_point_tags_stock_code_trade_date_trade_time_tag_id_pk" PRIMARY KEY("stock_code","trade_date","trade_time","tag_id")
);
--> statement-breakpoint
CREATE TABLE "curation"."tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "uq_tag_name" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "curation"."review_point_tags" ADD CONSTRAINT "fk_review_point_tag_point" FOREIGN KEY ("stock_code","trade_date","trade_time") REFERENCES "curation"."review_points"("stock_code","trade_date","trade_time") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."review_point_tags" ADD CONSTRAINT "fk_review_point_tag_tag" FOREIGN KEY ("tag_id") REFERENCES "curation"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_review_point_tags_tag" ON "curation"."review_point_tags" USING btree ("tag_id");