// 차트 앵커 유스케이스 — **쓰기 불변식의 유일한 자리**(DailyComments·ThemeAssignment 와 같은 계층).
//
// 왜 컨트롤러가 아닌가: 도메인 주석들이 "단일 보장은 저장 경로의 몫"이라 말하는데, 그 저장 경로가 HTTP
// 컨트롤러면 다른 호출자(타점 삭제 경로·미래의 import 도구)가 repo 를 직접 불러 불변식을 통째로 우회한다 —
// 실제로 타점 삭제의 앵커 동반 삭제가 reviewPoint 컨트롤러에 따로 살았고, 그게 이 클래스를 만든 계기다.
// 컨트롤러는 HTTP 경계 검증(형식)과 400 매핑만 하고 여기로 넘긴다.
//
// 소유 규칙(여기가 강제):
//  ① param 은 레지스트리 키만 ② 행 단위 규칙(anchorInputError: owner grain·field⇔market·candles·분봉=un)
//  ③ 단일 param(multiple:false)은 교체 ④ 타점 삭제 시 그 시각 소유 앵커 동반 삭제(FK 를 뺀 대가).
// (옛 골격 집합 규칙 — skeletonSetError — 은 골격 param 은퇴와 함께 제거.)
import { BadRequestException } from "@nestjs/common";
import {
    ANCHOR_FIELDS,
    ANCHOR_MARKETS,
    anchorInputError,
    anchorParamByKey,
    type AnchorField,
    type AnchorMarket,
    type ChartAnchor,
    type ChartAnchorReader,
    type ChartAnchorStore,
    type NewChartAnchor,
    type ReviewPointStore,
} from "@trade-data-manager/market";

// 허용값은 도메인 런타임 목록에서 파생 — 값이 늘 때 여기를 빠뜨리는 사고가 없다(단일 출처).
const FIELDS = new Set<AnchorField>(ANCHOR_FIELDS);
const MARKETS = new Set<AnchorMarket>(ANCHOR_MARKETS);

export class ChartAnchors {
    constructor(
        private readonly repo: ChartAnchorReader & ChartAnchorStore,
        /** 타점 저장소 — 규칙 ⑤(타점 삭제 cascade)가 두 저장소에 걸쳐 있어 여기서 순서를 소유한다. */
        private readonly points: ReviewPointStore,
    ) {}

    /** 앵커 추가 — 규칙 ①~④ 전부 통과 후 저장. 같은 좌표 재추가는 멱등(기존 행 반환). 위반은 400. */
    async add(input: NewChartAnchor): Promise<ChartAnchor> {
        const def = anchorParamByKey.get(input.param);
        if (!def) throw new BadRequestException(`param 은 레지스트리 키만: ${[...anchorParamByKey.keys()].join("|")}`);
        if (input.field != null && !FIELDS.has(input.field)) throw new BadRequestException("field 는 high|low|open|close");
        if (input.market != null && !MARKETS.has(input.market)) throw new BadRequestException("market 은 krx|un");
        const ruleError = anchorInputError(def, input);
        if (ruleError) throw new BadRequestException(ruleError);

        // 단일 param(multiple:false)은 교체 — 지금 레지스트리엔 없지만, 생기면 저장이 조용히 둘을 만들지 않게 여기서 지운다.
        if (!def.multiple) await this.repo.removeByParam(input.stockCode, input.date, def.key);
        const [created] = await this.repo.add([input]);
        return created;
    }

    remove(anchor: NewChartAnchor): Promise<void> {
        return this.repo.remove(anchor);
    }

    /**
     * 타점 삭제 + 그 시각 **소유** 앵커(분봉 골격) 동반 삭제 — 규칙 ⑤.
     * chart_anchors 는 FK 를 뺐으므로(선은 타점보다 오래 산다) DB 가 cascade 해주지 않는다.
     * **앵커를 먼저 지운다**: 두 삭제 사이에서 죽어도 남는 건 "골격 없는 타점"(보이고, 다시 지우면 됨)이지
     * "주인 없는 앵커"(안 보이고 조용히 쌓임)가 아니다 — 트랜잭션 없이 순서만으로 고아 불변식이 지켜진다.
     */
    async removePoint(stockCode: string, date: string, time: string): Promise<void> {
        await this.repo.removeByPoint(stockCode, date, time);
        await this.points.remove(stockCode, date, time);
    }
}
