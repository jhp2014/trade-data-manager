import { Module } from "@nestjs/common";
import { MarketModule } from "./market/market.module.js";
import { VaultModule } from "./vault/vault.module.js";

// 루트 모듈 — 슬라이스별 feature 모듈을 조립한다. MarketModule(시장·큐레이션) · VaultModule(복기 노트 파일 읽기).
@Module({
    imports: [MarketModule, VaultModule],
})
export class AppModule {}
