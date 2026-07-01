import { Module } from "@nestjs/common";
import { MarketModule } from "./market/market.module.js";

// 루트 모듈 — 슬라이스별 feature 모듈을 조립한다. 지금은 MarketModule 하나.
@Module({
    imports: [MarketModule],
})
export class AppModule {}
