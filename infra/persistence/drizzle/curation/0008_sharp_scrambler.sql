CREATE TABLE "curation"."chart_anchors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"trade_date" date NOT NULL,
	"trade_time" time,
	"param" varchar(40) NOT NULL,
	"anchor_date" date NOT NULL,
	"anchor_time" time,
	"field" varchar(5),
	"market" varchar(3)
);
--> statement-breakpoint
CREATE INDEX "idx_chart_anchors_chart" ON "curation"."chart_anchors" USING btree ("stock_code","trade_date");--> statement-breakpoint
CREATE INDEX "idx_chart_anchors_param" ON "curation"."chart_anchors" USING btree ("param","trade_date");--> statement-breakpoint
-- 데이터 이관 ①: point_anchors → chart_anchors. 타점 소유를 차트 소유로 접는다(trade_time := NULL).
-- 같은 날 여러 타점이 같은 좌표를 가리키던 행은 DISTINCT 로 한 행이 된다. 좌표가 다른 행은 나란히 남는다
-- (baseline 다중 허용 — 읽기 쪽 리졸버가 "가격 최저"를 고른다).
INSERT INTO "curation"."chart_anchors" ("stock_code","trade_date","trade_time","param","anchor_date","anchor_time","field","market")
SELECT DISTINCT "stock_code", "trade_date", NULL::time, "param", "anchor_date", "anchor_time", "field", "market"
FROM "curation"."point_anchors";--> statement-breakpoint
-- 데이터 이관 ②: price_lines → chart_anchors. 선 = param 'baseline' 앵커. market 은 'un'(선은 시장 미저장이었고
-- 정책상 UN 통일), field 는 보존(실데이터 전부 'high' — 2026-08-05 실측), memo 는 전무라 버린다.
-- 테이블 내부 중복(같은 좌표 두 번 긋기)과 ①에서 이미 들어온 기준선 앵커(9건 전부 선과 좌표 일치 실측)를 걸러낸다.
INSERT INTO "curation"."chart_anchors" ("stock_code","trade_date","trade_time","param","anchor_date","anchor_time","field","market")
SELECT DISTINCT pl."stock_code", pl."trade_date", NULL::time, 'baseline', pl."anchor_date", pl."anchor_time", pl."field", 'un'
FROM "curation"."price_lines" pl
WHERE NOT EXISTS (
  SELECT 1 FROM "curation"."chart_anchors" ca
  WHERE ca."stock_code" = pl."stock_code" AND ca."trade_date" = pl."trade_date" AND ca."param" = 'baseline'
    AND ca."anchor_date" = pl."anchor_date" AND ca."anchor_time" IS NOT DISTINCT FROM pl."anchor_time"
    AND ca."field" = pl."field" AND ca."market" = 'un'
);