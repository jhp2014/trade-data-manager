// 기본 분봉 차트의 거래대금 pane 좌상단 고스트 칩 — **지금 타점(시간선)이 통과한 조건 그룹만** 이름으로(탐색판의 그룹 그대로).
// 시장 단면 판의 고스트 툴바와 같은 결(평소 반투명·hover 진해짐). 그룹을 안 골랐으면 아예 안 선다.
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
     * 그룹 평가를 물지 않게 — 탐색판의 rows>0 보호와 같은 몫).
     */
    active: boolean;
    /** 시간선이 표식(◇) 위인가 — 합의는 "지금 **타점**이 통과한 그룹"이라 타점 아닌 분에는 칩을 안 세운다. */
    isPoint: boolean;
}): JSX.Element | null {
    const { groupCols } = useConditionGroups(date, active);
    if (!active || !isPoint || time === null || groupCols.length === 0) return null;
    const key = cellKeyOf(code, minOfHms(time));
    // **통과한 그룹만 이름으로 선다**(2026-09-27 — 그룹이 10개까지 늘어 전부 나열하면 차트를 가로지른다).
    // 모르는 그룹(계산 중·잘림)은 이름 대신 끝의 회색 표식 하나로 — 안 보이면 "불통과"로 오독된다.
    const passed = groupCols.filter((c) => c.state.kind === "ready" && c.state.member.has(key));
    const loading = groupCols.filter((c) => c.state.kind === "loading");
    const unknown = groupCols.filter((c) => c.state.kind === "unknown");
    if (passed.length === 0 && loading.length === 0 && unknown.length === 0) return null;
    return (
        // 자리는 부모(MinuteChart amountCorner)가 준다 = **거래대금 pane 좌상단**(구분선 바로 아래). 차트 좌상단은
        // 표식 ◇ 클릭 상자·앵커 칩·크로스헤어가 사는 층이라 덮으면 개장 구간의 손이 죽고(리뷰가 잡은 자리),
        // 시간축 바로 위(옛 자리)는 눈에 안 띄었다(2026-09-29 사용자). 막대 꼭대기는 대개 비어 덜 덮는다.
        // 겉은 시장 단면 판과 같은 고스트 카드(.plane-ctl). 감싸개가 손을 안 받으므로 카드가 되받는다.
        <div className="plane-ctl" style={{
            display: "flex", alignItems: "center", gap: 7, pointerEvents: "auto",
            padding: "2px 8px", fontSize: 10.5, lineHeight: "16px", maxWidth: "100%", overflow: "hidden",
        }}>
            {passed.map((c) => (
                // 넘치면 **이름이 줄어든다**(minWidth 0 + 말줄임) — 끝의 "…"·"—N" 표식은 안 줄어 늘 보인다.
                <span key={c.setId} title={`${c.num} ${c.name} — 이 타점이 통과`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", color: c.color, minWidth: 0, flexShrink: 1 }}>
                    <span style={{ fontSize: 9, flexShrink: 0 }}>●</span>
                    {/* 돌파 요약 라벨이 이름이 되면 길다 — 차트 위 고스트 칩이 캔들을 덮지 않게 자른다(전문은 hover). */}
                    <span style={{ maxWidth: 180, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                </span>
            ))}
            {loading.length > 0 && (
                <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }} title={`계산 중: ${loading.map((c) => `${c.num} ${c.name}`).join(", ")}`}>…</span>
            )}
            {unknown.length > 0 && (
                <span style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}
                    title={unknown.map((c) => `${c.num} ${c.name} — ${c.state.kind === "unknown" ? c.state.why : ""}`).join("\n")}>—{unknown.length}</span>
            )}
        </div>
    );
}
