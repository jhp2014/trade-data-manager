ALTER TABLE "curation"."maps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "curation"."maps" CASCADE;--> statement-breakpoint
DROP INDEX "curation"."idx_groups_map";--> statement-breakpoint
ALTER TABLE "curation"."groups" DROP COLUMN "map_id";--> statement-breakpoint
ALTER TABLE "curation"."groups" DROP COLUMN "x";--> statement-breakpoint
ALTER TABLE "curation"."groups" DROP COLUMN "y";