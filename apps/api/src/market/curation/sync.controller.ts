import { Controller, Get, Post, Inject } from "@nestjs/common";
import type { CurationSyncStatus } from "@trade-data-manager/wire";
import { CURATION_SYNC } from "../tokens.js";
import { CurationSync } from "./curationSync.js";

// 로컬 미러 당겨오기 — 읽기 소스를 최신화한다. 쓰기(dual write)와 달리 **명시적으로 부를 때만** 돈다.
@Controller("curation/sync")
export class CurationSyncController {
    constructor(@Inject(CURATION_SYNC) private readonly sync: CurationSync) {}

    /** 마지막 동기화 시각 — 화면이 "얼마나 낡았나"를 상시 띄우는 근거. */
    @Get()
    status(): Promise<CurationSyncStatus> {
        return this.sync.status();
    }

    @Post()
    run(): Promise<CurationSyncStatus> {
        return this.sync.run();
    }
}
