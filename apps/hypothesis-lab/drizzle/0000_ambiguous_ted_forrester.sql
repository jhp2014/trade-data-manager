CREATE SCHEMA "hypothesis";
--> statement-breakpoint
CREATE TABLE "hypothesis"."cases" (
	"case_id" varchar(40) PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"stock_name" varchar(100),
	"trade_date" date NOT NULL,
	"trade_time" time,
	"outcome" varchar(20),
	"note" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypothesis"."hypotheses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypothesis"."hypothesis_cases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hypothesis_id" bigint NOT NULL,
	"case_id" varchar(40) NOT NULL,
	"note" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_hcase_hyp_case" UNIQUE("hypothesis_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "hypothesis"."hypothesis_relations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"from_hypothesis_id" bigint NOT NULL,
	"to_hypothesis_id" bigint NOT NULL,
	"relation_type" varchar(20) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_rel_from_type_to" UNIQUE("from_hypothesis_id","relation_type","to_hypothesis_id")
);
--> statement-breakpoint
CREATE TABLE "hypothesis"."hypothesis_tags" (
	"hypothesis_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "hypothesis_tags_hypothesis_id_tag_id_pk" PRIMARY KEY("hypothesis_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "hypothesis"."tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tag_name" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "hypothesis"."hypothesis_cases" ADD CONSTRAINT "hypothesis_cases_hypothesis_id_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "hypothesis"."hypotheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis"."hypothesis_cases" ADD CONSTRAINT "hypothesis_cases_case_id_cases_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "hypothesis"."cases"("case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis"."hypothesis_relations" ADD CONSTRAINT "hypothesis_relations_from_hypothesis_id_hypotheses_id_fk" FOREIGN KEY ("from_hypothesis_id") REFERENCES "hypothesis"."hypotheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis"."hypothesis_relations" ADD CONSTRAINT "hypothesis_relations_to_hypothesis_id_hypotheses_id_fk" FOREIGN KEY ("to_hypothesis_id") REFERENCES "hypothesis"."hypotheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis"."hypothesis_tags" ADD CONSTRAINT "hypothesis_tags_hypothesis_id_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "hypothesis"."hypotheses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypothesis"."hypothesis_tags" ADD CONSTRAINT "hypothesis_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "hypothesis"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hcase_case" ON "hypothesis"."hypothesis_cases" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_rel_to" ON "hypothesis"."hypothesis_relations" USING btree ("to_hypothesis_id");