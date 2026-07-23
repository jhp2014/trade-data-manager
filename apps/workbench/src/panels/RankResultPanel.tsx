import { useMemo, useState, type CSSProperties } from "react";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { useWorkbench } from "../store/workbench.js";

// 결과 목록 — 필터(배치 보드 밴드)에 걸린 상황들을 행으로. 파생 MFE·MAE(전/후) + 사람 판정 outcome/type 태그를 나란히.
//  · 대시보드와 같은 useRankFilterResult 를 소비(같은 집합·같은 horizon). 종가는 표시 안 함(사용자 결정).
//  · 행 클릭 → goToPoint(차트로 실제 확인). 헤더 클릭 = 정렬.

type SortKey = "name" | "date" | "mfe" | "maePre" | "maePost" | "outcome";
const parseCode = (key: string): { code: string; date: string; time: string } => { const [code, date, time] = key.split("|"); return { code, date, time }; };

// 자유 varchar outcome → 색. 알려진 값만 색, 나머지 중립.
function outcomeColor(v?: string): string {
    if (!v) return "var(--text-tertiary)";
    if (/성공|승|익절|win|good/i.test(v)) return "#1baf7a";
    if (/실패|패|손절|loss|bad/i.test(v)) return "#e24b4a";
    return "var(--text-secondary)";
}

export function RankResultPanel(): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const r = useRankFilterResult();
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "mfe", dir: -1 });

    const rows = useMemo(() => {
        const list = r.stats.excursions.map((e) => {
            const { code, date, time } = parseCode(e.key);
            const meta = r.metaOf(e.key);
            return { e, code, date, time, name: r.nameOf(code), outcome: meta.outcome ?? "", type: meta.type ?? "" };
        });
        const val = (row: typeof list[number]): number | string => {
            switch (sort.key) {
                case "name": return row.name;
                case "date": return `${row.date} ${row.time}`;
                case "mfe": return row.e.mfe;
                case "maePre": return row.e.maePre;
                case "maePost": return row.e.maePost;
                case "outcome": return row.outcome;
            }
        };
        return list.sort((a, b) => {
            const va = val(a), vb = val(b);
            const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return c * sort.dir;
        });
    }, [r.stats.excursions, r.nameOf, r.metaOf, sort]);

    const th = (key: SortKey, label: string, align: "left" | "right" = "left"): JSX.Element => (
        <th onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
            style={{ ...thBase, textAlign: align, cursor: "pointer" }}>
            {label}{sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
        </th>
    );

    if (r.isEmpty) return <Wrap><div style={muted}>배치 보드에서 스팟을 <b>우클릭</b>해 필터 경계를 지정하면 걸린 상황이 여기 나열됩니다.</div></Wrap>;
    if (r.isLoading) return <Wrap><div style={muted}>불러오는 중…</div></Wrap>;
    if (rows.length === 0) return <Wrap><div style={muted}>이 조건에 맞는 타점이 없습니다{r.coverage > 0 ? ` (배치 ${r.coverage}건 중 밴드 교집합 0).` : "."}</div></Wrap>;

    return (
        <Wrap>
            <div style={{ padding: "5px 10px", fontSize: 11.5, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                {rows.length}건 · <span style={{ color: "var(--text-tertiary)" }}>MFE=최대상승 / MAE 전=고점 전 최저(진입손절) / 후=고점 후 최저(트레일링)</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead style={{ position: "sticky", top: 0, background: "var(--bg-secondary)", zIndex: 1 }}>
                        <tr>
                            {th("name", "종목")}
                            {th("date", "타점")}
                            {th("mfe", "MFE", "right")}
                            {th("maePre", "MAE 전", "right")}
                            {th("maePost", "MAE 후", "right")}
                            {th("outcome", "결과")}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.e.key} onClick={() => goToPoint({ date: row.date, code: row.code, time: row.time }, "rank-result")}
                                style={{ cursor: "pointer", borderBottom: "1px solid var(--border-subtle)" }}
                                onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--bg-secondary)")}
                                onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}>
                                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</td>
                                <td style={{ ...td, color: "var(--text-tertiary)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{row.date.slice(5)} {row.time.slice(0, 5)}</td>
                                <td style={{ ...tdNum, color: "#1baf7a" }}>+{row.e.mfe.toFixed(1)}</td>
                                <td style={{ ...tdNum, color: "#eb6834" }}>{row.e.maePre.toFixed(1)}</td>
                                <td style={{ ...tdNum, color: "#eb6834" }}>{row.e.maePost.toFixed(1)}</td>
                                <td style={td}>
                                    {row.outcome && <span style={{ fontSize: 11, color: outcomeColor(row.outcome) }}>{row.outcome}</span>}
                                    {row.type && <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 5 }}>{row.type}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Wrap>
    );
}

const Wrap = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>{children}</div>
);
const muted: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "16px 12px" };
const thBase: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", padding: "6px 10px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "6px 10px", color: "var(--text-primary)" };
const tdNum: CSSProperties = { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" };
