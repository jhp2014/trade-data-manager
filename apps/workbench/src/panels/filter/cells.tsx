// 깔때기 다섯 칸의 이름·색·뜻 — 막대·범례·결과 머리글이 **같은 정의**를 봐야 한다.
// 색이나 문구가 한 곳만 바뀌면 사용자는 두 화면이 다른 걸 세고 있다고 읽는다.
import type { FunnelCell } from "@trade-data-manager/market/domain";
import { FAIL, GROUP_PLAIN, HOVER, IGNORED_CANDLE, STRONG } from "../../styles/palette.js";

export interface CellMeta {
    cell: FunnelCell;
    label: string;
    color: string;
    hint: string;
}

export const CELLS: CellMeta[] = [
    { cell: "survive", label: "생존", color: STRONG, hint: "이번 통과 + 상류 전부 통과" },
    { cell: "nearMiss", label: "근접 탈락", color: HOVER, hint: "이번은 통과인데 앞 필터에서 죽음 — 앞이 과했는지는 여기서만 알 수 있다" },
    { cell: "upstreamPending", label: "상류 보류", color: GROUP_PLAIN, hint: "이번 통과 + 상류에 미배치(탈락은 없음) — 배치하면 생존이 될 수도" },
    { cell: "fail", label: "이번 탈락", color: FAIL, hint: "이 필터가 떨궜다" },
    { cell: "pending", label: "이번 미배치", color: IGNORED_CANDLE, hint: "이 필터로는 판단할 재료가 없다(안 맞은 게 아니다)" },
];

/** "이번 통과 전부" — 상류 상태만 다른 세 칸. */
export const PASS_CELLS: FunnelCell[] = ["survive", "nearMiss", "upstreamPending"];

export const cellMeta = (c: FunnelCell): CellMeta => CELLS.find((x) => x.cell === c)!;

export function Legend(): JSX.Element {
    return (
        <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: "3px 12px", padding: "6px 10px", borderTop: "1px solid var(--border-subtle)", fontSize: 10.5, color: "var(--text-secondary)" }}>
            {CELLS.map(({ cell, label, color, hint }) => (
                <span key={cell} title={hint} style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: color, verticalAlign: -1, marginRight: 4 }} />
                    {label}
                </span>
            ))}
        </div>
    );
}
