import type { Provider } from "@nestjs/common";
import {
    createDb,
    DrizzleDailyCandleRepository,
    DrizzleDailyCommentRepository,
    DrizzleChartAnchorRepository,
    DrizzleReviewPointRepository,
    DrizzleRankRepository,
    DrizzleGroupRepository,
    DrizzleCandidateDayRepository,
} from "@trade-data-manager/persistence";
import { CHART_ANCHOR_REPO, CHART_ANCHORS, REVIEW_POINT_REPO, DAILY_COMMENTS, RANK_REPO, GROUP_REPO, CANDIDATE_DAY_REPO, CURATION_SYNC, COMPUTED_AXES, SKELETON_SHAPES, MARKET_POOL, CURATION_POOL } from "../tokens.js";
import type { Pool } from "../pool.js";
import { curationRepo } from "./curationRepo.js";
import { DailyComments } from "./dailyComments.js";
import { ChartAnchors } from "./chartAnchors.js";
import { CurationSync } from "./curationSync.js";
import { ComputedAxes } from "../rank/computedAxes.js";
import { SkeletonShapes } from "../rank/skeletonShapes.js";
import { axisDepsOf } from "../rank/axisDeps.js";
import { ChartAnchorController } from "./chartAnchor.controller.js";
import { ReviewPointController } from "./reviewPoint.controller.js";
import { CommentController } from "./comment.controller.js";
import { RankController } from "./rank.controller.js";
import { GroupController } from "./group.controller.js";
import { CandidateDayController } from "./candidateDay.controller.js";
import { CurationSyncController } from "./sync.controller.js";
import { SkeletonController } from "../rank/skeleton.controller.js";

// 큐레이션(사람 편집) 화면의 팩토리 묶음 — 모듈은 이 배열을 그대로 합친다(chart/board/curation/news 1:1).
// SkeletonController 는 골격 좌표(SKELETON_SHAPES) 소비자라 여기 묶인다.
export const curationControllers = [
    CurationSyncController,
    ChartAnchorController,
    ReviewPointController,
    CommentController,
    RankController,
    SkeletonController,
    GroupController,
    CandidateDayController,
];

export const curationProviders: Provider[] = [
    {
        // 차트 앵커 저장소 — 읽기(컨트롤러 조회·계산 축)용. 쓰기는 유스케이스(CHART_ANCHORS)를 거친다.
        provide: CHART_ANCHOR_REPO,
        useFactory: (pool: Pool) => new DrizzleChartAnchorRepository(createDb(pool)), // 읽기 전용 → 로컬 미러
        inject: [MARKET_POOL],
    },
    {
        // 앵커 쓰기 유스케이스 — 불변식(레지스트리·owner grain·골격 집합·multiple 교체·타점 cascade) 소유.
        provide: CHART_ANCHORS,
        useFactory: (marketPool: Pool, curationPool: Pool): ChartAnchors =>
            new ChartAnchors(
                curationRepo((db) => new DrizzleChartAnchorRepository(db), ["add", "remove", "removeByParam", "removeByPoint"], "chartAnchor", marketPool, curationPool),
                curationRepo((db) => new DrizzleReviewPointRepository(db), ["upsert", "remove"], "reviewPoint", marketPool, curationPool),
            ),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 복기 타점 쓰기(사람 편집) — repo 를 그대로 노출(upsert/list/remove).
        provide: REVIEW_POINT_REPO,
        useFactory: (marketPool: Pool, curationPool: Pool) =>
            curationRepo((db) => new DrizzleReviewPointRepository(db), ["upsert", "remove"], "reviewPoint", marketPool, curationPool),
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
        // 순위 배치 — repo 를 그대로 노출(축 CRUD·줄 피드·배치/이동/제거). 조립(줄 렌더)은 클라 인메모리(옵션 A).
        provide: RANK_REPO,
        useFactory: (marketPool: Pool, curationPool: Pool) =>
            curationRepo((db) => new DrizzleRankRepository(db), ["createAxis", "renameAxis", "removeAxis", "place", "unplace"], "rank", marketPool, curationPool),
        inject: [MARKET_POOL, CURATION_POOL],
    },
    {
        // 계산 축 — 수식으로 나오는 축의 타점별 수치 + 축당 파일 캐시(증분·앵커 지문 자동 무효화).
        // 배치를 만들지 않으므로 rank repo 와 무관하다. 모집단(타점)·앵커·시세 **전부 읽기라 로컬 한 DB**다.
        provide: COMPUTED_AXES,
        useFactory: (marketPool: Pool): ComputedAxes =>
            new ComputedAxes({
                points: new DrizzleReviewPointRepository(createDb(marketPool)), // 읽기 — 로컬 미러
                axisDeps: axisDepsOf(marketPool),
            }),
        inject: [MARKET_POOL],
    },
    {
        // 골격 좌표 — 계산 축과 **같은 재료·다른 결과**(수치 하나가 아니라 피벗 좌표 그대로). 겹쳐 그리기용.
        // 캐시 없음(SkeletonShapes 주석) — 축이 파일 캐시를 갖는 것과 갈리는 지점이다.
        provide: SKELETON_SHAPES,
        useFactory: (marketPool: Pool): SkeletonShapes => {
            const db = createDb(marketPool);
            return new SkeletonShapes({
                points: new DrizzleReviewPointRepository(createDb(marketPool)), // 읽기 — 로컬 미러
                axisDeps: axisDepsOf(marketPool),
                prevClose: new DrizzleDailyCandleRepository(db), // 절대 뷰 분모 — 종목별 직전 캔들 전용 조회
            });
        },
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
        // 후보 하루 — 위 큐레이션 편집물들의 (종목,날짜) 합집합. 읽기 전용 파생이라 Store 가 없다.
        provide: CANDIDATE_DAY_REPO,
        useFactory: (pool: Pool) => new DrizzleCandidateDayRepository(createDb(pool)), // 읽기 전용 파생 → 로컬 미러
        inject: [MARKET_POOL],
    },
    {
        // 미러 당겨오기 — 읽기 소스 갱신. 상태(마지막 동기화 시각) 읽기는 상주 MARKET_POOL 재사용
        // (미러는 market 과 같은 로컬 DB) — 분당 폴링이 커넥션을 새로 만들면 안 된다.
        provide: CURATION_SYNC,
        useFactory: (pool: Pool): CurationSync => new CurationSync(pool),
        inject: [MARKET_POOL],
    },
];
