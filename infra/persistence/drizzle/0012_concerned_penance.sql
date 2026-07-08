CREATE TABLE "curation"."hypothesis_filters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"expr" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_hyp_filter_name" UNIQUE("name")
);
