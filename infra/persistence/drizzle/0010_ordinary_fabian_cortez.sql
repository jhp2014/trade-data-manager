CREATE TABLE "curation"."hypotheses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curation"."hypothesis_points" (
	"hypothesis_id" bigint NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time NOT NULL,
	CONSTRAINT "hypothesis_points_hypothesis_id_stock_code_trade_date_trade_time_pk" PRIMARY KEY("hypothesis_id","stock_code","trade_date","trade_time")
);
--> statement-breakpoint
CREATE TABLE "curation"."hypothesis_relations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"from_id" bigint NOT NULL,
	"to_id" bigint NOT NULL,
	"relation_type" varchar(20) NOT NULL,
	"note" text,
	CONSTRAINT "uq_hyp_rel" UNIQUE("from_id","relation_type","to_id")
);
--> statement-breakpoint
ALTER TABLE "curation"."review_points" ADD COLUMN "type" varchar(40);--> statement-breakpoint
ALTER TABLE "curation"."review_points" ADD COLUMN "outcome" varchar(20);--> statement-breakpoint
ALTER TABLE "curation"."hypothesis_points" ADD CONSTRAINT "hypothesis_points_hypothesis_id_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "curation"."hypotheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."hypothesis_points" ADD CONSTRAINT "fk_hyp_points_review_point" FOREIGN KEY ("stock_code","trade_date","trade_time") REFERENCES "curation"."review_points"("stock_code","trade_date","trade_time") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."hypothesis_relations" ADD CONSTRAINT "hypothesis_relations_from_id_hypotheses_id_fk" FOREIGN KEY ("from_id") REFERENCES "curation"."hypotheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."hypothesis_relations" ADD CONSTRAINT "hypothesis_relations_to_id_hypotheses_id_fk" FOREIGN KEY ("to_id") REFERENCES "curation"."hypotheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hyp_points_point" ON "curation"."hypothesis_points" USING btree ("stock_code","trade_date","trade_time");--> statement-breakpoint
CREATE INDEX "idx_hyp_rel_to" ON "curation"."hypothesis_relations" USING btree ("to_id");