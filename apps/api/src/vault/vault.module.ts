import { Module } from "@nestjs/common";
import { ReviewNotesController } from "./reviewNotes.controller.js";
import { VAULT_NOTES } from "./tokens.js";
import { VaultNotes } from "./vaultNotes.js";
import { vaultDirFromEnv } from "./vaultEnv.js";

// 복기 vault 슬라이스 — pool 도 market 데이터도 안 쓰므로 MarketModule 과 수명을 섞지 않는다.
@Module({
    controllers: [ReviewNotesController],
    providers: [{ provide: VAULT_NOTES, useFactory: (): VaultNotes => new VaultNotes(vaultDirFromEnv()) }],
})
export class VaultModule {}
