ALTER TABLE "intraday_program_trades" RENAME TO "intraday_program_amounts";--> statement-breakpoint
ALTER TABLE "intraday_program_amounts" DROP CONSTRAINT "intraday_program_trades_daily_candle_id_daily_candles_id_fk";
--> statement-breakpoint
DROP INDEX "idx_program_trades_time";--> statement-breakpoint
ALTER TABLE "intraday_program_amounts" ADD CONSTRAINT "intraday_program_amounts_daily_candle_id_daily_candles_id_fk" FOREIGN KEY ("daily_candle_id") REFERENCES "public"."daily_candles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_program_amounts_time" ON "intraday_program_amounts" USING btree ("trade_time");