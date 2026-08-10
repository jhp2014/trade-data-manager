CREATE TABLE "curation"."map_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_id" bigint NOT NULL,
	"parent_id" bigint,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curation"."map_placements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_id" bigint NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"group_id" bigint
);
--> statement-breakpoint
CREATE TABLE "curation"."maps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" varchar(10) NOT NULL,
	CONSTRAINT "uq_map_name" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "curation"."map_groups" ADD CONSTRAINT "map_groups_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "curation"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."map_groups" ADD CONSTRAINT "fk_map_group_parent" FOREIGN KEY ("parent_id") REFERENCES "curation"."map_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."map_placements" ADD CONSTRAINT "map_placements_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "curation"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."map_placements" ADD CONSTRAINT "map_placements_group_id_map_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "curation"."map_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."map_placements" ADD CONSTRAINT "fk_map_placement_review_point" FOREIGN KEY ("stock_code","trade_date","trade_time") REFERENCES "curation"."review_points"("stock_code","trade_date","trade_time") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_map_groups_map" ON "curation"."map_groups" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "idx_map_placements_map" ON "curation"."map_placements" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "idx_map_placements_item" ON "curation"."map_placements" USING btree ("stock_code","trade_date");--> statement-breakpoint
CREATE INDEX "idx_map_placements_group" ON "curation"."map_placements" USING btree ("group_id");