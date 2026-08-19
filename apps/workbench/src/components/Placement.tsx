// 타점 배치 현황 표시 조각(순수 표현) — 작업셋/차트 행 배지 · "타점 정보" 패널 목록.
// 두 층으로 나눈 이유: 축이 많아 "어느 축에 어떻게" 를 목록/차트 옆에 상시 띄우면 다 가린다.
//   · 배지  = 개수만(n/m). 상시. 축이 많으면 실질 신호는 "0이냐 아니냐"라 0일 때만 흐리게 강조한다.
//   · 목록  = 도킹 패널(타점 정보) 안에서만. 세로를 사용자가 정하므로 미배치 축까지 담을 수 있다.
import type { CSSProperties } from "react";
import type { AxisRef } from "../lib/computedAxis.js";
import type { AxisPlacement } from "../lib/rankIndex.js";
import { heatOf } from "../styles/palette.js";

/** 배치 축 수 배지 — `3/18`. 0 이면 흐리게(미배치 타점 스캔용). */
export function PlacementBadge({ placed, total, style }: { placed: number; total: number; style?: CSSProperties }): JSX.Element {
    const none = placed === 0;
    return (
        <span
            className="tabular"
            title={none ? `미배치 (축 ${total}개)` : `${total}개 축 중 ${placed}개에 배치됨`}
            style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: none ? 400 : 600,
                color: none ? "var(--text-tertiary)" : "var(--text-secondary)",
                opacity: none ? 0.45 : 1,
                ...style,
            }}
        >
            {placed}
            <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>/{total}</span>
        </span>
    );
}

/** 한 축에서의 위치 눈금 — 얇은 트랙 + frac 위치 틱(색=강약). 시트 셀과 같은 시각 언어. */
function Track({ frac }: { frac: number }): JSX.Element {
    return (
        <span style={{ position: "relative", display: "inline-block", flex: 1, minWidth: 40, height: 10 }}>
            <span style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--border-strong)", transform: "translateY(-50%)", borderRadius: 1 }} />
            <span style={{ position: "absolute", top: "50%", left: `calc(2px + ${frac} * (100% - 4px))`, width: 3, height: 9, background: heatOf(frac), transform: "translate(-50%,-50%)", borderRadius: 2 }} />
        </span>
    );
}

/**
 * 배치 상세 목록 — 꽂힌 축(강한 순) → 구분선 → 미배치 축(접힘 기본).
 * 미배치를 접어 두는 이유: 축이 많으면 대부분이 미배치라 펼친 채로는 강점/약점 읽기를 방해한다.
 * 그래도 목록의 일부로 두는 건 "무엇을 아직 안 꽂았나" 가 곧 다음 할 일이기 때문.
 */
export function PlacementRows({
    placed,
    unplaced,
    unplacedOpen,
    onToggleUnplaced,
    onPickAxis,
}: {
    placed: AxisPlacement[];
    unplaced: AxisRef[];
    unplacedOpen: boolean;
    onToggleUnplaced: () => void;
    /** 축 클릭 → 시트의 그 열로(배치 보드는 사라졌다 — 받는 쪽은 revealRankAxis). **축 키**를 준다(이름은 시트 열 키와 안 맞는다). */
    onPickAxis?: (axisKey: string) => void;
}): JSX.Element {
    const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "0 8px", height: 20, border: "none", background: "none", font: "inherit", textAlign: "left", cursor: onPickAxis ? "pointer" : "default" };
    return (
        <div style={{ fontSize: 11 }}>
            {placed.map((it) => (
                <button key={it.axisKey} onClick={() => onPickAxis?.(it.axisKey)} title={`${it.axisName} — ${it.cell.rank}/${it.cell.total}`} style={rowStyle}>
                    <span style={{ width: 58, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{it.axisName}</span>
                    <Track frac={it.cell.frac} />
                    <span className="tabular" style={{ flexShrink: 0, width: 44, textAlign: "right", color: "var(--text-secondary)", fontWeight: 600 }}>
                        {it.cell.rank}
                        <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>/{it.cell.total}</span>
                    </span>
                </button>
            ))}
            {unplaced.length > 0 && (
                <>
                    <button
                        onClick={onToggleUnplaced}
                        style={{ ...rowStyle, cursor: "pointer", height: 18, marginTop: placed.length > 0 ? 3 : 0, borderTop: placed.length > 0 ? "1px solid var(--border-subtle)" : undefined, color: "var(--text-tertiary)", fontSize: 10 }}
                    >
                        <span>{unplacedOpen ? "▾" : "▸"} 미배치 {unplaced.length}</span>
                    </button>
                    {unplacedOpen &&
                        unplaced.map((a) => (
                            <button key={a.key} onClick={() => onPickAxis?.(a.key)} title={`${a.name} — 이 타점 미배치`} style={{ ...rowStyle, height: 18, color: "var(--text-tertiary)", opacity: 0.75 }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                            </button>
                        ))}
                </>
            )}
        </div>
    );
}
