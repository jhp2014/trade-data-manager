// 타점 정의 머리 — 편성 보드 안의 **읽는 줄**이다. 편집은 2026-09-07 전용 판(PointDefPanel)으로 갔다.
//
// 왜 여기 남는가: 정의는 깔때기 단이 아니라 모수 선언이라(decisions.md) 조건 목록에 섞을 수 없지만,
// 화면에서 사라져도 안 된다 — 판이 닫힌 채 게이트·자격 창이 아래 모든 숫자를 조용히 지배하는 화면이
// 되기 때문이다(T 칩을 머리에 두던 이유 그대로). 그래서 여기엔 요약과 입구만 있다.
//
// 왜 편집이 판으로 갔는가: 노브를 숫자칸이 아니라 레일로 긋기로 했고(필터 레일과 같은 이유 — "50억"이
// 몇 건을 죽이는지는 분포를 봐야 안다), 레일은 폭이 곧 해상도라 보드 머리 안에서는 눈금이 뭉갠다.
import type { QualifyWindow } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../../store/workbench.js";
import { useAutoPoints } from "../../lib/PointGridsContext.js";
import { isDefaultPointDef } from "../../lib/pointDef.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { timeOfMinutes } from "../../lib/date.js";
import { POINT_DEF } from "../../styles/palette.js";
import { POINT_DEF_PANEL_ID } from "../pointdef/pointDefPanelIds.js";

const chipStyle: React.CSSProperties = {
    fontSize: 11,
    padding: "0 6px",
    border: `1px solid ${POINT_DEF}`,
    borderRadius: 3,
    color: POINT_DEF,
    background: "transparent",
    fontWeight: 600,
};

/** 편성 보드 머리 — 시그널 수 + 정의 한 줄 요약(클릭 = 정의 판) + 기본값 되돌리기.
 *  왼쪽 POINT_DEF 띠 = 모수 선언층 표식(필터 줄이 아니라는 시각 구분 — T 레일 앰버 선례). */
export function PointDefHead(): JSX.Element {
    const def = useWorkbench((s) => s.pointDef);
    const reset = useWorkbench((s) => s.resetPointDef);
    const auto = useAutoPoints();
    const windowLabel = windowSummary(def.qualifyWindows);
    return (
        <div
            style={{
                margin: "4px 0 6px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                borderLeft: `3px solid ${POINT_DEF}`,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                padding: "3px 8px",
                fontSize: 11,
                color: "var(--text-secondary)",
            }}
            title="자동 시그널 판정 정의 — 조건(필터)이 아니라 모수 선언: 바꾸면 시그널의 존재·위치가 바뀌어 아래 전 조건의 분포가 재계산됩니다"
        >
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>타점 정의</span>
            <span
                title={auto.error ? `격자 로드 실패: ${auto.error.message}` : "현재 모수 — 이 정의가 낳는 자동 시그널 수. 깔때기 머리글의 '전체'는 표시 층위(하루/타점)의 수라 다른 자일 수 있음"}
                style={{ whiteSpace: "nowrap" }}
            >
                타점 <b style={{ color: POINT_DEF, fontWeight: 700 }}>{auto.isLoading ? "…" : auto.error ? "—" : auto.points.length.toLocaleString()}</b>
            </span>
            <button
                onClick={() => openAndFocus(POINT_DEF_PANEL_ID)}
                title={`정의 판 열기 — 게이트·자격 시각·근접을 분포 보며 조절. 현재: 돌파 ${def.baselineGateEok}억 · 재돌파 ${def.renewalGateEok}억 · 자격 시각 ${def.qualifyWindows.length === 0 ? "전체" : def.qualifyWindows.map((w) => `${timeOfMinutes(w.from)}~${timeOfMinutes(w.to)}`).join(", ")} · 근접 ${def.approachPct}% · 병합 ${def.mergeRisePct}% · ${def.bullOnly ? "양봉만" : "양봉 무관"} · 허용 T1 ${def.toleranceT1Pct}%/Δ~${def.toleranceT2Pct}% · 시뮬 −${def.sim.entry.pct}/${def.sim.stopPct}/${def.sim.takePct}%`}
                style={chipStyle}
            >
                {def.baselineGateEok}/{def.renewalGateEok}억 · {windowLabel} · 근접 {def.approachPct}%{def.bullOnly ? " · 양봉만" : ""}
            </button>
            {!isDefaultPointDef(def) && (
                <button
                    onClick={reset}
                    style={{ fontSize: 11, padding: "0 6px", border: "1px solid var(--border-default)", borderRadius: 3, color: "var(--text-secondary)" }}
                >
                    기본값
                </button>
            )}
        </div>
    );
}

/** 자격 시각 요약 — 빈 목록(= 제외 없음)은 시각을 숫자로 말하지 않는다(08:00~20:00 은 조건이 아니라
 *  세션 그 자체다). 구간이 여럿이면 첫 구간 + `+N`(칩이 한 줄을 넘기면 요약이 아니게 된다). */
function windowSummary(windows: readonly QualifyWindow[]): string {
    const first = windows[0];
    if (!first) return "시각 전체";
    const head = `${timeOfMinutes(first.from)}~${timeOfMinutes(first.to)}`;
    return windows.length > 1 ? `${head} +${windows.length - 1}` : head;
}
