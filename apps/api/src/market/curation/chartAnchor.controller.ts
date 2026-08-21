import { Controller, Get, Post, Inject, Body } from "@nestjs/common";
import type { ChartAnchor, ChartAnchorReader, NewChartAnchor } from "@trade-data-manager/market";
import type { AddChartAnchorInput, RemoveChartAnchorInput } from "@trade-data-manager/wire";
import { CHART_ANCHOR_REPO, CHART_ANCHORS, COMPUTED_AXES, SKELETON_SHAPES } from "../tokens.js";
import { ChartAnchors } from "./chartAnchors.js";
import { ComputedAxes } from "../rank/computedAxes.js";
import { SkeletonShapes } from "../rank/skeletonShapes.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 차트 앵커 HTTP 어댑터 — 읽기는 repo 그대로, **쓰기는 유스케이스(ChartAnchors)** 를 거친다.
// 쓰기 불변식(레지스트리·owner grain·골격 집합 규칙·multiple 교체·타점 cascade)은 전부 유스케이스 소유 —
// 여기는 HTTP 경계 검증(형식)만 한다. 규칙이 컨트롤러에 살면 repo 를 직접 부르는 다른 경로가 전부 우회한다.
@Controller("chart-anchors")
export class ChartAnchorController {
    constructor(
        @Inject(CHART_ANCHOR_REPO) private readonly repo: ChartAnchorReader,
        @Inject(CHART_ANCHORS) private readonly anchors: ChartAnchors,
        @Inject(COMPUTED_AXES) private readonly computed: ComputedAxes,
        @Inject(SKELETON_SHAPES) private readonly skeletons: SkeletonShapes,
    ) {}

    // 전 앵커(전 param) — 클라 큐레이션 복제본의 테이블 로드. 종목명은 클라 부팅 사전(stock-master)이 붙인다.
    // (옛 /stocks — 기준선만 집계한 작업셋 목록 — 와 per-chart GET 은 복제본이 흡수하며 은퇴. 접기·필터는 클라 셀렉터의 몫.)
    @Get("all")
    listAllAnchors(): Promise<ChartAnchor[]> {
        return this.repo.listAll();
    }

    @Post()
    async add(@Body() body: AddChartAnchorInput): Promise<ChartAnchor> {
        const created = await this.anchors.add(this.assertAnchorKey(body));
        this.invalidateReadModels();
        return created;
    }

    // 삭제도 추가와 **같은 좌표 튜플**(자연키)을 받는다 — id 는 계약에서 뺐다: 읽기가 로컬 미러라
    // surrogate id 가 원격과 갈릴 수 있고, 그걸 되돌려 보내면 엉뚱한 행이 지워진다.
    // 정적 경로라 @Post() 인덱스와 구분된다.
    @Post("remove")
    async remove(@Body() body: RemoveChartAnchorInput): Promise<{ ok: true }> {
        await this.anchors.remove(this.assertAnchorKey(body));
        this.invalidateReadModels();
        return { ok: true };
    }

    /** 앵커 변경 직후 굽기 세대 상향 — 변경 **전에** 시작된 in-flight 빌드에 이후 refetch 가 합류하지 않게
     *  (파일 캐시의 지문 무효화는 다음 빌드에서 작동하지만, 이미 굽는 중인 빌드는 옛 앵커를 읽었다). */
    private invalidateReadModels(): void {
        this.computed.invalidate();
        this.skeletons.invalidate();
    }

    /** HTTP 경계 검증(형식만) — 추가·삭제가 같은 자연키 튜플을 쓰므로 파싱도 한 곳이다. */
    private assertAnchorKey(body: NewChartAnchor | undefined): NewChartAnchor {
        return {
            stockCode: assertStockCode(body?.stockCode, "stockCode"),
            date: assertYmd(body?.date),
            time: body?.time != null ? assertHms(body.time) : undefined,
            param: body?.param ?? "",
            anchorDate: assertYmd(body?.anchorDate, "anchorDate"),
            anchorTime: body?.anchorTime != null ? assertHms(body.anchorTime, "anchorTime") : undefined,
            field: body?.field,
            market: body?.market,
        };
    }
}
