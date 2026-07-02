import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { useDayModel } from "../lib/useDayCharts.js";
import { snapshotAt } from "../lib/boardSnapshot.js";
import { stocksByTheme, themeParents } from "../lib/themeBoard.js";
import { fmtRate, fmtEok } from "../lib/format.js";

// market-eye식 테마보드(EOD) — 테마카드에 등락률 랭킹 + 눕힌 캔들 + 분포 미니맵 + 포함관계.
// 데이터: 테마 멤버십=day-summary(byTheme), 지표=day-charts 프리컴퓨트 스냅샷(t=장마감), code로 조인.
// 종목 클릭 → setCode(Focus) → 차트 따라옴. (즐겨찾기/숨김/NavRail/리플레이 스크러버는 후속)

const MOVER_PCT = 5; // 주도주 경계(등락률 %)
const AXIS_LO = -5; // 눕힌 캔들/분포 축 하한
const AXIS_HI = 30; // 상한

interface BoardStock {
    code: string;
    name: string;
    market: string | null;
    themes: string[];
    changeRate: number;
    openPct: number;
    highPct: number;
    lowPct: number;
    cumAmount: number;
    isMover: boolean;
}

export function ThemeBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);

    const summaryQ = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
        staleTime: Infinity,
    });
    const { model, isLoading: chartsLoading, isError: chartsError } = useDayModel(date);

    // 스냅샷(EOD) 조인 → 테마별 로스터 + 포함관계.
    const board = useMemo(() => {
        if (!summaryQ.data || !model) return null;
        const t = model.endTime;
        const stocks: BoardStock[] = [];
        for (const s of summaryQ.data.stocks) {
            if (s.themes.length === 0) continue; // 카드는 테마 있는 종목만
            const series = model.byCode.get(s.stockCode);
            const snap = series ? snapshotAt(series, t) : null;
            if (!snap) continue;
            stocks.push({
                code: s.stockCode,
                name: s.name ?? s.stockCode,
                market: s.market,
                themes: s.themes.map((x) => x.theme),
                changeRate: snap.rate,
                openPct: snap.openPct,
                highPct: snap.highPct,
                lowPct: snap.lowPct,
                cumAmount: snap.cumAmount,
                isMover: snap.rate >= MOVER_PCT,
            });
        }
        const byTheme = stocksByTheme(stocks);
        const parents = themeParents(byTheme);
        // ≥2 멤버 테마만 카드. 정렬: 주도주 수 → 전체 수 → 이름.
        const cards = [...byTheme.entries()]
            .filter(([, list]) => list.length >= 2)
            .sort((a, b) => {
                const ma = a[1].filter((s) => s.isMover).length;
                const mb = b[1].filter((s) => s.isMover).length;
                return mb - ma || b[1].length - a[1].length || a[0].localeCompare(b[0], "ko");
            });
        return { cards, parents };
    }, [summaryQ.data, model]);

    if (summaryQ.isLoading || chartsLoading) return <Center text={`${date} 로딩중… (당일 전체 분봉)`} />;
    if (summaryQ.isError) return <Center text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (chartsError) return <Center text="차트 데이터 오류" />;
    if (!board) return <Center text="데이터 없음" />;

    return (
        <div style={{ height: "100%", overflowY: "auto", background: "var(--bg-secondary)" }}>
            <div style={{ padding: "8px 10px", color: "var(--text-secondary)", fontSize: 12 }}>
                {date} · 테마 {board.cards.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 8px 10px" }}>
                {board.cards.map(([theme, list]) => (
                    <ThemeCard
                        key={theme}
                        theme={theme}
                        stocks={list}
                        parents={board.parents.get(theme) ?? []}
                        focusCode={code}
                        onPick={setCode}
                    />
                ))}
                {board.cards.length === 0 && <Center text="≥2 멤버 테마 없음" />}
            </div>
        </div>
    );
}

function ThemeCard({
    theme,
    stocks,
    parents,
    focusCode,
    onPick,
}: {
    theme: string;
    stocks: BoardStock[];
    parents: string[];
    focusCode: string;
    onPick: (code: string) => void;
}): JSX.Element {
    const movers = stocks.filter((s) => s.isMover).length;
    const hasFocus = stocks.some((s) => s.code === focusCode);
    return (
        <div
            style={{
                border: `1px solid ${hasFocus ? "var(--accent-primary)" : "var(--border-default)"}`,
                borderRadius: 8,
                background: "var(--bg-primary)",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--border-subtle)",
                }}
            >
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{theme}</span>
                <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 12 }} title="주도주 / 전체">
                    {movers} / {stocks.length}
                </span>
                {parents.length > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }} title="이 테마를 포함하는 상위 테마">
                        ⊂ {parents.join(" · ")}
                    </span>
                )}
            </div>

            <DistBar stocks={stocks} />

            <div>
                {stocks.map((s, i) => (
                    <StockRow key={s.code} s={s} rank={i + 1} selected={s.code === focusCode} onPick={onPick} />
                ))}
            </div>
        </div>
    );
}

