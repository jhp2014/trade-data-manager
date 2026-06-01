import { NextResponse } from "next/server";
import { loadChartPreview } from "@/lib/chart/loadChartPreview";

export const dynamic = "force-dynamic";

/**
 * GET /api/chart-preview?stockCode=...&tradeDate=...
 *
 * 차트 미리보기 데이터를 반환한다. (Server Action 대신 GET Route Handler 를 쓰는
 * 이유는 Server Action 이 호출마다 라우트를 재렌더하여 재조회 루프를 일으켰기 때문)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const stockCode = searchParams.get("stockCode");
    const tradeDate = searchParams.get("tradeDate");

    if (!stockCode || !tradeDate) {
        return NextResponse.json(
            { error: "stockCode 와 tradeDate 쿼리 파라미터가 필요합니다." },
            { status: 400 },
        );
    }

    try {
        const data = await loadChartPreview({ stockCode, tradeDate });
        return NextResponse.json(data);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
