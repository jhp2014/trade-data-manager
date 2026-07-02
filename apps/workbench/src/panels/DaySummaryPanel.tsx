import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary, type DailySnapshot, type DaySummary } from "../api/daySummary.js";

// 연동버스 실증 패널:
//  - 테마/이슈 칩 클릭 = Scope 렌즈(setTheme/setIssue) → 후보 리스트만 좁힘(차트 안 건드림). 두 축은 교집합 합성.
//  - 종목 행 클릭 = Focus(setCode) → 차트가 따라옴.
//  - 역방향: focus.code 가 속한 칩 + 해당 행을 강조(순수 selector, store 무변).
// 현재 데이터: theme 은 rich(시트 멤버십), issue 는 sparse(daily_issues 큐레이션 전).

function filteredStocks(summary: DaySummary, theme: string | null, issue: string | null): DailySnapshot[] {
    const themeSet = theme ? new Set(summary.byTheme[theme] ?? []) : null;
    const issueSet = issue ? new Set(summary.byIssue[issue] ?? []) : null;
    return summary.stocks.filter(
        (s) =>
            (!themeSet || themeSet.has(s.stockCode)) && (!issueSet || issueSet.has(s.stockCode)),
    );
}

export function DaySummaryPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const theme = useWorkbench((s) => s.scope.theme);
    const issue = useWorkbench((s) => s.scope.issue);
    const setCode = useWorkbench((s) => s.setCode);
    const setTheme = useWorkbench((s) => s.setTheme);
    const setIssue = useWorkbench((s) => s.setIssue);
    const clearScope = useWorkbench((s) => s.clearScope);

    const query = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
    });
    const summary = query.data;

    // 멤버 수 내림차순 테마(칩 정렬).
    const themesByCount = useMemo(() => {
        if (!summary) return [];
        return [...summary.themes].sort(
            (a, b) => (summary.byTheme[b]?.length ?? 0) - (summary.byTheme[a]?.length ?? 0),
        );
    }, [summary]);

    // 역방향 하이라이트: focus.code 가 속한 테마/이슈 집합.
    const codeThemes = useMemo(() => {
        if (!summary || !code) return new Set<string>();
        return new Set(summary.themes.filter((t) => (summary.byTheme[t] ?? []).includes(code)));
    }, [summary, code]);
    const codeIssues = useMemo(() => {
        if (!summary || !code) return new Set<string>();
        return new Set(summary.issues.filter((i) => (summary.byIssue[i] ?? []).includes(code)));
    }, [summary, code]);

    const rows = useMemo(
        () => (summary ? filteredStocks(summary, theme, issue) : []),
        [summary, theme, issue],
    );

    if (query.isLoading) return <Center text={`${date} 로딩중…`} />;
    if (query.isError) return <Center text={`오류: ${(query.error as Error).message}`} />;
    if (!summary) return <Center text="데이터 없음" />;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 13, color: "var(--text-primary)", background: "var(--bg-primary)" }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", marginBottom: 6 }}>
                    <span>{summary.date} · 종목 {summary.stockCount} · 보임 {rows.length}</span>
                    {(theme || issue) && (
                        <button onClick={clearScope} style={clearBtnStyle}>전체 해제</button>
                    )}
                </div>

                <ChipGroup label="테마">
                    {themesByCount.map((name) => (
                        <Chip
                            key={name}
                            label={`${name} (${(summary.byTheme[name] ?? []).length})`}
                            active={theme === name}
                            marked={codeThemes.has(name)}
                            onClick={() => setTheme(theme === name ? null : name)}
                        />
                    ))}
                    {themesByCount.length === 0 && <Muted text="테마 없음" />}
                </ChipGroup>

                <ChipGroup label="이슈">
                    {summary.issues.map((name) => (
                        <Chip
                            key={name}
                            label={`${name} (${(summary.byIssue[name] ?? []).length})`}
                            active={issue === name}
                            marked={codeIssues.has(name)}
                            onClick={() => setIssue(issue === name ? null : name)}
                        />
                    ))}
                    {summary.issues.length === 0 && <Muted text="확정 이슈 없음(큐레이션 전)" />}
                </ChipGroup>
            </div>

            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                {rows.map((s) => {
                    const selected = s.stockCode === code;
                    return (
                        <button
                            key={s.stockCode}
                            onClick={() => setCode(s.stockCode)}
                            style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "baseline",
                                width: "100%",
                                textAlign: "left",
                                border: "none",
                                borderBottom: "1px solid var(--border-subtle)",
                                padding: "5px 10px",
                                cursor: "pointer",
                                background: selected ? "var(--bg-active)" : "transparent",
                                font: "inherit",
                            }}
                        >
                            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)", width: 56 }}>
                                {s.stockCode}
                            </span>
                            <span style={{ flex: 1, color: "var(--text-primary)" }}>{s.name ?? "—"}</span>
                            {s.market && <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{s.market}</span>}
                            <span style={{ color: "var(--text-tertiary)", fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.themes.map((t) => t.theme).join("·")}
                            </span>
                        </button>
                    );
                })}
                {rows.length === 0 && <Center text="해당 조건 종목 없음" />}
            </div>
        </div>
    );
}

const clearBtnStyle: React.CSSProperties = {
    padding: "1px 7px",
    borderRadius: 10,
    border: "1px solid var(--border-default)",
    background: "var(--bg-primary)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    font: "inherit",
};

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span style={{ color: "var(--text-tertiary)", fontSize: 11, width: 30, flexShrink: 0 }}>{label}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
        </div>
    );
}

function Chip({ label, active, marked, onClick }: { label: string; active: boolean; marked?: boolean; onClick: () => void }): JSX.Element {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "2px 8px",
                borderRadius: 12,
                border: `1px solid ${active ? "var(--accent-primary)" : marked ? "var(--warning)" : "var(--border-default)"}`,
                background: active ? "var(--accent-primary)" : marked ? "var(--warning-soft)" : "var(--bg-primary)",
                color: active ? "#fff" : marked ? "var(--warning)" : "var(--text-secondary)",
                fontWeight: marked && !active ? 600 : 400,
                cursor: "pointer",
                font: "inherit",
            }}
        >
            {label}
        </button>
    );
}

function Muted({ text }: { text: string }): JSX.Element {
    return <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{text}</span>;
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: 13 }}>
            {text}
        </div>
    );
}
