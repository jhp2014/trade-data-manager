// 연동 행의 편집 손잡이 — **이 패널이 테마 조건의 유일한 편집면**이다(2026-08-29 재편).
//
// 여기 있는 것은 그 행의 파라미터 전부다 — 동료 수 · 기본순위 · 존순위 · 순위 기준(basis), 그리고
// 존 N/M 의 ±1 스테퍼. 전부 그 행의 술어를 직접 고친다(사본 없음 — 보드 요약 줄·정산이 같은 손짓에
// 따라온다).
//
// 존 N/M 이 컷선 드래그와 **겹쳐** 있는 이유: 산점의 축은 서수 선형이라 상위권(1~20위)에서 1px 가
// 여러 위를 건너뛴다. 굵게 잡는 손은 드래그, 한 위씩 다듬는 손은 여기 — 옛 보드 카드의 √ 척도 레일이
// 하던 일을 이 둘이 나눠 진다.
//
// ⚠ basis 택1 은 2026-08-28 에 "패널 헤더 컨트롤"로서 폐지된 것과 **다른 물건**이다. 그때 지운 건
// 패널이 제 상태로 들고 있던 표시 기준이었고, 이건 **연동 행의 파라미터**다(값이 술어 안에 산다).
//
// 스텝퍼가 1클릭 1커밋인 이유: 커밋마다 전 유니버스 재정산이 돈다 — 길게 누르기 반복은 없다.
import type { CSSProperties } from "react";
import type { ThemeStrengthParams } from "../../lib/themeStrength.js";

export function ThemeParamControls({ params, onPatch }: {
    params: ThemeStrengthParams;
    onPatch: (p: Partial<ThemeStrengthParams>) => void;
}): JSX.Element {
    const basisName = params.basis === "amount" ? "대금" : "등락";
    return (
        <div style={row}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>조건</span>
            <NumStep text="존 등락 ≤" value={params.zoneRateN}
                title="존 경계(등락률 서수) — 컷선 가로줄과 같은 값. 여기선 한 위씩 다듬는다"
                onStep={(d) => onPatch({ zoneRateN: Math.max(1, params.zoneRateN + d) })} />
            <NumStep text="존 대금 ≤" value={params.zoneAmountN}
                title="존 경계(거래대금 서수) — 컷선 세로줄과 같은 값. 여기선 한 위씩 다듬는다"
                onStep={(d) => onPatch({ zoneAmountN: Math.max(1, params.zoneAmountN + d) })} />
            <StepChip on={params.countOn} text="동료 ≥" value={params.countMin}
                title="존 내 테마 종목 수 ≥ x (자신 포함)"
                onToggle={() => onPatch({ countOn: !params.countOn })}
                onStep={(d) => onPatch({ countMin: Math.max(1, params.countMin + d) })} />
            <StepChip on={params.baseRankOn} text={`기본순위(${basisName}) ≤`} value={params.baseRankMax}
                title="테마 내 기본 순위 ≤ r (존 무관, 전 멤버 중)"
                onToggle={() => onPatch({ baseRankOn: !params.baseRankOn })}
                onStep={(d) => onPatch({ baseRankMax: Math.max(1, params.baseRankMax + d) })} />
            <StepChip on={params.zoneRankOn} text={`존순위(${basisName}) ≤`} value={params.zoneRankMax}
                title="테마 내 존 순위 ≤ r (존에 든 멤버 중 — 자신이 존 밖이면 불만족)"
                onToggle={() => onPatch({ zoneRankOn: !params.zoneRankOn })}
                onStep={(d) => onPatch({ zoneRankMax: Math.max(1, params.zoneRankMax + d) })} />
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                기준
                {(["rate", "amount"] as const).map((b) => (
                    <button key={b} onClick={() => params.basis !== b && onPatch({ basis: b })}
                        title="순위 조건(기본순위·존순위)이 타는 서수"
                        style={{
                            ...chip, padding: "0 7px",
                            ...(params.basis === b
                                ? { color: "var(--accent-primary)", borderColor: "var(--accent-primary)", background: "var(--accent-soft)" }
                                : {}),
                        }}>
                        {b === "amount" ? "대금" : "등락"}
                    </button>
                ))}
            </span>
        </div>
    );
}

/** 끄고 켤 수 없는 값의 스텝퍼(존 N/M) — 존은 늘 서 있다(켜짐/꺼짐이 없는 파라미터라 토글도 없다). */
function NumStep({ text, value, title, onStep }: {
    text: string;
    value: number;
    title: string;
    onStep: (delta: number) => void;
}): JSX.Element {
    return (
        <span title={title} style={{ ...chip, display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}>
            <span style={{ padding: "1px 2px 1px 7px", fontSize: 10.5 }}>{text} {value}</span>
            <span style={{ display: "inline-flex", borderLeft: "1px solid var(--border-subtle)" }}>
                <button onClick={() => onStep(-1)} title="1 줄이기" style={stepBtn}>−</button>
                <button onClick={() => onStep(1)} title="1 늘리기" style={stepBtn}>＋</button>
            </span>
        </span>
    );
}

/** 스텝퍼 칩 — 라벨 클릭 = 켜기/끄기, −/＋ = 1스텝 1커밋. */
function StepChip({ on, text, value, title, onToggle, onStep }: {
    on: boolean;
    text: string;
    value: number;
    title: string;
    onToggle: () => void;
    onStep: (delta: number) => void;
}): JSX.Element {
    return (
        <span style={{ ...chip, display: "inline-flex", alignItems: "center", gap: 4, opacity: on ? 1 : 0.55, borderStyle: on ? "solid" : "dashed", padding: 0 }}>
            <button onClick={onToggle} title={title} style={{ border: "none", background: "transparent", padding: "1px 2px 1px 7px", font: "inherit", fontSize: 10.5, color: "inherit", cursor: "pointer" }}>
                {on ? "✓" : "○"} {text} {value}
            </button>
            {on && (
                <span style={{ display: "inline-flex", borderLeft: "1px solid var(--border-subtle)" }}>
                    <button onClick={() => onStep(-1)} title="1 줄이기" style={stepBtn}>−</button>
                    <button onClick={() => onStep(1)} title="1 늘리기" style={stepBtn}>＋</button>
                </span>
            )}
        </span>
    );
}

const row: CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
    padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0,
};
// border 는 낱개 속성으로 — 활성/꺼짐 상태가 borderColor·borderStyle 만 덮는데, 축약과 섞이면 React 가 경고한다.
const chip: CSSProperties = {
    fontSize: 10.5, color: "var(--text-secondary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-default)",
    borderRadius: 8, padding: "1px 7px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
};
const stepBtn: CSSProperties = {
    border: "none", background: "transparent", padding: "1px 6px", fontSize: 10.5,
    color: "var(--text-secondary)", cursor: "pointer", lineHeight: 1.4,
};