function StockRow({
    s,
    rank,
    selected,
    onPick,
}: {
    s: BoardStock;
    rank: number;
    selected: boolean;
    onPick: (code: string) => void;
}): JSX.Element {
    const up = s.changeRate >= 0;
    return (
        <button
            onClick={() => onPick(s.code)}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                border: "none",
                borderBottom: "1px solid var(--border-subtle)",
                padding: "3px 10px",
                cursor: "pointer",
                background: selected ? "var(--bg-active)" : "transparent",
                font: "inherit",
            }}
        >
            <span className="tabular" style={{ width: 18, color: rank <= 3 ? "var(--accent-primary)" : "var(--text-tertiary)", fontSize: 11 }}>
                {rank}
            </span>
            <span style={{ width: 92, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
            </span>
            <span className="tabular" style={{ width: 60, textAlign: "right", color: up ? "var(--rise)" : "var(--fall)" }}>
                {fmtRate(s.changeRate)}
            </span>
            <span className="tabular" style={{ width: 52, textAlign: "right", color: "var(--text-tertiary)", fontSize: 11 }}>
                {fmtEok(s.cumAmount)}
            </span>
            <Candle s={s} />
        </button>
    );
}

/** 눕힌 캔들 — 축 AXIS_LO~AXIS_HI(0%은 좌측 근처). 양봉(종가≥시가) 빨강, 음봉 파랑. */
function Candle({ s }: { s: BoardStock }): JSX.Element {
    const span = AXIS_HI - AXIS_LO;
    const x = (p: number): number => Math.max(0, Math.min(100, ((p - AXIS_LO) / span) * 100));
    const up = s.changeRate >= s.openPct;
    const color = up ? "var(--rise)" : "var(--fall)";
    const bodyL = x(Math.min(s.openPct, s.changeRate));
    const bodyR = x(Math.max(s.openPct, s.changeRate));
    const wickL = x(s.lowPct);
    const wickR = x(s.highPct);
    return (
        <span style={{ position: "relative", flex: 1, height: 12, minWidth: 60 }}>
            <span style={{ position: "absolute", left: `${x(0)}%`, top: 0, bottom: 0, width: 1, background: "var(--border-strong)" }} />
            <span style={{ position: "absolute", left: `${wickL}%`, width: `${Math.max(wickR - wickL, 0.5)}%`, top: 5, height: 2, background: color, opacity: 0.6 }} />
            <span style={{ position: "absolute", left: `${bodyL}%`, width: `${Math.max(bodyR - bodyL, 1.5)}%`, top: 2, height: 8, background: color, borderRadius: 1 }} />
        </span>
    );
}

/** 분포 미니맵 — 0~AXIS_HI 범위 점. 주도주 빨강, 그 외 파랑. */
function DistBar({ stocks }: { stocks: BoardStock[] }): JSX.Element {
    const x = (r: number): number => Math.max(0, Math.min(100, (r / AXIS_HI) * 100));
    const ticks = [5, 10, 20, 30];
    return (
        <div style={{ position: "relative", height: 16, margin: "4px 10px 2px", borderBottom: "1px solid var(--border-subtle)" }}>
            {ticks.map((t) => (
                <span key={t} style={{ position: "absolute", left: `${x(t)}%`, bottom: 0, top: 0, width: 1, background: "var(--border-subtle)" }} />
            ))}
            {stocks
                .filter((s) => s.changeRate >= 0 && s.changeRate <= AXIS_HI)
                .map((s) => (
                    <span
                        key={s.code}
                        title={`${s.name} ${fmtRate(s.changeRate)}`}
                        style={{
                            position: "absolute",
                            left: `${x(s.changeRate)}%`,
                            top: 5,
                            width: 5,
                            height: 5,
                            marginLeft: -2.5,
                            borderRadius: "50%",
                            background: s.isMover ? "var(--rise)" : "var(--fall)",
                            opacity: 0.7,
                        }}
                    />
                ))}
        </div>
    );
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: 13 }}>
            {text}
        </div>
    );
}
