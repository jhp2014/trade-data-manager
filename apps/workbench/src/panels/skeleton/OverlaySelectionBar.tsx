// 골격 겹쳐 그리기의 **선택 작업줄** — 무리를 만든 뒤에야 뜻이 생기는 손잡이들(그룹 붙이기·선택 해제·
// 붙잡은 값 떼기·원위치)이 사는 자리. 헤더가 아니라 **그림 위에 떠 있다**.
//
// 왜 헤더에서 내려왔나: 이것들은 선택 개수에 따라 뜨고 지는 것이라, 헤더에 두면 선 하나를 고를 때마다
// 컨트롤 줄의 길이와 순서가 바뀐다 — 토글을 누르러 가던 손이 매번 줄을 다시 훑어야 했다. 헤더는 "이
// 패널을 어떻게 볼까"(상태와 무관하게 늘 같은 자리)이고, 지금 고른 것에 대해 할 일은 그 대상 옆이 맞다.
// 맵 패널의 체인 작업줄이 같은 규약이다.
//
// ⚠ **우측 상단**에 둔다(맵과 같은 이유). 하단을 가로지르면 그 띠에 걸친 선·손잡이가 클릭을 뺏긴다.
// ⚠ 겉껍데기가 포인터를 안 먹게 두지 않는다 — 바탕이 있는 판이라 그 아래는 어차피 안 보인다. 대신
//   **아무것도 없으면 통째로 안 그린다**(빈 판이 그림을 가리지 않게).
import { miniBtn } from "../../components/ControlChrome.js";
import { parsePointKey, type PointRef } from "../../lib/pointKey.js";

/** 선택·핀의 개수와 그걸 비우거나 그룹으로 묶는 손잡이. */
export interface OverlaySelection {
    /** 이 패널에 실제로 있는 선택 차트 수(다른 패널에서 만든 선택엔 여기 없는 차트가 섞인다). */
    chartCount: number;
    /** 차트 선택 채널이 이 뷰의 것인가(타점 단위 뷰는 아래 타점 버튼이 문법이다). */
    chartChannelShown: boolean;
    rawChartCount: number;
    onGroupCharts: (at: { clientX: number; clientY: number }) => void;
    onClearCharts: () => void;
    pointKeys: ReadonlySet<string>;
    onGroupPoints: (points: PointRef[], label: string, at: { clientX: number; clientY: number }) => void;
    onClearPoints: () => void;
    pinnedCount: number;
    onClearPins: () => void;
}

export function OverlaySelectionBar({ selection, zoomed, onResetZoom }: {
    selection: OverlaySelection;
    zoomed: boolean;
    onResetZoom: () => void;
}): JSX.Element | null {
    const s = selection;
    const hasCharts = s.chartCount > 0;
    const canClearCharts = s.chartChannelShown && s.rawChartCount > 0;
    const hasPoints = s.pointKeys.size > 0;
    const hasPins = s.pinnedCount > 0;
    if (!hasCharts && !canClearCharts && !hasPoints && !hasPins && !zoomed) return null;

    return (
        <div
            // ⚠ Ctrl+클릭이 뒤의 사각 선택(useMarquee)으로 새지 않게 — 이 판 위에서 시작한 손짓은 이 판의 것이다.
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                position: "absolute", right: 8, top: 8, zIndex: 10, maxWidth: "calc(100% - 16px)",
                display: "flex", alignItems: "center", gap: 6, padding: "4px 7px", flexWrap: "wrap",
                background: "var(--bg-primary)", border: "1px solid var(--border-strong)", borderRadius: 7,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)", fontSize: 12,
            }}>
            {hasCharts && (
                <button onClick={(e) => s.onGroupCharts(e)} title="선택된 차트들에 그룹 붙이기/떼기 — 그룹은 그룹다" style={miniBtn}>
                    차트 {s.chartCount} 그룹
                </button>
            )}
            {canClearCharts && <button onClick={s.onClearCharts} title="차트 선택 해제" style={miniBtn}>✕</button>}
            {hasPoints && (
                <button onClick={(e) => s.onGroupPoints(
                    [...s.pointKeys].map((pk) => parsePointKey(pk)).filter((p): p is PointRef => p !== null),
                    `타점 ${s.pointKeys.size}개`, e)}
                    title="선택된 타점들에 그룹 붙이기/떼기(타점 그룹)" style={miniBtn}>
                    타점 {s.pointKeys.size} 그룹
                </button>
            )}
            {hasPoints && <button onClick={s.onClearPoints} title="타점 선택 해제" style={miniBtn}>✕</button>}
            {hasPins && <button onClick={s.onClearPins} title="붙잡아 둔 피벗 값 전부 떼기" style={miniBtn}>값 {s.pinnedCount} ✕</button>}
            {zoomed && <button onClick={onResetZoom} title="원위치(축 스트립 더블클릭도 같음)" style={miniBtn}>원위치 ⤺</button>}
        </div>
    );
}
