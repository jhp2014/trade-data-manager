CREATE TABLE "curation"."group_members_point" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"time" time NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curation"."group_members_point" ADD CONSTRAINT "group_members_point_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "curation"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_group_member_point" ON "curation"."group_members_point" USING btree ("group_id","stock_code","trade_date","time");--> statement-breakpoint
CREATE INDEX "idx_group_members_point_group" ON "curation"."group_members_point" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_group_members_point_item" ON "curation"."group_members_point" USING btree ("stock_code","trade_date","time");