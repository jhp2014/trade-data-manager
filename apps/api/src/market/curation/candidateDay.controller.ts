import { Controller, Get, Inject } from "@nestjs/common";
import type { CandidateDayReader } from "@trade-data-manager/market";
import type { CandidateDay } from "@trade-data-manager/wire";
import { CANDIDATE_DAY_REPO } from "../tokens.js";

// 후보 하루 — **분석의 모수**. 손이 닿은 흔적이 하나라도 있는 (종목,날짜)의 합집합.
// 맵 계약과 분리한 이유: 후보는 맵과 무관하게 변하고(앵커 하나만 찍어도 늘어난다) 맵을 안 열어도
// 시트·깔때기가 쓴다. 읽기 전용 — 후보는 저장되는 게 아니라 다른 편집물에서 파생된다.
@Controller("candidate-days")
export class CandidateDayController {
    constructor(@Inject(CANDIDATE_DAY_REPO) private readonly repo: CandidateDayReader) {}

    /** 전체 한 번(날짜 범위 인자 없음 — 소비자가 모두 전체를 본다. 이유는 CandidateDayReader 주석). */
    @Get()
    list(): Promise<CandidateDay[]> {
        return this.repo.listCandidateDays();
    }
}
