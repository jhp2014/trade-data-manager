// 기본 분봉 차트 좌상단 고스트 칩 — **지금 타점(시간선)이 통과한 조건 그룹**(탐색판의 그룹 그대로).
// 테마 순위 판의 고스트 툴바와 같은 결(평소 반투명·hover 진해짐). 그룹을 안 골랐으면 아예 안 선다.
// 판정·색·이름은 useConditionGroups 한 벌 — 탐색판 열과 이 칩이 다른 답을 말할 수 없다.
import { cellKeyOf } from "./exploreRows.js";
import { useConditionGroups } from "./useConditionGroups.js";

/** "HH:MM:SS" → minute-of-day. 셀 좌표의 반쪽(cellKeyOf)과 같은 자. */
const minOfHms = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

export function GroupChipCard({ code, date, time, active, isPoint }: {
    code: string;
    /** 이 차트가 보는 날짜(viewDate) — 평가도 이 날짜로 돈다. */
    date: string;
    /** 현재 시간선(HH:MM:SS). null = 시간선 없음 → 칩도 없음. */
    time: string | null;
    /**
     * 평가를 돌려도 되나 — 하루 모드 + 집합의 날짜 + **표식(합집합)이 있는 날**(빈 날 자동 스킵이
     * 그룹 5벌 평가를 물지 않게 — 탐색판의 rows>0 보호와 같은 몫).
     */
    active: boolean;
    /** 시간선이 표식(◇) 위인가 — 합의는 "지금 **타점**이 통과한 그룹"이라 타점 아닌 분에는 칩을 안 세운다. */
    isPoint: boolean;
}): JSX.Element | null {
    const { groupCols } = useConditionGroups(date, active);
    if (!active || !isPoint || time === null || groupCols.length === 0) return null;
    const key = cellKeyOf(code, minOfHms(time));
    return (
        // 자리 = **좌하단**(시간축 위) — 좌상단은 표식 ◇ 클릭 상자·앵커 칩·크로스헤어가 사는 층이라 덮으면
        // 개장 구간의 손이 죽는다(리뷰가 잡은 자리). 겉은 테마 순위 판과 같은 고스트 카드(.plane-ctl).
        <div className="plane-ctl" style={{
            position: "absolute", bottom: 28, left: 8, zIndex: 8, display: "flex", alignItems: "center", gap: 7,
            padding: "2px 8px", fontSize: 10.5, lineHeight: "16px",
        }}>
            {groupCols.map((c) => {
                const state = c.state.kind === "ready" ? (c.state.member.has(key) ? "on" : "off") : c.state.kind;
                return (
                    <span key={c.setId}
                        title={`${c.name} — ${state === "on" ? "이 타점이 통과" : state === "off" ? "이 타점은 불통과" : state === "loading" ? "계산 중" : c.state.kind === "unknown" ? c.state.why : ""}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", color: state === "on" ? c.color : "var(--text-tertiary)" }}>
                        <span style={{ fontSize: 9 }}>{state === "on" ? "●" : state === "off" ? "·" : state === "loading" ? "…" : "—"}</span>
                        {c.name}
                    </span>
                );
            })}
        </div>
    );
}
