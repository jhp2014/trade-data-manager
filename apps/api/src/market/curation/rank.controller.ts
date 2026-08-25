import { Controller, Get, Inject } from "@nestjs/common";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import type { ComputedAxes } from "../rank/computedAxes.js";
import { COMPUTED_AXES } from "../tokens.js";

// 계산 축 — 수식으로 나오는 축의 `타점 → 수치`. 읽기 전용이다(쓰기 = curation 입력: 앵커·타점 편집이
// ComputedAxes.invalidate 를 부른다). 옛 판단 축(축 CRUD·배치 place/unplace)은 2026-08-25 폐지 —
// 경로(`rank-axes`)는 클라 캐시 키·계약과 묶여 있어 유지한다.
@Controller("rank-axes")
export class RankController {
    constructor(@Inject(COMPUTED_AXES) private readonly computed: ComputedAxes) {}

    /**
     * 계산 축 피드 — 배치(자리·orderKey)는 만들지 않는다: 값이 있으면 순서는 정렬로 나오고,
     * 순위·백분위는 모집단(필터 결과)에 따라 달라져 클라가 질의 시점에 낸다.
     */
    @Get("computed")
    computedAxes(): Promise<ComputedAxisFeed[]> {
        return this.computed.feeds();
    }
}
