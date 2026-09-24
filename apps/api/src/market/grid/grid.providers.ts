// 자동 타점 격자 배선 — PointGrids 는 **단일 인스턴스**여야 한다(DERIVED_CACHE 와 같은 이유:
// 인스턴스가 갈리면 inFlight·상주 메모·세대가 갈려 같은 요청이 두 번 굽는다).
// deps 는 axisDepsOf 재사용(계산 축·recon 과 같은 한 벌 — curation 읽기는 로컬 미러 경로).
// groups(좌표 라벨)도 **로컬 미러**다(DrizzleGroupRepository(marketPool) — ComputedAxes 배선과 같은 관용구).
import type { Provider } from "@nestjs/common";
import { createDb, DrizzleGroupRepository } from "@trade-data-manager/persistence";
import { axisDepsOf } from "../rank/axisDeps.js";
import { LABELED_POINT_FACTS, MARKET_POOL, POINT_GRIDS } from "../tokens.js";
import type { Pool } from "../pool.js";
import { fileGridStore } from "./gridStore.js";
import { PointGrids } from "./pointGrids.js";
import { PointGridController } from "./pointGrid.controller.js";
import { LabeledPointFacts } from "./labeledPointFacts.js";
import { LabeledPointFactController } from "./labeledPointFact.controller.js";

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
    {
        provide: LABELED_POINT_FACTS,
        // detect 미주입 = DEFAULT_GRID_OPTIONS — PointGrids 도 미주입이라 세션 창(봉 우주)이 같은 자다.
        useFactory: (marketPool: Pool): LabeledPointFacts =>
            new LabeledPointFacts({
                deps: axisDepsOf(marketPool),
                groups: new DrizzleGroupRepository(createDb(marketPool)),
            }),
        inject: [MARKET_POOL],
    },
];

export const gridControllers = [PointGridController, LabeledPointFactController];
