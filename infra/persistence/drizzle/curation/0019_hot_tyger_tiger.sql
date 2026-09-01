-- 타점 층위 폐지(2026-09-01) — 손 타점을 버리고 큐레이션을 하루(차트) 한 층위로.
--
-- ⚠ 앞머리 DELETE 두 줄은 **손으로 넣었다**(drizzle-kit 은 데이터를 안 지운다). 순서가 규칙이다:
--   ① 타점 멤버십을 먼저 지운다 — 안 지우면 trade_time 이 빠지면서 하루 멤버십과 충돌해
--      아래 uq_group_member_day 생성이 실패한다(같은 그룹·종목·날짜가 둘이 된다).
--   ② 타점 그룹(scope='point')을 지운다 — scope 칸이 사라지면 뜻 없는 하루 그룹으로 남는다.
--   ③ review_points 는 DROP TABLE 이 가져간다(CASCADE 는 제약을 걷을 뿐 참조 행은 안 지운다 — ①이 그 몫).
-- ⚠ FK 해제를 DROP TABLE **앞으로** 옮긴 것도 손질이다: 생성기는 뒤에 놓는데, 그러면 CASCADE 가 이미
--   걷어간 제약을 다시 지우려다 "does not exist" 로 죽는다(pglite 리허설에서 잡힘).
-- 실측(적용 직전): review_points 85행 · 타점 멤버십 79행 · 하루 멤버십 135행 · groups point 4/day 7 ·
-- chart_anchors 7,079행(trade_time 있는 것 0). 되돌릴 수 없다 — 직전 야간 백업이 유일한 복구 지점.
DELETE FROM "curation"."group_members" WHERE "trade_time" IS NOT NULL;--> statement-breakpoint
DELETE FROM "curation"."groups" WHERE "scope" = 'point';--> statement-breakpoint
ALTER TABLE "curation"."group_members" DROP CONSTRAINT "fk_group_member_review_point";--> statement-breakpoint
ALTER TABLE "curation"."review_points" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "curation"."review_points" CASCADE;--> statement-breakpoint
ALTER TABLE "curation"."chart_anchors" DROP CONSTRAINT "uq_chart_anchor_identity";--> statement-breakpoint
DROP INDEX "curation"."uq_group_member_point";--> statement-breakpoint
DROP INDEX "curation"."uq_group_member_day";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_group_member_day" ON "curation"."group_members" USING btree ("group_id","stock_code","trade_date");--> statement-breakpoint
ALTER TABLE "curation"."chart_anchors" DROP COLUMN "trade_time";--> statement-breakpoint
ALTER TABLE "curation"."group_members" DROP COLUMN "trade_time";--> statement-breakpoint
ALTER TABLE "curation"."groups" DROP COLUMN "scope";--> statement-breakpoint
ALTER TABLE "curation"."chart_anchors" ADD CONSTRAINT "uq_chart_anchor_identity" UNIQUE NULLS NOT DISTINCT("stock_code","trade_date","param","anchor_date","anchor_time","field","market");
