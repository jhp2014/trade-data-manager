// 골격 겹쳐 그리기의 **핀 작업줄** — 붙잡아 둔 피벗 값을 한 번에 떼는 자리. 헤더가 아니라 **그림 위에 떠 있다**.
//
// 왜 헤더에서 내려왔나: 이건 붙잡은 값이 있을 때만 뜨고 지는 것이라, 헤더에 두면 값 하나를 붙잡을 때마다
// 컨트롤 줄의 길이와 순서가 바뀐다 — 토글을 누르러 가던 손이 매번 줄을 다시 훑어야 했다. 헤더는 "이
// 패널을 어떻게 볼까"(상태와 무관하게 늘 같은 자리)이고, 지금 붙잡은 것에 대해 할 일은 그 대상 옆이 맞다.
//
// 옛날엔 선택(차트/타점 무리)의 그룹·해제와 확대 원위치도 여기 살았다. 다중 선택이 은퇴하면서
// (useOverlaySelection 주석) 그룹은 우클릭 하나씩이 됐고, 원위치는 **축 스트립 더블클릭**만 남겼다
// (사용자 확정 — 버튼이 그림을 가리는 값보다 못했다). 남은 건 핀 하나다.
//
// ⚠ **우측 상단**에 둔다(맵과 같은 이유). 하단을 가로지르면 그 띠에 걸친 선·손잡이가 클릭을 뺏긴다.
// ⚠ 붙잡은 값이 없으면 **통째로 안 그린다**(빈 판이 그림을 가리지 않게).
import { miniBtn } from "../../components/ControlChrome.js";

/** 붙잡은 피벗 값의 개수와 그걸 통째로 떼는 손잡이(개별 떼기는 그 값을 다시 클릭). */
export interface OverlaySelection {
    pinnedCount: number;
    onClearPins: () => void;
}

export function OverlaySelectionBar({ selection }: { selection: OverlaySelection }): JSX.Element | null {
    if (selection.pinnedCount <= 0) return null;

    return (
        <div
            // ⚠ 이 판 위에서 시작한 손짓은 이 판의 것이다 — 뒤의 그림 제스처(확대·이동)로 새지 않게.
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                position: "absolute", right: 8, top: 8, zIndex: 10, maxWidth: "calc(100% - 16px)",
                display: "flex", alignItems: "center", gap: 6, padding: "4px 7px", flexWrap: "wrap",
                background: "var(--bg-primary)", border: "1px solid var(--border-strong)", borderRadius: 7,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)", fontSize: 12,
            }}>
            <button onClick={selection.onClearPins} title="붙잡아 둔 피벗 값 전부 떼기" style={miniBtn}>값 {selection.pinnedCount} ✕</button>
        </div>
    );
}
