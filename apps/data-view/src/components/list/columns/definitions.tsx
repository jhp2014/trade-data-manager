/**
 * EntryRow 컬럼 정의 배열. 이 파일 하나를 수정하면 헤더·셀·너비·정렬이 함께 바뀐다.
 * In: StockMetricsDTO  Out: ReactNode (렌더), grid-template-columns (너비)
 * See: docs/adding-entry-column.md, lib/columns/gridTemplate.ts, EntryListHeader.tsx
 */
import type { ColumnDef } from "./types";
import { MetricChangeRate, MetricDayHigh, MetricAmount, MetricDayCandle } from "./renderers";

export const COLUMNS: ColumnDef[] = [
    {
        id: "dayCandle",
        label: "캔들",
        description: "당일 가격 흐름 (스케일: -5% ~ +30%, 점=현재가, 선=당일 고가)",
        width: "80px",
        align: "right",
        render: (m) => (
            <MetricDayCandle closeRate={m.closeRate} dayHighRate={m.dayHighRate} />
        ),
    },
    {
        id: "changeRate",
        label: "등락률",
        description: "장 마감 기준 전일 대비 등락률 (%)",
        width: "100px",
        align: "right",
        render: (m) => <MetricChangeRate value={m.closeRate} />,
        sortKey: (m) => m.closeRate,
    },
    {
        id: "dayHigh",
        label: "고가/회복/경과",
        description: "장중 고가 등락률 / 고점 대비 풀백 / 고점 경과 분",
        width: "120px",
        align: "right",
        render: (m) => (
            <MetricDayHigh
                dayHighRate={m.dayHighRate}
                pullback={m.pullbackFromHigh}
                minutesSince={m.minutesSinceDayHigh}
            />
        ),
        sortKey: (m) => m.dayHighRate,
    },
    {
        id: "amount",
        label: "거래대금",
        description: "누적 거래대금 / 현재 분봉 거래대금",
        width: "120px",
        align: "right",
        render: (m, ctx) => (
            <MetricAmount
                cumulative={m.cumulativeAmount}
                tradeTime={ctx.tradeTime}
            />
        ),
    },
];
