// 격자 번들 — 파라미터 없음(기준선 앵커 차트 전체가 모수라 요청이 곧 "현재 상태 다오"다).
// 대사·상주 메모·튜플 인코딩은 PointGrids. 응답 압축은 main.ts 의 compression().
import { Controller, Get, Inject } from "@nestjs/common";
import type { PointGridBundle } from "@trade-data-manager/wire";
import { POINT_GRIDS } from "../tokens.js";
import { PointGrids } from "./pointGrids.js";

@Controller("point-grids")
export class PointGridController {
    constructor(@Inject(POINT_GRIDS) private readonly grids: PointGrids) {}

    @Get()
    bundle(): Promise<PointGridBundle> {
        return this.grids.bundle();
    }
}
