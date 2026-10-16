import { ACTIVE, usePanelPath } from "../store/paths.js";

// 1단계 자리 — 이 패널이 어느 경로의 어떤 상황을 보고 있는지만 보인다. 실제 내용은 단계마다 채운다.
export function PlaceholderPanel({ panelId, title, step }: { panelId: string; title: string; step: string }): JSX.Element {
    const { ref, path } = usePanelPath(panelId);
    const rows: [string, string][] = [
        ["종목", path.s.code],
        ["날짜", path.s.date],
        ["시각", path.s.time || (path.s.date ? "장 마감" : "")],
    ];
    return (
        <div style={{ height: "100%", padding: 14, boxSizing: "border-box", background: "var(--surface)", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: path.color }} />
                <b>경로 {path.id}</b>
                {ref === ACTIVE && <span style={{ color: "var(--text-3)" }}>(활성을 따라감)</span>}
            </div>
            <table style={{ borderCollapse: "collapse" }}>
                <tbody>
                    {rows.map(([k, v]) => (
                        <tr key={k}>
                            <td style={{ color: "var(--text-2)", padding: "2px 12px 2px 0" }}>{k}</td>
                            <td className="tabular">{v || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p style={{ color: "var(--text-3)", marginTop: 16 }}>
                {title} — {step}단계에서 채웁니다.
            </p>
        </div>
    );
}
