import { Controller, Get, Inject } from "@nestjs/common";
import type { SkeletonFeed } from "@trade-data-manager/wire";
import { SKELETON_SHAPES } from "../tokens.js";
import type { SkeletonShapes } from "./skeletonShapes.js";

// 골격 좌표 HTTP 어댑터 — 읽기 하나뿐(쓰기는 /chart-anchors, 골격도 앵커 행이다).
// 별도 리소스로 둔 이유: 축(/rank-axes/computed)의 하위가 아니다 — 축이 하나도 없어도 골격은 그려진다.
@Controller("skeletons")
export class SkeletonController {
    constructor(@Inject(SKELETON_SHAPES) private readonly shapes: SkeletonShapes) {}

    /** 전 타점의 골격 좌표(일봉·분봉 한 번에). 필터링은 클라 — 선택이 바뀔 때마다 왕복할 이유가 없다. */
    @Get()
    feed(): Promise<SkeletonFeed> {
        return this.shapes.feed();
    }
}
