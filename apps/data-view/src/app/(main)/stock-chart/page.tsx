import { StockChartClient } from "./StockChartClient";

// 정적 생성 비활성화 (URL 입력 기반 인터랙티브 페이지)
export const dynamic = "force-dynamic";

export default function StockChartPage() {
    return <StockChartClient />;
}
