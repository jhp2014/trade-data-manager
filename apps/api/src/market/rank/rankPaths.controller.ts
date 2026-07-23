import { Controller, Post, Inject, Body, BadRequestException } from "@nestjs/common";
import type { RankPoint } from "@trade-data-manager/market";
import type { RankPointPath } from "@trade-data-manager/wire";
import { RANK_PATHS } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";
import type { RankPaths } from "./rankPaths.js";

// 순위 필터 타점 집합 → 진입 후 인트라데이 경로(파생 읽기모델). 집합은 클라가 밴드 AND 교집합으로 만들어 보낸다.
// 저장분 아닌 임시 질의라 GET 쿼리스트링이 아니라 POST 바디(points[]). 응답은 wire 계약(RankPointPath[]).
const MAX_POINTS = 500; // 큐레이션 수동 집합이라 실사용은 수십 건. 폭주만 차단.

interface PathsBody {
    points?: Array<{ stockCode?: string; date?: string; time?: string }>;
}

@Controller("rank-paths")
export class RankPathsController {
    constructor(@Inject(RANK_PATHS) private readonly paths: RankPaths) {}

    @Post()
    async byPoints(@Body() body: PathsBody): Promise<RankPointPath[]> {
        const raw = body?.points;
        if (!Array.isArray(raw)) throw new BadRequestException("points 필수(배열)");
        if (raw.length > MAX_POINTS) throw new BadRequestException(`points 최대 ${MAX_POINTS}건`);
        const points: RankPoint[] = raw.map((p) => ({
            stockCode: assertStockCode(p?.stockCode, "stockCode"),
            date: assertYmd(p?.date),
            time: assertHms(p?.time),
        }));
        return this.paths.paths(points);
    }
}
