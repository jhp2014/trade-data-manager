-- daily_market_cap 을 (종목, 날) 일별 속성 테이블로 확장 — KRX 일별매매정보를 받아 적는다.
--   list_shares = LIST_SHRS(상장주식수, 주)
--   sect_tp_nm  = SECT_TP_NM(소속부 원문. KOSPI 는 빈값이라 NULL, 코스닥 전용 정보)
-- 옛 역산 행이 남아 있어 지금은 NULL 허용 — KRX 재백필로 전량 덮은 뒤 NOT NULL 을 조인다(후속 마이그).
-- 손으로 쓴 마이그: market 설정의 db:generate 는 curation 테이블이 별도 저널로 갈려 나가면서
-- tablesResolver 가 대화형 프롬프트를 요구해 못 쓴다.
ALTER TABLE "market"."daily_market_cap" ADD COLUMN IF NOT EXISTS "list_shares" bigint;--> statement-breakpoint
ALTER TABLE "market"."daily_market_cap" ADD COLUMN IF NOT EXISTS "sect_tp_nm" varchar(40);
