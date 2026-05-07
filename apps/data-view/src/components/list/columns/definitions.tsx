import type { ColumnDef } from "./types";
import { MetricChangeRate, MetricDayHigh, MetricAmount } from "./renderers";

export const COLUMNS: ColumnDef[] = [
    {
        id: "changeRate",
        label: "등락률",
        width: "100px",
        render: (m) => <MetricChangeRate value={m.closeRate} />,
        sortKey: (m) => m.closeRate,
    },
    {
        id: "dayHigh",
        label: "고가/회복/경과",
        width: "160px",
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
        width: "200px",
        render: (m, ctx) => (
            <MetricAmount
                cumulative={m.cumulativeAmount}
                currentMinute={m.currentMinuteAmount}
                tradeTime={ctx.tradeTime}
            />
        ),
    },
];

export const METRICS_GRID = COLUMNS.map((c) => c.width).join(" ");
