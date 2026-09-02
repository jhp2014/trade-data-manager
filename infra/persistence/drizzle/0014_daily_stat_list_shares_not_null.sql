-- KRX 재백필로 daily_market_cap 전량을 덮었으므로 list_shares 를 NOT NULL 로 조인다.
-- (0013 에서 NULL 허용으로 연 이유는 옛 역산 행이 남아 있었기 때문 — 이제 없다.)
-- 적용 전 실측: 1,445,363행 / list_shares 결손 0 / market_cap <= 0 인 행 0.
-- sect_tp_nm 은 NULL 을 유지한다 — KOSPI 는 소속부가 빈값이라 결손이 정상이다(코스닥 전용 정보).
-- 손으로 쓴 마이그: market 설정의 db:generate 는 curation 테이블이 별도 저널로 갈려 나가면서
-- tablesResolver 가 대화형 프롬프트를 요구해 못 쓴다(0013 과 같은 이유).
-- 옛 역산 행(list_shares 없음)을 먼저 지운다 — **이 마이그가 어느 DB 에서든 돌게 하는 조건**이다.
-- 지워도 되는 이유: 그 행들이 바로 이번에 폐기한 역산 산물이고(0 이하·과대·과소), KRX 재수집으로
-- 언제든 되살릴 수 있다(`ingest daily-stats <from> <to>`). 이 레포는 market 스키마를 각자 로컬
-- Postgres 로 들고 있어(CLAUDE.md 데이터 계층) 재백필 시점이 사람마다 다르다.
DELETE FROM "market"."daily_market_cap" WHERE "list_shares" IS NULL;--> statement-breakpoint
ALTER TABLE "market"."daily_market_cap" ALTER COLUMN "list_shares" SET NOT NULL;
