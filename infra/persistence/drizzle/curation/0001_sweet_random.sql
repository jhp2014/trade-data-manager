CREATE TABLE "curation"."rank_axes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "uq_rank_axis_name" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "curation"."rank_placements" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time NOT NULL,
	"axis_id" bigint NOT NULL,
	"slot_id" bigint NOT NULL,
	CONSTRAINT "rank_placements_stock_code_trade_date_trade_time_axis_id_pk" PRIMARY KEY("stock_code","trade_date","trade_time","axis_id")
);
--> statement-breakpoint
CREATE TABLE "curation"."rank_slots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"axis_id" bigint NOT NULL,
	"order_key" double precision NOT NULL,
	CONSTRAINT "uq_rank_slot_axis_id" UNIQUE("axis_id","id")
);
--> statement-breakpoint
ALTER TABLE "curation"."rank_placements" ADD CONSTRAINT "fk_rank_placement_review_point" FOREIGN KEY ("stock_code","trade_date","trade_time") REFERENCES "curation"."review_points"("stock_code","trade_date","trade_time") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."rank_placements" ADD CONSTRAINT "fk_rank_placement_slot" FOREIGN KEY ("axis_id","slot_id") REFERENCES "curation"."rank_slots"("axis_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."rank_slots" ADD CONSTRAINT "rank_slots_axis_id_rank_axes_id_fk" FOREIGN KEY ("axis_id") REFERENCES "curation"."rank_axes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_rank_placements_slot" ON "curation"."rank_placements" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "idx_rank_slots_axis_order" ON "curation"."rank_slots" USING btree ("axis_id","order_key");