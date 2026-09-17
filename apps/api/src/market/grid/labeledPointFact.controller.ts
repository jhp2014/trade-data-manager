import { Controller, Get, Inject } from "@nestjs/common";
import type { LabeledPointFactBundle } from "@trade-data-manager/wire";
import { LABELED_POINT_FACTS } from "../tokens.js";
import type { LabeledPointFacts } from "./labeledPointFacts.js";

// 좌표 봉 사실 — 라벨 좌표(라벨=타점)의 종가·고가 한 벌. 즉석 계산 + 상주 메모(labeledPointFacts.ts).
@Controller("labeled-point-facts")
export class LabeledPointFactController {
    constructor(@Inject(LABELED_POINT_FACTS) private readonly facts: LabeledPointFacts) {}

    @Get()
    bundle(): Promise<LabeledPointFactBundle> {
        return this.facts.bundle();
    }
}
