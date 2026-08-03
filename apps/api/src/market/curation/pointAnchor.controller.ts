import { Controller, Get, Put, Delete, Inject, Query, Body, BadRequestException } from "@nestjs/common";
import { anchorParamByKey, type PointAnchor, type PointAnchorReader, type PointAnchorStore, type AnchorMarket, type PriceLineField } from "@trade-data-manager/market";
import type { UpsertPointAnchorInput } from "@trade-data-manager/wire";
import { POINT_ANCHOR_REPO } from "../tokens.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

const FIELDS = new Set<PriceLineField>(["high", "low", "open", "close"]);
const MARKETS = new Set<AnchorMarket>(["krx", "un"]);

// 타점 파라미터 앵커 CRUD — 계산 축의 입력이 되는 캔들 좌표를 타점에 이름(param) 붙여 매단다.
// param 은 코드 레지스트리 키만 허용(오타 = 조용한 결손 방지). field·market 쌍 규칙은 파라미터 정의가 강제.
@Controller("point-anchors")
export class PointAnchorController {
    constructor(@Inject(POINT_ANCHOR_REPO) private readonly repo: PointAnchorReader & PointAnchorStore) {}

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<PointAnchor[]> {
        return this.repo.listByChart(assertStockCode(code), assertYmd(date));
    }

    @Put()
    async upsert(@Body() body: UpsertPointAnchorInput): Promise<{ ok: true }> {
        const def = anchorParamByKey.get(body?.param ?? "");
        if (!def) throw new BadRequestException(`param 은 레지스트리 키만: ${[...anchorParamByKey.keys()].join("|")}`);
        // 가격 파라미터 = field+market 필수 / 시각 파라미터 = 둘 다 금지. 반쪽(field 만·market 만)은 항상 불법.
        if (def.needsPrice) {
            if (!body.field || !body.market) throw new BadRequestException(`${def.key} 는 field·market 필수(가격 앵커)`);
            if (!FIELDS.has(body.field)) throw new BadRequestException("field 는 high|low|open|close");
            if (!MARKETS.has(body.market)) throw new BadRequestException("market 은 krx|un");
        } else if (body.field != null || body.market != null) {
            throw new BadRequestException(`${def.key} 는 시각 앵커 — field·market 금지`);
        }
        await this.repo.upsert({
            stockCode: assertStockCode(body.stockCode, "stockCode"),
            date: assertYmd(body.date),
            time: assertHms(body.time),
            param: def.key,
            anchorDate: assertYmd(body.anchorDate, "anchorDate"),
            anchorTime: body.anchorTime != null ? assertHms(body.anchorTime, "anchorTime") : undefined,
            field: def.needsPrice ? body.field : undefined,
            market: def.needsPrice ? body.market : undefined,
        });
        return { ok: true };
    }

    @Delete()
    async remove(
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
        @Query("param") param?: string,
    ): Promise<{ ok: true }> {
        if (!param || !anchorParamByKey.has(param)) throw new BadRequestException("param 필수(레지스트리 키)");
        await this.repo.remove({ stockCode: assertStockCode(code), date: assertYmd(date), time: assertHms(time) }, param);
        return { ok: true };
    }
}
