-- 유령 slot 정리 — 배치가 하나도 없는 slot 은 존재하면 안 된다(place 가 비워진 slot 을 GC 한다).
-- 실제로 축 11 에 order_key=-1 인 빈 slot(id 40)이 남아, 같은 자리의 실 slot(id 74, 배치 4건)과
-- 충돌하고 있었다. 아래 유니크 제약을 걸려면 먼저 치워야 하고, 그 제약이 재발을 막는다.
-- 하드코딩하지 않는다 — 협업자 DB 에도 같은 유령이 있을 수 있고, 조건이 곧 "유령"의 정의다.
DELETE FROM "curation"."rank_slots" AS s
WHERE NOT EXISTS (
    SELECT 1 FROM "curation"."rank_placements" AS p
    WHERE p."slot_id" = s."id" AND p."axis_id" = s."axis_id"
);
--> statement-breakpoint
ALTER TABLE "curation"."rank_slots" ADD CONSTRAINT "uq_rank_slot_position" UNIQUE("axis_id","order_key");
