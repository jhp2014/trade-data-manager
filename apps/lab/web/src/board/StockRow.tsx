// 종목 한 줄 — grid: [순위+이름+다른 테마 칩(1fr)] [등락률 48] [누적 거래대금 46] [눕힌 캔들 28].
// 등락률·거래대금은 고정폭 우측정렬이라 줄끼리 세로가 맞는다. 좁아지면 이름·칩이 먼저 잘린다.
// 줄 사이 구분선은 없다 — 바탕(hover·선택·평면 목록 줄무늬)은 styles.css 의 .stock-row 가 칠한다.
// workbench components/board/StockRow.tsx 에서 옮겼다(테마 배정 우클릭·제외 사유·구간 막대 툴팁·큐레이션 표시는 뺐다).
import { fmtEok } from "../lib/format.js";
import { AXIS_LO, AXIS_HI, fmtRate1, type BoardStock, type OnInspect } from "./boardTypes.js";

export function StockRow({
    s,
    rank,
    selected,
    onPick,
    onInspect,
    home,
    inCard = false,
}: {
    s: BoardStock;
    rank: number | null; // null = 순위 미표시(개별/미분류)
    selected: boolean;
    onPick: (code: string) => void;
    onInspect?: OnInspect; // 우클릭 — 있으면 브라우저 메뉴 대신
    home?: string; // 카드의 테마(칩에서 뺀다). 없으면 모든 테마 칩.
    inCard?: boolean; // 테마 카드 안 — 왼쪽 선택 바를 안 그린다(카드가 이미 제 왼쪽 변을 가졌다)
}): JSX.Element {
    const up = s.changeRate >= 0;
    const chips = home ? s.themes.filter((t) => t !== home) : s.themes;
    return (
        <button
            className="stock-row"
            data-selected={selected || undefined}
            onClick={() => onPick(s.code)}
            onContextMenu={
                onInspect
                    ? (e) => {
                          e.preventDefault();
                          onInspect(s.code, { x: e.clientX, y: e.clientY });
                      }
                    : undefined
            }
            style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 48px 46px 28px",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                border: "none",
                // 안 고른 줄도 투명 바를 같은 두께로 — 선택이 옮겨 갈 때 글자가 좌우로 안 밀린다.
                borderLeft: `3px solid ${selected && !inCard ? "var(--accent-primary)" : "transparent"}`,
                padding: "3px 10px 3px 7px",
                cursor: "pointer",
                font: "inherit",
                overflow: "hidden",
            }}
        >
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {rank != null && (
                    <span
                        className="tabular"
                        style={{
                            flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, fontSize: 11, fontWeight: 700,
                            color: rank <= 3 ? "var(--accent-primary)" : "var(--text-tertiary)",
                        }}
                    >
                        {rank}
                    </span>
                )}
                {/* 굵기는 고정(600) — 선택 때 굵어지면 폭이 갈려 뒤의 칩이 밀린다. 색만 바꾼다. */}
                <span style={{ flexShrink: 1, minWidth: "3.5em", color: selected ? "var(--accent-hover)" : "var(--text-primary)", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                </span>
                {chips.length > 0 && (
                    <span style={{ display: "inline-flex", gap: 3, minWidth: 0, overflow: "hidden", flexShrink: 100 }}>
                        {chips.map((t) => (
                            <span key={t} style={{ flexShrink: 0, fontSize: 9, color: "var(--text-tertiary)", background: "var(--bg-tertiary)", borderRadius: 4, padding: "0 4px", whiteSpace: "nowrap" }}>
                                {t}
                            </span>
                        ))}
                    </span>
                )}
            </span>
            <span className="tabular" style={{ textAlign: "right", whiteSpace: "nowrap", color: up ? "var(--rise)" : "var(--fall)", fontWeight: 600, fontSize: 11 }}>
                {fmtRate1(s.changeRate)}
            </span>
            {/* 1분 신호면 값은 그대로 두고 색·굵기만 켠다. */}
            <span className="tabular" style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 11, fontWeight: s.signal ? 600 : 400, color: s.signal ? "var(--rise)" : "var(--text-tertiary)" }}>
                {fmtEok(s.amount)}
            </span>
            <Candle s={s} />
        </button>
    );
}

/** 눕힌 일봉 캔들 — 축 AXIS_LO~AXIS_HI, 폭 28px. 양봉(종가 ≥ 시가) 빨강, 음봉 파랑. */
function Candle({ s }: { s: BoardStock }): JSX.Element {
    const span = AXIS_HI - AXIS_LO;
    const x = (p: number): number => Math.max(0, Math.min(100, ((p - AXIS_LO) / span) * 100));
    const color = s.changeRate >= s.openPct ? "var(--rise)" : "var(--fall)";
    const bodyL = x(Math.min(s.openPct, s.changeRate));
    const bodyR = x(Math.max(s.openPct, s.changeRate));
    const wickL = x(s.lowPct);
    const wickR = x(s.highPct);
    return (
        <span style={{ position: "relative", width: 28, height: 14, flexShrink: 0 }}>
            <span style={{ position: "absolute", left: `${x(0)}%`, top: 0, height: "100%", width: 1, background: "var(--border-strong)" }} />
            <span style={{ position: "absolute", left: `${wickL}%`, width: `${Math.max(wickR - wickL, 0.5)}%`, top: 6, height: 2, background: color, opacity: 0.55, borderRadius: 1 }} />
            <span style={{ position: "absolute", left: `${bodyL}%`, width: `${Math.max(bodyR - bodyL, 2)}%`, top: 3, height: 8, background: color, borderRadius: 1 }} />
        </span>
    );
}
