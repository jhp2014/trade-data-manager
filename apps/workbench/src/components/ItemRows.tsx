// (종목·날짜·시각) 목록의 **표** — 깔때기 결과 목록과 맵의 공통 멤버가 글자 단위로 같은 것을 쓴다.
//
// 규칙 둘은 여기 산다(둘 다 결과 목록에서 검증된 것):
// ① **같은 (날짜·종목)은 한 덩어리로.** 타점 해상도에서는 한 차트가 여러 행이 되는데, 날짜와 이름이
//    매 행 반복되면 몇 개의 차트를 보고 있는지가 안 읽힌다. 첫 행에만 쓰고 왼쪽 세로선으로 묶는다.
// ② **행 클릭은 그 항목으로 이동.** time 이 있으면 타점, 없으면 하루(타점 없는 하루도 선택이다).
//
// 달 페이지·"찾아가기" 고정 줄처럼 **결과 목록만의 것**은 여기 없다 — 그건 그 패널의 규칙이지
// 이 표의 규칙이 아니다(맵의 좁은 칸에 달 칩을 얹으면 목록이 아니라 칩 밭이 된다).
import type { ReactNode } from "react";
import { shortDate } from "../lib/date.js";
import { groupByChart, type ItemGroup } from "../panels/filter/resultRows.js";
import { ACTIVE, ACTIVE_SOFT } from "../styles/palette.js";

export interface RowItem {
    stockCode: string;
    date: string;
    time?: string;
}

export function ItemRows({ items, showTime, nameOf, isActive, onPick, extra, activeRef }: {
    /** **정렬된** 목록을 받는다 — 묶기가 "같은 차트는 붙어 있다"를 가정한다(resultRows 머리 주석). */
    items: readonly RowItem[];
    /** 시각 열을 그릴까 — 타점 해상도일 때만. */
    showTime: boolean;
    nameOf: (code: string) => string;
    isActive?: (it: RowItem) => boolean;
    onPick: (it: RowItem) => void;
    /** 패널 고유의 마지막 열(결과 목록의 "막은 필터"). 없으면 안 그린다. */
    extra?: { header: string; width: number; render: (it: RowItem) => ReactNode };
    /** 지금 선택 행에 붙일 ref — 찾아가기 스크롤용(쓰는 쪽만 준다). */
    activeRef?: React.Ref<HTMLTableRowElement>;
}): JSX.Element {
    const groups: ItemGroup[] = groupByChart(items as never);
    return (
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
            <thead>
                <tr style={{ color: "var(--text-tertiary)", fontSize: 10.5, textAlign: "left" }}>
                    <th style={{ width: 74, fontWeight: 400, padding: "3px 10px" }}>날짜</th>
                    {showTime && <th style={{ width: 52, fontWeight: 400, padding: "3px 0" }}>시각</th>}
                    <th style={{ fontWeight: 400, padding: "3px 0" }}>종목</th>
                    {extra && <th style={{ width: extra.width, fontWeight: 400, padding: "3px 0" }}>{extra.header}</th>}
                </tr>
            </thead>
            <tbody>
                {groups.map((g) => g.items.map((it, i) => {
                    const active = isActive?.(it) ?? false;
                    const tied = g.items.length > 1; // 한 차트에 타점 여럿 — 세로선으로 묶는다
                    return (
                        <tr key={`${g.key}|${it.time ?? ""}`} ref={active ? activeRef : undefined}
                            onClick={() => onPick(it)}
                            style={{
                                // 덩어리 안쪽 행은 위 선을 없애 한 블록으로 보이게 한다.
                                borderTop: i === 0 ? "1px solid var(--border-subtle)" : "none",
                                background: active ? ACTIVE_SOFT : "transparent",
                                cursor: "pointer",
                            }}>
                            <td style={{
                                padding: "3px 10px", color: "var(--text-secondary)",
                                borderLeft: active ? `2px solid ${ACTIVE}` : tied ? "2px solid var(--border-default)" : "2px solid transparent",
                            }}>
                                {i === 0 ? shortDate(it.date) : ""}
                            </td>
                            {showTime && (
                                <td style={{ padding: "3px 0", color: active ? ACTIVE : "var(--accent-primary)", fontWeight: active ? 700 : 400 }}>
                                    {it.time?.slice(0, 5) ?? "—"}
                                </td>
                            )}
                            <td style={{ padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? 700 : 400 }}>
                                {i === 0 ? nameOf(it.stockCode) : ""}
                            </td>
                            {extra && (
                                <td style={{ padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {extra.render(it)}
                                </td>
                            )}
                        </tr>
                    );
                }))}
            </tbody>
        </table>
    );
}
