CREATE TABLE "curation"."point_anchors" (
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time NOT NULL,
	"param" varchar(40) NOT NULL,
	"anchor_date" date NOT NULL,
	"anchor_time" time,
	"field" varchar(5),
	"market" varchar(3),
	CONSTRAINT "point_anchors_stock_code_trade_date_trade_time_param_pk" PRIMARY KEY("stock_code","trade_date","trade_time","param")
);
--> statement-breakpoint
ALTER TABLE "curation"."point_anchors" ADD CONSTRAINT "fk_point_anchor_review_point" FOREIGN KEY ("stock_code","trade_date","trade_time") REFERENCES "curation"."review_points"("stock_code","trade_date","trade_time") ON DELETE cascade ON UPDATE no action;