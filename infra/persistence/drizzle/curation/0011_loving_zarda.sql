CREATE TABLE "curation"."chart_tags" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "chart_tags_stock_code_trade_date_tag_id_pk" PRIMARY KEY("stock_code","trade_date","tag_id")
);
--> statement-breakpoint
ALTER TABLE "curation"."chart_tags" ADD CONSTRAINT "fk_chart_tag_tag" FOREIGN KEY ("tag_id") REFERENCES "curation"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chart_tags_tag" ON "curation"."chart_tags" USING btree ("tag_id");