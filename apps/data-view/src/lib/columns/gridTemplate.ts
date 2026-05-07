export const METRIC_COLUMN_WIDTHS = ["100px", "160px", "200px"] as const;
export const OPTIONS_COLUMN_WIDTH = "minmax(180px, 1fr)";
export const IDENTITY_MIN_WIDTH = "320px";

export function buildMetricsGridTemplate(hasOptions: boolean): string {
    const cols: string[] = [...METRIC_COLUMN_WIDTHS];
    if (hasOptions) cols.push(OPTIONS_COLUMN_WIDTH);
    return cols.join(" ");
}
