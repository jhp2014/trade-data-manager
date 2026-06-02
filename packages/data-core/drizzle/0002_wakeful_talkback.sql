CREATE TABLE "review_manual_key" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_review_manual_key_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "idx_review_manual_key_order" ON "review_manual_key" USING btree ("sort_order");