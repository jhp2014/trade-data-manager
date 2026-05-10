/**
 * COLUMNS 정의에서 grid-template-columns 문자열을 자동 생성한다.
 * In: hasOptions boolean  Out: CSS grid template 문자열
 * See: components/list/columns/definitions.tsx (너비 원천), EntryRow.tsx, EntryListHeader.tsx
 */
import { COLUMNS } from "@/components/list/columns/definitions";

export const OPTIONS_COLUMN_WIDTH = "200px";
export const IDENTITY_MIN_WIDTH = "320px";

export function buildMetricsGridTemplate(hasOptions: boolean): string {
    const cols = COLUMNS.map((c) => c.width);
    if (hasOptions) cols.push(OPTIONS_COLUMN_WIDTH);
    return cols.join(" ");
}
