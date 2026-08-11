CREATE TABLE "curation"."group_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time
);
--> statement-breakpoint
CREATE TABLE "curation"."groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" varchar(10) NOT NULL,
	"parent_id" bigint,
	"map_id" bigint,
	"x" double precision,
	"y" double precision,
	CONSTRAINT "uq_group_name" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "curation"."group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "curation"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."group_members" ADD CONSTRAINT "fk_group_member_review_point" FOREIGN KEY ("stock_code","trade_date","trade_time") REFERENCES "curation"."review_points"("stock_code","trade_date","trade_time") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curation"."groups" ADD CONSTRAINT "fk_group_parent" FOREIGN KEY ("parent_id") REFERENCES "curation"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_group_member_day" ON "curation"."group_members" USING btree ("group_id","stock_code","trade_date") WHERE "curation"."group_members"."trade_time" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_group_member_point" ON "curation"."group_members" USING btree ("group_id","stock_code","trade_date","trade_time") WHERE "curation"."group_members"."trade_time" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_group_members_group" ON "curation"."group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_group_members_item" ON "curation"."group_members" USING btree ("stock_code","trade_date");--> statement-breakpoint
CREATE INDEX "idx_groups_map" ON "curation"."groups" USING btree ("map_id");--> statement-breakpoint
-- ── 데이터 이관(손으로 덧붙임 — drizzle 은 DDL 만 낸다) ──────────────────────
-- 옛 태그 사전 → 그룹. id 를 그대로 옮겨 부착의 참조가 안 깨진다.
INSERT INTO "curation"."groups" ("id","name","scope")
SELECT "id","name",'point' FROM "curation"."tags";--> statement-breakpoint
-- id 를 직접 넣었으므로 시퀀스를 최대값 뒤로 밀어 둔다(안 하면 다음 INSERT 가 1번부터 충돌).
SELECT setval(pg_get_serial_sequence('curation.groups','id'), COALESCE((SELECT MAX("id") FROM "curation"."groups"), 1), true);--> statement-breakpoint
-- scope 는 실제 부착이 있는 층위로. 둘 다 있으면 타점이 이긴다(현 데이터엔 차트 부착 0건).
UPDATE "curation"."groups" g SET "scope" = 'day'
WHERE EXISTS (SELECT 1 FROM "curation"."chart_tags" c WHERE c."tag_id" = g."id")
  AND NOT EXISTS (SELECT 1 FROM "curation"."review_point_tags" r WHERE r."tag_id" = g."id");--> statement-breakpoint
-- 타점 부착 → 멤버(시각 있음)
INSERT INTO "curation"."group_members" ("group_id","stock_code","trade_date","trade_time")
SELECT "tag_id","stock_code","trade_date","trade_time" FROM "curation"."review_point_tags";--> statement-breakpoint
-- 차트 부착 → 멤버(시각 NULL = 하루 소속)
INSERT INTO "curation"."group_members" ("group_id","stock_code","trade_date","trade_time")
SELECT "tag_id","stock_code","trade_date",NULL FROM "curation"."chart_tags";
