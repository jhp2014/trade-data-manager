-- 텔레그램 뉴스 방 아카이브(decisions.md 「텔레그램 뉴스 방 아카이브」): NEWS_CHANNELS 9방 메시지 전부(2023~) + raw 박제.
-- 손으로 쓴 마이그: market 설정의 db:generate 는 curation 저널이 갈린 뒤 tablesResolver 가 대화형 프롬프트를
-- 요구해 못 쓴다(0013·0014 와 같은 이유). schema/market.ts 는 타입용으로만 같이 고쳤다.
-- pg_trgm: 부분일치 검색("전자"로 "삼성전자" — 텔레그램 서버 검색은 토큰 접두만). PG13+ trusted 라 슈퍼유저 불요.
--   ⚠ 확장은 public 에 둔다 — `restore -n market`(스키마 모드 복원)과 pglite testDb 는 확장을 따로 보장해야 한다.
-- search_text = STORED 생성 컬럼(본문+미리보기 제목+설명). 표현식 인덱스는 질의 식이 한 글자만 달라도 조용히
--   인덱스를 안 타서 컬럼으로 못 박는다. pg_dump 는 생성 컬럼 값을 덤프하지 않는다(복원 시 재계산).
-- 파티션 없음 — 실측 ~49만 행(stock_news 의 1/4).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;--> statement-breakpoint
CREATE TABLE "market"."telegram_channel" (
	"channel_id" bigint PRIMARY KEY NOT NULL,
	"peer" varchar(64) NOT NULL,
	"username" varchar(64),
	"title" text NOT NULL,
	"synced_max_id" integer,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market"."telegram_message" (
	"channel_id" bigint NOT NULL,
	"msg_id" integer NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"edited_at" timestamp with time zone,
	"text" text NOT NULL,
	"entities" jsonb NOT NULL,
	"wp_url" text,
	"wp_title" text,
	"wp_description" text,
	"wp_site" varchar(120),
	"fwd_channel_id" bigint,
	"fwd_msg_id" integer,
	"fwd_from_name" text,
	"fwd_posted_at" timestamp with time zone,
	"reply_to_msg_id" integer,
	"grouped_id" bigint,
	"media_kind" varchar(12) NOT NULL,
	"photo_id" bigint,
	"raw" jsonb NOT NULL,
	"search_text" text GENERATED ALWAYS AS (coalesce("text", '') || E'\n' || coalesce("wp_title", '') || E'\n' || coalesce("wp_description", '')) STORED,
	CONSTRAINT "telegram_message_channel_id_msg_id_pk" PRIMARY KEY("channel_id","msg_id")
);
--> statement-breakpoint
CREATE INDEX "telegram_message_posted_at_idx" ON "market"."telegram_message" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "telegram_message_search_trgm_idx" ON "market"."telegram_message" USING gin ("search_text" public.gin_trgm_ops);
