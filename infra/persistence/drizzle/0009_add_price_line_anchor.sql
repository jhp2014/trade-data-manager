-- 옛 price 기반 선은 앵커(캔들 좌표)로 역변환 불가 → 폐기(재작도 가능한 소량 큐레이션). anchor_date NOT NULL 추가 전 비운다.
TRUNCATE TABLE "curation"."price_lines";--> statement-breakpoint
ALTER TABLE "curation"."price_lines" ADD COLUMN "anchor_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "curation"."price_lines" ADD COLUMN "anchor_time" time;--> statement-breakpoint
ALTER TABLE "curation"."price_lines" ADD COLUMN "field" varchar(5) DEFAULT 'high' NOT NULL;