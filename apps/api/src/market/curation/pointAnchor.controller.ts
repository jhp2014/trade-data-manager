import { Controller, Get, Put, Delete, Inject, Query, Body, BadRequestException } from "@nestjs/common";
import { anchorParamByKey, type PointAnchor, type PointAnchorReader, type PointAnchorStore, type AnchorMarket, type PriceLineField } from "@trade-data-manager/market";
import type { PutPointAnchorInput } from "@trade-data-manager/wire";
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
    async put(@Body() body: PutPointAnchorInput): Promise<{ ok: true }> {
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
        try {
            // 다중성은 파라미터의 성질 — 저장소는 레지스트리를 모르고, 여기서 replace 로 번역한다.
            await this.repo.put(
                {
                    stockCode: assertStockCode(body.stockCode, "stockCode"),
                    date: assertYmd(body.date),
                    time: assertHms(body.time),
                    param: def.key,
                    anchorDate: assertYmd(body.anchorDate, "anchorDate"),
                    anchorTime: body.anchorTime != null ? assertHms(body.anchorTime, "anchorTime") : undefined,
                    field: def.needsPrice ? body.field : undefined,
                    market: def.needsPrice ? body.market : undefined,
                },
                { replace: !def.multiple },
            );
        } catch (err) {
            // 앵커는 타점 소유 — 저장 타점이 아닌 시각이면 FK(23503)로 막힌다. 500 으로 새면 클라가 "서버 오류"로
            // 보고 원인을 못 짚는다(실제로는 사용자가 타점을 안 찍은 것) → 사유가 드러나는 400 으로.
            if ((err as { code?: string })?.code === "23503") {
                throw new BadRequestException("저장된 타점이 아닙니다 — 그 시각에 타점을 먼저 저장하세요");
            }
            throw err;
        }
        return { ok: true };
    }

    // anchorDate 를 주면 그 좌표 하나만, 생략하면 그 param 전부. 다중 param 은 좌표를 줘야 하나만 지워진다 —
    // 좌표 없는 해제를 막지는 않는다("이 param 전부 해제"는 그것대로 쓸모 있는 동작).
    @Delete()
    async remove(
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("time") time?: string,
        @Query("param") param?: string,
        @Query("anchorDate") anchorDate?: string,
        @Query("anchorTime") anchorTime?: string,
    ): Promise<{ ok: true }> {
        if (!param || !anchorParamByKey.has(param)) throw new BadRequestException("param 필수(레지스트리 키)");
        const coord =
            anchorDate != null
                ? { anchorDate: assertYmd(anchorDate, "anchorDate"), anchorTime: anchorTime != null ? assertHms(anchorTime, "anchorTime") : undefined }
                : undefined;
        await this.repo.remove({ stockCode: assertStockCode(code), date: assertYmd(date), time: assertHms(time) }, param, coord);
        return { ok: true };
    }
}
