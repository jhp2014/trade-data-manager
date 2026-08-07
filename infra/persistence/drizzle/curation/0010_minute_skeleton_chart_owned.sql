-- 분봉 골격 소유 이전: 타점(time 있음) → 차트(time 없음). 스키마 무변경, 데이터만.
-- 옛 타점 소유 행은 병합하지 않고 삭제한다(사용자 확정 — 몇 개 안 되고 다시 찍는 게 깔끔).
-- 병합하지 않는 이유: 같은 차트의 두 타점이 같은 분봉을 각자 찍었을 수 있어(당시엔 정당) time 만 지우면
-- 중복 행이 생기고, 저장 경로의 "같은 점 재지정 거부"가 DB 에 없어(surrogate id) 조용히 남는다.
DELETE FROM "curation"."chart_anchors" WHERE "param" = 'skeleton-minute' AND "trade_time" IS NOT NULL;
