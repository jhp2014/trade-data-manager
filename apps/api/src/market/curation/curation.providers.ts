import type { Provider } from "@nestjs/common";
import {
    createDb,
    DrizzleDailyCommentRepository,
    DrizzleChartAnchorRepository,
    DrizzleGroupRepository,
} from "@trade-data-manager/persistence";
import { CHART_ANCHOR_REPO, CHART_ANCHORS, DAILY_COMMENTS, GROUP_REPO, CURATION_SYNC, COMPUTED_AXES, MARKET_POOL, CURATION_POOL } from "../tokens.js";
import type { Pool } from "../pool.js";
import { curationRepo } from "./curationRepo.js";
import { DailyComments } from "./dailyComments.js";
import { ChartAnchors } from "./chartAnchors.js";
import { CurationSync } from "./curationSync.js";
import { ComputedAxes } from "../rank/computedAxes.js";
import { axisDepsOf } from "../rank/axisDeps.js";
import { ChartAnchorController } from "./chartAnchor.controller.js";
import { CommentController } from "./comment.controller.js";
import { RankController } from "./rank.controller.js";
import { GroupController } from "./group.controller.js";
import { CurationSyncController } from "./sync.controller.js";

// 큐레이션(사람 편집) 화면의 팩토리 묶음 — 모듈은 이 배열을 그대로 합친다(chart/board/curation/news 1:1).
export const curationControllers = [
    CurationSyncController,
    ChartAnchorController,
    CommentController,
    RankController,
    GroupController,
];

export const curationProviders: Provider[] = [
    {
        // 차트 앵커 저장소 — 읽기(컨트롤러 조회·계산 축)용. 쓰기는 유스케이스(CHART_ANCHORS)를 거친다.
        provide: CHART_ANCHOR_REPO,
        useFactory: (pool: Pool) => new DrizzleChartAnchorRepository(createDb(pool)), // 읽기 전용 → 로컬 미러
        inject: [MARKET_POOL],
    },
    {
        // 앵커 쓰기 유스케이스 — 불변식(레지스트리·owner grain·multiple 교체·타점 cascade) 소유.
        provide: CHART_ANCHORS,
        useFactory: (marketPool: Pool, curationPool: Pool): ChartAnchors =>
            new ChartAnchors(
                curationRepo((db) => new DrizzleChartAnchorRepository(db), ["add", "remove", "removeByParam"], "chartAnchor", marketPool, curationPool),
            ),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 당일 코멘트 유스케이스 — 빈값=삭제 규약과 author 소유(env). 보드도 같은 테이블을 읽지만 그건 DayBoards 가 자체 인스턴스로.
        provide: DAILY_COMMENTS,
        useFactory: (marketPool: Pool, curationPool: Pool): DailyComments =>
            new DailyComments(
                curationRepo((db) => new DrizzleDailyCommentRepository(db), ["upsert", "remove"], "dailyComment", marketPool, curationPool),
                process.env.CURATION_AUTHOR ?? "jonghun",
            ),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 계산 축 — day 축의 차트별 수치 + 축당 파일 캐시(증분·앵커 지문 자동 무효화).
        // 모집단(앵커·그룹)·시세 **전부 읽기라 로컬 한 DB**다.
        provide: COMPUTED_AXES,
        useFactory: (marketPool: Pool): ComputedAxes =>
            new ComputedAxes({
                groups: new DrizzleGroupRepository(createDb(marketPool)), // 읽기(모수 재료) — 로컬 미러
                axisDeps: axisDepsOf(marketPool),
            }),
        inject: [MARKET_POOL],
    },
    {
        // 타점 그룹 — repo 를 그대로 노출(사전 CRUD·전 타점 부착 피드·부착/해제). 축과 달리 순서가 없는 분류.
        provide: GROUP_REPO,
        useFactory: (marketPool: Pool, curationPool: Pool) =>
            curationRepo((db) => new DrizzleGroupRepository(db), ["createGroup", "renameGroup", "removeGroup", "attach", "detach", "setParent"], "group", marketPool, curationPool),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 미러 당겨오기 — 읽기 소스 갱신. 상태(마지막 동기화 시각) 읽기는 상주 MARKET_POOL 재사용
        // (미러는 market 과 같은 로컬 DB) — 분당 폴링이 커넥션을 새로 만들면 안 된다.
        provide: CURATION_SYNC,
        useFactory: (pool: Pool): CurationSync => new CurationSync(pool),
        inject: [MARKET_POOL],
    },
];
