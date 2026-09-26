// 자동 타점 격자 배선 — PointGrids 는 **단일 인스턴스**여야 한다(DERIVED_CACHE 와 같은 이유:
// 인스턴스가 갈리면 inFlight·상주 메모·세대가 갈려 같은 요청이 두 번 굽는다).
// deps 는 axisDepsOf 재사용(recon 과 같은 한 벌 — curation 읽기는 로컬 미러 경로).
// groups(좌표 라벨)도 **로컬 미러**다(DrizzleGroupRepository(marketPool)).
import type { Provider } from "@nestjs/common";
import { createDb, DrizzleGroupRepository } from "@trade-data-manager/persistence";
import { axisDepsOf } from "./axisDeps.js";
import { MARKET_POOL, POINT_GRIDS } from "../tokens.js";
import type { Pool } from "../pool.js";
import { fileGridStore } from "./gridStore.js";
import { PointGrids } from "./pointGrids.js";
import { PointGridController } from "./pointGrid.controller.js";

export const gridProviders: Provider[] = [
    {
        provide: POINT_GRIDS,
        useFactory: (marketPool: Pool): PointGrids =>
            new PointGrids({
                deps: axisDepsOf(marketPool),
                groups: new DrizzleGroupRepository(createDb(marketPool)),
                store: fileGridStore(),
            }),
        inject: [MARKET_POOL],
    },
];

export const gridControllers = [PointGridController];
