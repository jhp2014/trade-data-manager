// 테마 보드 카드 렌더 — 이슈정리 보드(EOD)와 실시간 복기 보드가 공유(market-eye식 룩 일원화).
// 데이터 소스만 다르고(일봉 vs 시점 스냅샷) BoardStock 모양·렌더는 동일.
import { useState } from "react";
import type { DeltaHit } from "@trade-data-manager/market/domain";
import { fmtRate, fmtEok } from "../../lib/format.js";

export const AXIS_LO = -5; // 눕힌 캔들/분포 축 하한
export const AXIS_HI = 30; // 상한

// 카드 종목 표시 단계 — market-eye: 접힘(분포바만) → 주도주만 → 전체.
type ListMode = "collapsed" | "movers" | "all";

export interface BoardStock {
    code: string;
    name: string;
    market: string | null;
    themes: string[];
    changeRate: number;
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: number; // 거래대금(원) — EOD=일봉, 복기=누적
    isMover: boolean;
    /** 1분 델타 주목 신호(복기 보드만). EOD 는 없음. */
    signal?: DeltaHit | null;
}

export function ThemeCard({
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
    const [mode, setMode] = useState<ListMode>("collapsed");
    const movers = stocks.filter((s) => s.isMover || s.signal); // 신호 종목은 등락률 낮아도 주도주로 승격
    const rest = stocks.filter((s) => !(s.isMover || s.signal));
    const hot = stocks.filter((s) => s.signal).length; // 주목(1분 델타) 걸린 수
    const hasFocus = stocks.some((s) => s.code === focusCode);
    const rankOf = new Map(stocks.map((s, i) => [s.code, i + 1])); // 전체 등락률 순위 유지
    const cycle = (): void => setMode((m) => (m === "collapsed" ? "movers" : m === "movers" ? "all" : "collapsed"));
    return (
        <div
            className={hot > 0 ? "board-blink" : undefined}
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
                    {movers.length} / {stocks.length}
                </span>
                {hot > 0 && (
                    <span className="tabular" style={{ color: "var(--rise)", fontSize: 12 }} title="지금 주목(1분 델타) 종목 수">
                        🔥{hot}
                    </span>
                )}
                {parents.length > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }} title="이 테마를 포함하는 상위 테마">
                        ⊂ {parents.join(" · ")}
                    </span>
                )}
            </div>

            <DistBar stocks={stocks} mode={mode} onCycle={cycle} />

            {mode !== "collapsed" && (
                <div>
                    {movers.map((s) => (
                        <StockRow key={s.code} s={s} rank={rankOf.get(s.code)!} selected={s.code === focusCode} onPick={onPick} />
                    ))}
                    {mode === "all" &&
                        rest.map((s, i) => (
                            <StockRow
                                key={s.code}
                                s={s}
                                rank={rankOf.get(s.code)!}
                                selected={s.code === focusCode}
                                onPick={onPick}
                                boundary={i === 0 && movers.length > 0}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}

function StockRow({
    s,
    rank,
    selected,
    onPick,
    boundary,
}: {
    s: BoardStock;
    rank: number;
    selected: boolean;
    onPick: (code: string) => void;
    boundary?: boolean; // 주도주/비주도주 경계(전체 모드)
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
                borderTop: boundary ? "2px solid var(--border-strong)" : undefined,
                borderBottom: "1px solid var(--border-subtle)",
                padding: "3px 10px",
                cursor: "pointer",
                background: selected ? "var(--bg-active)" : "transparent",
                font: "inherit",
            }}
        >
            <span className="tabular" style={{ width: 18, flexShrink: 0, color: rank <= 3 ? "var(--accent-primary)" : "var(--text-tertiary)", fontSize: 11 }}>
                {rank}
            </span>
            <span style={{ width: 92, minWidth: 40, flexShrink: 1, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
            </span>
            <span className="tabular" style={{ width: 56, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap", color: up ? "var(--rise)" : "var(--fall)" }}>
                {fmtRate(s.changeRate)}
            </span>
            {/* 신호(1분 델타) 있으면 거래대금 자리를 델타로 덮음(market-eye 방식). */}
            {s.signal ? (
                <span
                    className="tabular"
                    style={{ width: 52, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap", color: "var(--rise)", fontSize: 11, fontWeight: 600 }}
                    title={`1분 델타 +${s.signal.rateDelta.toFixed(1)}%p · ${fmtEok(s.signal.tvDelta)}`}
                >
                    +{fmtEok(s.signal.tvDelta)}
                </span>
            ) : (
                <span className="tabular" style={{ width: 52, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap", color: "var(--text-tertiary)", fontSize: 11 }}>
                    {fmtEok(s.amount)}
                </span>
            )}
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

/** 분포 미니맵 — 0~AXIS_HI 범위 점. 주도주 빨강, 그 외 파랑. 클릭 = 표시단계 순환. */
function DistBar({ stocks, mode, onCycle }: { stocks: BoardStock[]; mode: ListMode; onCycle: () => void }): JSX.Element {
    const x = (r: number): number => Math.max(0, Math.min(100, (r / AXIS_HI) * 100));
    const ticks = [5, 10, 20, 30];
    const next = mode === "collapsed" ? "주도주만" : mode === "movers" ? "전체" : "접기";
    return (
        <div
            onClick={onCycle}
            title={`클릭: ${next}`}
            style={{ position: "relative", height: 16, margin: "4px 10px 2px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}
        >
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

export function BoardCenter({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: 13 }}>
            {text}
        </div>
    );
}
